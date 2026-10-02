import { db } from "$/db";
import {
  SYSTEM_CONFIG,
  type SystemConfig,
  systemConfigHistoryTable,
  systemConfigTable,
} from "$/db/schema";

type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export type SystemConfigPatch = DeepPartial<SystemConfig>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recursively merges `override` onto `base`, keyed on `base`'s shape, so a
 * persisted row that predates a newly added nested key doesn't wipe it out
 * (a shallow spread would replace the whole nested object with the stale
 * copy). Keys the code no longer knows about are dropped. */
function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : (override as T);
  }
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base)) {
    result[key] = deepMerge(base[key], override[key]);
  }
  return result as T;
}

/**
 * Runtime-editable config, loaded once at boot (like CoreAuthService's
 * token cache) and shared by every request from memory. The `system_config`
 * row is the source of truth; `update` writes it and swaps the cached copy.
 */
class SystemConfigService {
  #config: SystemConfig = SYSTEM_CONFIG;
  #initialized: Promise<void> | null = null;

  initialize() {
    if (this.#initialized) return this.#initialized;
    this.#initialized = this.#load();
    return this.#initialized;
  }

  async #load() {
    const [row] = await db.select().from(systemConfigTable).limit(1);
    if (!row) {
      console.info("[SystemConfigService] No saved config, using defaults");
      return;
    }
    this.#config = deepMerge(SYSTEM_CONFIG, row.config);
    console.info("[SystemConfigService] Loaded system config");
  }

  get SYSTEM_CONFIG() {
    return this.#config;
  }

  async update(patch: SystemConfigPatch, modifiedBy: number) {
    const before = this.#config;
    const after = deepMerge(before, patch);
    await db.transaction(async (tx) => {
      await tx
        .insert(systemConfigTable)
        .values({ id: 1, config: after })
        .onConflictDoUpdate({
          target: systemConfigTable.id,
          set: { config: after },
        });
      await tx
        .insert(systemConfigHistoryTable)
        .values({ modifiedBy, details: { before, after } });
    });
    this.#config = after;
    return after;
  }
}

export const systemConfigService = new SystemConfigService();
