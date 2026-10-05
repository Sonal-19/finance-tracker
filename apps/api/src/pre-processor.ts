import Elysia from "elysia";
import { IS_PROD, SESSION_DAYS } from "$/env";
import { coreAuthService } from "$/lib/services/core-auth-service";
import { userCacheService } from "$/lib/services/user-cache-service";

export const authProcessor = new Elysia({ name: "auth_processor" }).derive(
  { as: "global" },
  async ({ cookie: { token }, headers }) => {
    const authHeader = headers.authorization;
    const headerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : undefined;
    const tokenValue = token?.value || headerToken;

    // No/invalid/unknown token just resolves to a guest (auth.user = null);
    // only `protectedUser` rejects.
    if (!tokenValue || typeof tokenValue !== "string") {
      return { auth: { user: null, token: null } };
    }

    try {
      const userId = coreAuthService.validateToken(tokenValue);
      if (!userId) return { auth: { user: null, token: null } };

      const user = await userCacheService.get(userId);
      if (!user) return { auth: { user: null, token: null } };

      // Rolling expiry, at most once an hour per session: no DB write and
      // no Set-Cookie on the requests in between.
      const newExpiry = coreAuthService.extendToken(tokenValue);
      if (newExpiry)
        token?.set({
          value: tokenValue,
          path: "/",
          secure: IS_PROD,
          httpOnly: true,
          sameSite: "lax",
          expires: newExpiry,
          maxAge: SESSION_DAYS * 24 * 60 * 60,
        });

      return { auth: { user, token: tokenValue } };
    } catch (error) {
      console.error("auth middleware", error);
      return { auth: { user: null, token: null } };
    }
  },
);

export const protectedUser = new Elysia({ name: "protected_user" })
  .use(authProcessor)
  .onBeforeHandle({ as: "scoped" }, ({ auth, status }) => {
    if (!auth?.user) {
      return status(401, {
        success: false,
        message: "You must be logged in to access this route",
      });
    }
  })
  .derive({ as: "scoped" }, ({ auth, status }) => {
    if (!auth?.user) {
      return status(401, {
        success: false,
        message: "You must be logged in to access this route",
      });
    }
    return { user: auth.user, token: auth.token };
  });

/** `role = admin` only. Everyone else gets the same 404 as a route that
 * doesn't exist. */
export const protectedAdmin = new Elysia({ name: "protected_admin" })
  .use(authProcessor)
  .onBeforeHandle({ as: "scoped" }, ({ auth, status }) => {
    if (auth?.user?.role !== "admin") {
      return status(404, { success: false, message: "Not found" });
    }
  })
  .derive({ as: "scoped" }, ({ auth, status }) => {
    if (auth?.user?.role !== "admin") {
      return status(404, { success: false, message: "Not found" });
    }
    return { user: auth.user };
  });
