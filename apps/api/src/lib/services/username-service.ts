import { db } from "$/db";
import { usersTable } from "$/db/schema";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_COOLDOWN_DAYS = 30;
/** Accepts any case; callers normalise to lowercase. */
export const USERNAME_PATTERN = "^[A-Za-z0-9_]{3,20}$";

const RESERVED = new Set([
  "admin",
  "administrator",
  "api",
  "me",
  "root",
  "support",
  "system",
  "null",
  "undefined",
  "help",
  "staff",
  "moderator",
  "tracker",
  "everyone",
]);

export const normalizeUsername = (u: string) => u.trim().toLowerCase();

/** Returns an error message, or null when the (normalised) name is valid. */
export function validateUsername(username: string): string | null {
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX)
    return `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters`;
  if (!/^[a-z0-9_]+$/.test(username))
    return "Use only letters, numbers and underscores";
  if (RESERVED.has(username)) return "That username is reserved";
  return null;
}

/** Best valid username from an email's local part (collisions handled by the caller). */
export function usernameFromEmail(email: string): string {
  let base = (email.split("@")[0] ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, USERNAME_MAX);
  if (base.length < USERNAME_MIN) base = base.padEnd(USERNAME_MIN, "_");
  return RESERVED.has(base) ? `${base}_` : base;
}

/** `base`, then `base_2`, `base_3`… until `taken` doesn't contain it. */
export function uniqueUsername(
  base: string,
  taken: { has(u: string): boolean },
) {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `_${n}`;
    const candidate = base.slice(0, USERNAME_MAX - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * In-memory username → userId map, loaded at boot (like the token cache).
 * It's a fast pre-check for availability and exact-match lookups; the unique
 * index on `users.username` stays the source of truth, so a stale cache can
 * only cost an extra 409, never a duplicate. Assumes a single API instance.
 */
class UsernameService {
  #byName = new Map<string, number>();
  #initialized: Promise<void> | null = null;

  initialize() {
    this.#initialized ??= this.#load();
    return this.#initialized;
  }

  async #load() {
    const rows = await db
      .select({ id: usersTable.id, username: usersTable.username })
      .from(usersTable);
    for (const r of rows) this.#byName.set(r.username, r.id);
    console.info(`[UsernameService] Loaded ${this.#byName.size} usernames`);
  }

  isTaken(username: string) {
    return this.#byName.has(username);
  }

  findUserId(username: string): number | null {
    return this.#byName.get(username) ?? null;
  }

  /** Record `username` for `userId`, freeing `previous` if given. */
  set(userId: number, username: string, previous?: string | null) {
    if (previous) this.#byName.delete(previous);
    this.#byName.set(username, userId);
  }
}

export const usernameService = new UsernameService();

/** Postgres unique-violation (23505), however the driver wraps it. */
export function isUniqueViolation(e: unknown) {
  const err = e as { code?: string; errno?: string; cause?: { code?: string } };
  return [err.code, err.errno, err.cause?.code].includes("23505");
}
