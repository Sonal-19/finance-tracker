import { pgEnum, pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "./users.sql";

/**
 * Opaque session token table backing CoreAuthService. Tokens are random
 * strings (not JWTs) - the in-memory cache in CoreAuthService is the fast
 * path, this table is the source of truth loaded at boot.
 */
export const authStates = ["active", "revoked", "expired"] as const;
export type AuthState = (typeof authStates)[number];
export const authStateEnum = pgEnum("auth_state", authStates);

export const authsTable = pgTable("auths", (pg) => ({
  id: pg.serial("id").primaryKey(),
  userId: pg
    .integer("user_id")
    .notNull()
    .references(() => usersTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  token: pg.text("token").unique().notNull(),
  state: authStateEnum("state").notNull().default("active"),
  device: pg.text("device").notNull().default("unknown"),
  ip: pg.text("ip"),
  details: pg.jsonb("details").$type<{ userAgent?: string }>(),
  expiresAt: pg.timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: pg
    .timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}));

export type InsertAuth = typeof authsTable.$inferInsert;
export type SelectAuth = typeof authsTable.$inferSelect;
