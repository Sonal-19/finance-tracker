import Elysia, { t } from "elysia";
import { PasskeyError, passkeyService } from "$/lib/services/passkey-service";
import { systemConfigService } from "$/lib/services/system-config-service";
import { fail, ok } from "$/lib/utils";
import { protectedUser } from "$/pre-processor";

/** Self-service passkey management for the logged-in user. Login with a
 * passkey is public and lives in auth-controller. */
export const passkeysController = new Elysia({
  name: "passkeys_controller",
  prefix: "/passkeys",
})
  .use(protectedUser)
  .get("/", async ({ user }) => {
    const { PASSKEY_LOGIN_ENABLED, MAX_PASSKEYS_PER_USER } =
      systemConfigService.SYSTEM_CONFIG.AUTH;
    return ok({
      passkeys: await passkeyService.listForUser(user.id),
      enabled: PASSKEY_LOGIN_ENABLED,
      /** 0 = unlimited */
      max: MAX_PASSKEYS_PER_USER,
    });
  })
  .post("/register/options", async ({ user, status }) => {
    try {
      const options = await passkeyService.beginRegistration(user.id);
      return ok({
        ...options,
        user: { id: `ft-${user.id}`, name: user.email, displayName: user.name },
      });
    } catch (err) {
      if (err instanceof PasskeyError) return status(400, fail(err.message));
      throw err;
    }
  })
  .post(
    "/register/verify",
    async ({ user, body, status }) => {
      try {
        await passkeyService.completeRegistration(
          user.id,
          body.challengeId,
          body.credential,
          body.title,
        );
        return ok(null, "Passkey added");
      } catch (err) {
        if (err instanceof PasskeyError) return status(400, fail(err.message));
        throw err;
      }
    },
    {
      body: t.Object({
        challengeId: t.String({ maxLength: 64 }),
        // Opaque WebAuthn payload: the library does the real validation.
        credential: t.Any(),
        title: t.Optional(t.String({ maxLength: 60 })),
      }),
    },
  )
  .delete(
    "/:id",
    async ({ user, params, status }) => {
      const removed = await passkeyService.remove(user.id, params.id);
      if (!removed) return status(404, fail("Passkey not found"));
      return ok(null, "Passkey removed");
    },
    { params: t.Object({ id: t.Numeric() }) },
  );
