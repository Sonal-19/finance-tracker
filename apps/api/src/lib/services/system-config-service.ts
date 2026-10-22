import { db } from "$/db";
import {
  SYSTEM_CONFIG,
  type SystemConfig,
  systemConfigHistoryTable,
  systemConfigTable,
} from "$/db/schema";
import { applyPatch, type DeepPartial, deepMerge } from "$/lib/utils/config";

export type SystemConfigPatch = DeepPartial<SystemConfig>;

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
    const after = applyPatch(SYSTEM_CONFIG, before, patch);
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
