import { pgTable } from "drizzle-orm/pg-core";
import { FX_FALLBACK_USD_INR } from "$/env";

// NOTE TO FUTURE EDITORS: this is the app's single runtime-editable config
// object. Adding a key means touching every place below, in lockstep - see
// docs/HOW_TO_ADD_SYSTEM_CONFIG_FIELD.md:
//   1. the default here (with a doc comment and the unit)
//   2. read it via `systemConfigService.SYSTEM_CONFIG`, never this export
//   3. `UpdateSystemConfigSchema` in controllers/system-config-controller.ts
//   4. a form field in apps/web/src/routes/_app/system-config.tsx
// A key left out of (3) and (4) simply isn't admin-editable and keeps the
// default below.

/** Code defaults. The live value is this merged with the `system_config`
 * row (id = 1), so a key added here needs no migration or backfill. */
export const SYSTEM_CONFIG = {
  AUTH: {
    /** when false, new sign-ups are refused (existing users still log in) */
    REGISTRATION_ENABLED: true,
    /** when true, sign-up needs a 6-digit code emailed to the new address
     * (requires SMTP in production). When false the account is created
     * straight away with no email verification. */
    REGISTRATION_OTP_REQUIRED: false,
    /** master switch for "Sign in with passkey" and for adding new
     * passkeys. Existing passkeys stay listed and removable while off. */
    PASSKEY_LOGIN_ENABLED: true,
    /** passkeys one user may register; 0 = unlimited */
    MAX_PASSKEYS_PER_USER: 0,
  },
  FX: {
    /** USD→INR rate (rupees) used only when every exchange-rate source is
     * unreachable. Defaults to the FX_FALLBACK_USD_INR env value. */
    FALLBACK_USD_INR: FX_FALLBACK_USD_INR,
  },
  /** banner shown to every logged-in user at the top of the app */
  NOTICE: {
    ENABLED: false,
    MESSAGE: "",
  },
};

export type SystemConfig = typeof SYSTEM_CONFIG;

/** Singleton: only the row with id = 1 is ever read or written. */
export const systemConfigTable = pgTable("system_config", (pg) => ({
  id: pg.integer("id").primaryKey(),
  config: pg.jsonb("config").$type<SystemConfig>().notNull(),
  updatedAt: pg
    .timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
}));
