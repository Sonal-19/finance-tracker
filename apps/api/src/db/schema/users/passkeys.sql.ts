import { index, pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "./users.sql";

/**
 * WebAuthn credentials. A user may hold any number of them (capped by
 * SYSTEM_CONFIG.AUTH.MAX_PASSKEYS_PER_USER). `credential_id` is globally
 * unique because passkey login looks the row up by it alone, before the
 * owning user is known.
 */
export const passkeysTable = pgTable(
  "passkeys",
  (pg) => ({
    id: pg.serial("id").primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    credentialId: pg.text("credential_id").unique().notNull(),
    publicKey: pg.text("public_key").notNull(),
    algorithm: pg.text("algorithm").notNull(),
    transports: pg.jsonb("transports").$type<string[]>().notNull().default([]),
    /** Signature counter (clone detection); stays 0 for synced passkeys. */
    counter: pg.integer("counter").notNull().default(0),
    /** User-chosen label, e.g. "MacBook Touch ID". */
    title: pg.text("title").notNull(),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastUsedAt: pg.timestamp("last_used_at", { withTimezone: true }),
  }),
  (t) => [index("passkeys_user_idx").on(t.userId)],
);

export type InsertPasskey = typeof passkeysTable.$inferInsert;
export type SelectPasskey = typeof passkeysTable.$inferSelect;
