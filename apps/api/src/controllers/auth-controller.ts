import { eq } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import { usersTable } from "$/db/schema";
import { seedDefaultAccounts } from "$/lib/services/account-service";
import { coreAuthService } from "$/lib/services/core-auth-service";
import { seedDefaultCategories } from "$/lib/services/default-categories";
import { otpService } from "$/lib/services/otp-service";
import { PasskeyError, passkeyService } from "$/lib/services/passkey-service";
import { clientIp, rateLimitService } from "$/lib/services/rate-limit-service";
import { publicUser, startSession } from "$/lib/services/session-service";
import { systemConfigService } from "$/lib/services/system-config-service";
import { fail, normalizeEmail, ok } from "$/lib/utils";
import { authProcessor } from "$/pre-processor";

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const PASSKEY_LIMIT = 30;

const tEmail = t.String({ format: "email", maxLength: 254 });
const tPassword = t.String({ minLength: 8, maxLength: 128 });
const tOtp = t.String({ pattern: "^[0-9]{6}$" });

const SIGNUPS_CLOSED = "New sign-ups are closed right now";
const registrationOpen = () =>
  systemConfigService.SYSTEM_CONFIG.AUTH.REGISTRATION_ENABLED;

async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  return user;
}

export const authController = new Elysia({
  name: "auth_controller",
  prefix: "/auth",
})
  /** The slice of SYSTEM_CONFIG the logged-out pages and app shell need. */
  .get("/config", () => {
    const { AUTH, NOTICE } = systemConfigService.SYSTEM_CONFIG;
    return ok({
      registrationEnabled: AUTH.REGISTRATION_ENABLED,
      passkeyLoginEnabled: AUTH.PASSKEY_LOGIN_ENABLED,
      notice: NOTICE.ENABLED && NOTICE.MESSAGE.trim() ? NOTICE.MESSAGE : null,
    });
  })
  .post(
    "/register/send-otp",
    async ({ body, status, request, server }) => {
      if (!registrationOpen()) return status(403, fail(SIGNUPS_CLOSED));
      if (
        !rateLimitService.hit(`otp:${clientIp(request, server)}`, 10, 3_600_000)
      )
        return status(429, fail("Too many requests. Try again later."));
      const email = normalizeEmail(body.email);
      if (await findUserByEmail(email))
        return status(409, fail("An account with this email already exists"));
      const res = await otpService.send(email, "register");
      if (!res.ok) {
        return res.reason === "cooldown"
          ? status(429, fail(`Please wait ${res.retryInSec}s before resending`))
          : status(502, fail("Could not send the email, try again"));
      }
      return ok({ email }, "Verification code sent to your email");
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 80 }),
        email: tEmail,
      }),
    },
  )
  .post(
    "/register/verify",
    async ({ body, status, cookie, headers, request, server }) => {
      if (!registrationOpen()) return status(403, fail(SIGNUPS_CLOSED));
      const email = normalizeEmail(body.email);
      if (await findUserByEmail(email))
        return status(409, fail("An account with this email already exists"));
      const check = await otpService.verify(email, "register", body.otp);
      if (!check.ok) return status(400, fail(check.message));

      const passwordHash = await Bun.password.hash(body.password);
      const user = await db.transaction(async (tx) => {
        const [u] = await tx
          .insert(usersTable)
          .values({ name: body.name.trim(), email, passwordHash })
          .returning();
        if (!u) throw new Error("user insert failed");
        await seedDefaultCategories(tx, u.id);
        await seedDefaultAccounts(tx, u.id);
        return u;
      });
      await startSession(cookie, user.id, {
        ip: clientIp(request, server),
        userAgent: headers["user-agent"],
      });
      return ok(publicUser(user), "Welcome! Your account is ready");
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 80 }),
        email: tEmail,
        otp: tOtp,
        password: tPassword,
      }),
    },
  )
  .post(
    "/login",
    async ({ body, status, cookie, headers, request, server }) => {
      const ip = clientIp(request, server);
      const key = `login:${ip}`;
      if (!rateLimitService.hit(key, LOGIN_LIMIT, LOGIN_WINDOW_MS)) {
        return status(
          429,
          fail("Too many login attempts. Try again in 15 minutes."),
        );
      }
      const user = await findUserByEmail(normalizeEmail(body.email));
      const valid =
        user && (await Bun.password.verify(body.password, user.passwordHash));
      if (!user || !valid)
        return status(403, fail("Invalid email or password"));
      rateLimitService.reset(key);

      await startSession(cookie, user.id, {
        ip,
        userAgent: headers["user-agent"],
      });
      return ok(publicUser(user), "Login successful");
    },
    {
      body: t.Object({
        email: t.String({ minLength: 3 }),
        password: t.String({ minLength: 1 }),
      }),
    },
  )
  .post("/passkey/login/options", ({ status, request, server }) => {
    if (
      !rateLimitService.hit(
        `passkey:${clientIp(request, server)}`,
        PASSKEY_LIMIT,
        LOGIN_WINDOW_MS,
      )
    )
      return status(429, fail("Too many attempts. Try again in 15 minutes."));
    try {
      return ok(passkeyService.beginLogin());
    } catch (err) {
      if (err instanceof PasskeyError) return status(403, fail(err.message));
      throw err;
    }
  })
  .post(
    "/passkey/login/verify",
    async ({ body, status, cookie, headers, request, server }) => {
      let userId: number;
      try {
        userId = await passkeyService.completeLogin(
          body.challengeId,
          body.credential,
        );
      } catch (err) {
        if (err instanceof PasskeyError) return status(403, fail(err.message));
        throw err;
      }
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!user) return status(403, fail("This passkey isn't recognised"));

      // Same session issuance as password login.
      await startSession(cookie, user.id, {
        ip: clientIp(request, server),
        userAgent: headers["user-agent"],
      });
      return ok(publicUser(user), "Login successful");
    },
    {
      body: t.Object({
        challengeId: t.String({ maxLength: 64 }),
        // Opaque WebAuthn payload: the library does the real validation.
        credential: t.Any(),
      }),
    },
  )
  .post(
    "/password/forgot",
    async ({ body, status, request, server }) => {
      if (
        !rateLimitService.hit(`otp:${clientIp(request, server)}`, 10, 3_600_000)
      )
        return status(429, fail("Too many requests. Try again later."));
      const email = normalizeEmail(body.email);
      // Same response whether or not the account exists (no email enumeration).
      if (await findUserByEmail(email)) {
        const res = await otpService.send(email, "reset_password");
        if (!res.ok && res.reason === "cooldown")
          return status(
            429,
            fail(`Please wait ${res.retryInSec}s before resending`),
          );
      }
      return ok(
        { email },
        "If that email is registered, a reset code has been sent",
      );
    },
    { body: t.Object({ email: tEmail }) },
  )
  .post(
    "/password/reset",
    async ({ body, status }) => {
      const email = normalizeEmail(body.email);
      const user = await findUserByEmail(email);
      if (!user) return status(400, fail("Incorrect code"));
      const check = await otpService.verify(email, "reset_password", body.otp);
      if (!check.ok) return status(400, fail(check.message));
      await db
        .update(usersTable)
        .set({ passwordHash: await Bun.password.hash(body.password) })
        .where(eq(usersTable.id, user.id));
      await coreAuthService.revokeAllForUser(user.id);
      return ok(null, "Password updated. Please log in");
    },
    { body: t.Object({ email: tEmail, otp: tOtp, password: tPassword }) },
  )
  .post("/logout", async ({ cookie }) => {
    if (cookie?.token?.value && typeof cookie.token.value === "string") {
      await coreAuthService.revokeToken(cookie.token.value);
    }
    cookie?.token?.remove();
    return ok(null, "Logged out successfully");
  })
  .use(authProcessor)
  .get("/me", ({ auth, status }) => {
    if (!auth?.user) return status(401, fail("Not authenticated"));
    return ok(publicUser(auth.user));
  });
