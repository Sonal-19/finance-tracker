import { eq } from "drizzle-orm";
import Elysia from "elysia";
import { db } from "$/db";
import { usersTable } from "$/db/schema";
import { IS_PROD, SESSION_DAYS } from "$/env";
import { coreAuthService } from "$/lib/services/core-auth-service";

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

      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!user) return { auth: { user: null, token: null } };

      const newExpiry = coreAuthService.extendToken(tokenValue);
      token?.set({
        value: tokenValue,
        path: "/",
        secure: IS_PROD,
        httpOnly: true,
        sameSite: "lax",
        expires: newExpiry ?? undefined,
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
