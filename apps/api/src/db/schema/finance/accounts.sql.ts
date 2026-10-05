import { sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";

/** Where money lives. Payment method (UPI, card…) is *how* it was paid. */
export const accountTypes = [
  "bank",
  "cash",
  "credit_card",
  "wallet",
  "other",
] as const;
export type AccountType = (typeof accountTypes)[number];
export const accountTypeEnum = pgEnum("account_type", accountTypes);

/** Archived accounts keep their history but can't take new entries. */
export const accountStatuses = ["active", "archived"] as const;
export type AccountStatus = (typeof accountStatuses)[number];
export const accountStatusEnum = pgEnum("account_status", accountStatuses);

export const accountsTable = pgTable(
  "accounts",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: pg.text().notNull(),
    type: accountTypeEnum("type").notNull().default("bank"),
    icon: pg.text().notNull().default("landmark"),
    color: pg.text().notNull().default("#2563eb"),
    /** Balance before the first tracked transaction (paise, may be negative for cards). */
    openingBalance: pg
      .bigint("opening_balance", { mode: "number" })
      .notNull()
      .default(0),
    status: accountStatusEnum("status").notNull().default("active"),
    /** When `status` became `archived`; null while active. */
    archivedAt: pg.timestamp("archived_at", { withTimezone: true }),
    /** Set on the user's one default account (when it was chosen), else null. */
    defaultSince: pg.timestamp("default_since", { withTimezone: true }),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    unique("accounts_user_name").on(t.userId, t.name),
    uniqueIndex("accounts_user_default_uq")
      .on(t.userId)
      .where(sql`${t.defaultSince} is not null`),
  ],
);

/** Money moved between two of the user's accounts. Not income or expense. */
export const transfersTable = pgTable(
  "transfers",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    fromAccountId: pg
      .integer("from_account_id")
      .notNull()
      .references(() => accountsTable.id),
    toAccountId: pg
      .integer("to_account_id")
      .notNull()
      .references(() => accountsTable.id),
    amount: pg.bigint({ mode: "number" }).notNull(),
    date: pg.date({ mode: "string" }).notNull(),
    note: pg.text(),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    index("transfers_user_date_idx").on(t.userId, t.date, t.id),
    // `amount` is in the key so per-account sums are index-only scans.
    index("transfers_from_account_idx").on(t.fromAccountId, t.amount),
    index("transfers_to_account_idx").on(t.toAccountId, t.amount),
  ],
);

export type SelectAccount = typeof accountsTable.$inferSelect;
