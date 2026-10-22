import { eq } from "drizzle-orm";
import { db } from "$/db";
import { USER_CONFIG, type UserConfig, userConfigTable } from "$/db/schema";
import { applyPatch, type DeepPartial, deepMerge } from "$/lib/utils/config";

export type UserConfigPatch = DeepPartial<UserConfig>;

const MAX_ENTRIES = 10_000;

/**
 * Each user's preferences (`user_config`, one JSONB row per user) merged
 * over the code defaults. Cached in memory after the first read; this
 * process is the only writer (single API instance, like the other caches).
 */
class UserConfigService {
  #cache = new Map<number, UserConfig>();

  async get(userId: number): Promise<UserConfig> {
    const hit = this.#cache.get(userId);
    if (hit) return hit;
    const [row] = await db
      .select({ config: userConfigTable.config })
      .from(userConfigTable)
      .where(eq(userConfigTable.userId, userId))
      .limit(1);
    const config = deepMerge(USER_CONFIG, row?.config);
    this.#remember(userId, config);
    return config;
  }

  async update(userId: number, patch: UserConfigPatch) {
    const after = applyPatch(USER_CONFIG, await this.get(userId), patch);
    await db
      .insert(userConfigTable)
      .values({ userId, config: after })
      .onConflictDoUpdate({
        target: userConfigTable.userId,
        set: { config: after },
      });
    this.#remember(userId, after);
    return after;
  }

  invalidate(userId: number) {
    this.#cache.delete(userId);
  }

  #remember(userId: number, config: UserConfig) {
    this.#cache.delete(userId);
    if (this.#cache.size >= MAX_ENTRIES) {
      const oldest = this.#cache.keys().next().value;
      if (oldest !== undefined) this.#cache.delete(oldest);
    }
    this.#cache.set(userId, config);
  }
}

export const userConfigService = new UserConfigService();
