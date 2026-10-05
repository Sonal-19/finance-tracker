export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** Any case is accepted; the server stores lowercase. */
export const normalizeUsername = (u: string) => u.trim().toLowerCase();

/** Local (instant) check mirroring the server rules; null = looks fine. */
export function usernameProblem(u: string): string | null {
  if (u.length < USERNAME_MIN || u.length > USERNAME_MAX)
    return `${USERNAME_MIN}–${USERNAME_MAX} characters`;
  if (!/^[a-z0-9_]+$/.test(u)) return "Letters, numbers and _ only";
  return null;
}
