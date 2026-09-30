import { and, eq, lte } from "drizzle-orm";
import { db } from "$/db";
import { authsTable } from "$/db/schema";
import { SESSION_DAYS } from "$/env";

type CacheEntry = {
  token: string;
  userId: number;
  expiresAt: Date;
};

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
      .where(eq(authsTable.state, "active"));

    const now = new Date();
    for (const row of rows) {
      if (row.expiresAt > now) this.#add(row);
    }
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
      device: "unknown",
      ip: opts?.ip ?? null,
      details: opts?.userAgent ? { userAgent: opts.userAgent } : null,
      expiresAt,
    });
    const entry: CacheEntry = { token, userId, expiresAt };
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

  extendToken(token: string): Date | null {
    const e = this.#cache.get(token);
    if (!e) return null;
    e.expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    db.update(authsTable)
      .set({ expiresAt: e.expiresAt })
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
  }

  /** Revoke every session of a user, optionally keeping one (password change/reset). */
  async revokeAllForUser(userId: number, keepToken?: string) {
    const tokens = [...(this.#userTokens.get(userId) ?? [])].filter(
      (t) => t !== keepToken,
    );
    for (const t of tokens) await this.revokeToken(t);
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
