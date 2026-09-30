import type { Cookie } from "elysia";
import type { SelectUser } from "$/db/schema";
import { IS_PROD, SESSION_DAYS } from "$/env";
import { toRupees } from "$/lib/utils/money";
import { coreAuthService } from "./core-auth-service";

/** Issues a session token and stores it in the httpOnly `token` cookie. */
export async function startSession(
  cookie: Record<string, Cookie<unknown>>,
  userId: number,
  meta: { ip?: string | null; userAgent?: string },
) {
  const { token, expiresAt } = await coreAuthService.issueToken(userId, meta);
  cookie.token?.set({
    value: token,
    path: "/",
    secure: IS_PROD,
    httpOnly: true,
    sameSite: "lax",
    expires: expiresAt,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return token;
}

export function publicUser(user: SelectUser) {
  const { passwordHash: _passwordHash, monthlyBudget, ...rest } = user;
  return {
    ...rest,
    monthlyBudget: monthlyBudget === null ? null : toRupees(monthlyBudget),
  };
}
