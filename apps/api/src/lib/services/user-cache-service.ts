import { eq, sql } from "drizzle-orm";
import { db } from "$/db";
import { type SelectUser, usersTable } from "$/db/schema";

/** How long a cached row is trusted. Bounds staleness from changes made
 * outside this process (e.g. `db:make-admin`). */
const TTL_MS = 60_000;
const MAX_ENTRIES = 10_000;

const userById = db
  .select()
  .from(usersTable)
  .where(eq(usersTable.id, sql.placeholder("id")))
  .limit(1)
  .prepare("user_by_id");

/**
 * In-memory copy of the `users` row behind each session, so an authenticated
 * request doesn't start with a `select * from users`. Every write to `users`
 * in this process must call `set` (with the updated row) or `invalidate`.
 * Assumes a single API instance, like the token and username caches.
 */
class UserCacheService {
  #cache = new Map<number, { user: SelectUser; at: number }>();

  async get(id: number): Promise<SelectUser | undefined> {
    const hit = this.#cache.get(id);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.user;
    const [user] = await userById.execute({ id });
    if (user) this.set(user);
    else this.#cache.delete(id);
    return user;
  }

  set(user: SelectUser) {
    // Oldest-first eviction: Map keeps insertion order.
    this.#cache.delete(user.id);
    if (this.#cache.size >= MAX_ENTRIES) {
      const oldest = this.#cache.keys().next().value;
      if (oldest !== undefined) this.#cache.delete(oldest);
    }
    this.#cache.set(user.id, { user, at: Date.now() });
  }

  invalidate(id: number) {
    this.#cache.delete(id);
  }
}

export const userCacheService = new UserCacheService();
