import { pgTable } from "drizzle-orm/pg-core";
import type { ShortcutMap } from "$/lib/utils/shortcuts";
import type {
  DarkStyle,
  PaletteOverrides,
  ThemeChoice,
} from "$/lib/utils/theme";
import { usersTable } from "./users.sql";

// NOTE TO FUTURE EDITORS: a user's own preferences, one JSONB row per user,
// the per-user twin of SYSTEM_CONFIG. Adding a key:
//   1. the default here (with a doc comment)
//   2. read it via `userConfigService.get(userId)`, never the raw row
//   3. `UpdateUserConfigSchema` in controllers/profile-controller.ts
//   4. a control on the web Settings page (`useUserConfig()` reads it)
// No migration: rows that predate the key get the default via `deepMerge`.

export const DASHBOARD_HEROES = ["spending", "balance"] as const;
export type DashboardHero = (typeof DASHBOARD_HEROES)[number];
export const DASHBOARD_ACCOUNTS = ["bottom", "top", "hidden"] as const;
export type DashboardAccounts = (typeof DASHBOARD_ACCOUNTS)[number];

/** Code defaults. The live value is this merged with the user's row. */
export const USER_CONFIG = {
  /** The user's own keyboard shortcut changes over the admin's defaults
   * (action id → keys, "" = off); only differences are stored. */
  SHORTCUTS: {} as Partial<ShortcutMap>,
  THEME: {
    /** What their devices show; "system" follows the OS. */
    MODE: "system" as ThemeChoice,
    /** The dark mode "system" switches to. */
    SYSTEM_DARK: "dark" as DarkStyle,
    /** "" = the admin's preset. */
    PRESET: "",
    /** Their colour changes per mode (token → "#rrggbb"). */
    LIGHT: {} as PaletteOverrides,
    DARK: {} as PaletteOverrides,
    AMOLED: {} as PaletteOverrides,
  },
  DASHBOARD: {
    /** The card on top: this month's spending, or the total balance. */
    HERO: "spending" as DashboardHero,
    /** Where the payment-method balances strip sits. */
    ACCOUNTS: "bottom" as DashboardAccounts,
  },
};

export type UserConfig = typeof USER_CONFIG;

export const userConfigTable = pgTable("user_config", (pg) => ({
  userId: pg
    .integer("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  config: pg.jsonb("config").$type<UserConfig>().notNull(),
  updatedAt: pg
    .timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
}));
