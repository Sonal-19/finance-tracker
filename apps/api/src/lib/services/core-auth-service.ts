import { and, eq, gt, inArray, lte } from "drizzle-orm";
import { db } from "$/db";
import { authsTable, pushSubscriptionsTable } from "$/db/schema";
import { SESSION_DAYS } from "$/env";
import { describeDevice } from "$/lib/utils/device";

/** A browser's push subscription belongs to the session it was made in:
 * when that session ends, the browser stops getting the account's
 * reminders. */
const dropPush = (tokens: string[]) =>
  tokens.length
    ? db
        .delete(pushSubscriptionsTable)
        .where(inArray(pushSubscriptionsTable.sessionToken, tokens))
        .execute()
        .catch(console.error)
    : undefined;

type CacheEntry = {
  token: string;
  userId: number;
  expiresAt: Date;
  /** Last time the rolling expiry was pushed out (ms); 0 = not since boot. */
  extendedAt?: number;
};

/** A session's expiry is pushed out at most this often. */
const EXTEND_EVERY_MS = 60 * 60 * 1000;

/**
 * Token cache backing all auth in this codebase — no JWTs. Tokens are
 * opaque random strings, validated with an O(1) in-memory lookup, backed
 * by the `auths` table as the source of truth (loaded at boot, written to
 * async on issue/extend/revoke so the response never waits on the DB).
 */
class CoreAuthService {
  #cache = new Map<string, CacheEntry>();
  #userTokens = new Map<number, Set<string>>();
  #initialized: Promise<void> | null = null;

  initialize() {
    if (this.#initialized) return this.#initialized;
    this.#initialized = this.#load();
    return this.#initialized;
  }

  async #load() {
    const rows = await db
      .select({
        token: authsTable.token,
        userId: authsTable.userId,
        expiresAt: authsTable.expiresAt,
      })
      .from(authsTable)
      .where(
        and(
          eq(authsTable.state, "active"),
          gt(authsTable.expiresAt, new Date()),
        ),
      );
    for (const row of rows) this.#add(row);
    const timer = setInterval(() => this.#cleanup(), 60 * 60 * 1000);
    if (typeof timer === "object" && "unref" in timer) {
      timer.unref();
    }
    console.info(`[CoreAuthService] Loaded ${this.#cache.size} active tokens`);
  }

  async issueToken(
    userId: number,
    opts?: { ip?: string | null; userAgent?: string },
  ): Promise<CacheEntry> {
    const token = this.#generate();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await db.insert(authsTable).values({
      token,
      userId,
      state: "active",
      device: describeDevice(opts?.userAgent).name,
      ip: opts?.ip ?? null,
      details: opts?.userAgent ? { userAgent: opts.userAgent } : null,
      expiresAt,
    });
    const entry: CacheEntry = {
      token,
      userId,
      expiresAt,
      extendedAt: Date.now(),
    };
    this.#add(entry);
    return entry;
  }

  validateToken(token: string): number | null {
    const e = this.#cache.get(token);
    if (!e) return null;
    if (e.expiresAt < new Date()) {
      this.#del(token);
      db.update(authsTable)
        .set({ state: "expired" })
        .where(eq(authsTable.token, token))
        .execute()
        .catch(console.error);
      return null;
    }
    return e.userId;
  }

  /** Rolls the expiry forward. Returns the new expiry, or null when the
   * session was extended recently enough that nothing changed. */
  extendToken(token: string): Date | null {
    const e = this.#cache.get(token);
    if (!e) return null;
    const now = Date.now();
    if (now - (e.extendedAt ?? 0) < EXTEND_EVERY_MS) return null;
    e.extendedAt = now;
    e.expiresAt = new Date(now + SESSION_DAYS * 86_400_000);
    db.update(authsTable)
      .set({ expiresAt: e.expiresAt, lastSeenAt: new Date(now) })
      .where(eq(authsTable.token, token))
      .execute()
      .catch(console.error);
    return e.expiresAt;
  }

  async revokeToken(token: string) {
    this.#del(token);
    await db
      .update(authsTable)
      .set({ state: "revoked" })
      .where(eq(authsTable.token, token));
    await dropPush([token]);
  }

  /** Revoke one session by its `auths.id`, only if it belongs to `userId`.
   * Returns false when there's no such live session. */
  async revokeSession(userId: number, id: number) {
    const [row] = await db
      .update(authsTable)
      .set({ state: "revoked" })
      .where(
        and(
          eq(authsTable.id, id),
          eq(authsTable.userId, userId),
          eq(authsTable.state, "active"),
        ),
      )
      .returning({ token: authsTable.token });
    if (!row) return false;
    this.#del(row.token);
    await dropPush([row.token]);
    return true;
  }

  /** Revoke every session of a user, optionally keeping one (password change/reset). */
  async revokeAllForUser(userId: number, keepToken?: string) {
    const tokens = [...(this.#userTokens.get(userId) ?? [])].filter(
      (t) => t !== keepToken,
    );
    if (!tokens.length) return;
    for (const t of tokens) this.#del(t);
    await db
      .update(authsTable)
      .set({ state: "revoked" })
      .where(inArray(authsTable.token, tokens));
    await dropPush(tokens);
  }

  #generate(): string {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    return `ft_${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;
  }

  #add(e: CacheEntry) {
    this.#cache.set(e.token, e);
    const s = this.#userTokens.get(e.userId) ?? new Set<string>();
    s.add(e.token);
    this.#userTokens.set(e.userId, s);
  }

  #del(token: string) {
    const e = this.#cache.get(token);
    if (!e) return;
    this.#cache.delete(token);
    const s = this.#userTokens.get(e.userId);
    s?.delete(token);
    if (s?.size === 0) this.#userTokens.delete(e.userId);
  }

  async #cleanup() {
    const now = new Date();
    const expired: string[] = [];
    for (const [t, e] of this.#cache) {
      if (e.expiresAt < now) expired.push(t);
    }
    for (const t of expired) this.#del(t);
    await dropPush(expired);
    if (expired.length) {
      await db
        .update(authsTable)
        .set({ state: "expired" })
        .where(
          and(eq(authsTable.state, "active"), lte(authsTable.expiresAt, now)),
        );
    }
  }
}

export const coreAuthService = new CoreAuthService();
