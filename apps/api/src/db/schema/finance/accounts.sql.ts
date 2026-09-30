import { index, pgEnum, pgTable, unique } from "drizzle-orm/pg-core";
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
    isDefault: pg.boolean("is_default").notNull().default(false),
    isArchived: pg.boolean("is_archived").notNull().default(false),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [unique("accounts_user_name").on(t.userId, t.name)],
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
  (t) => [index("transfers_user_date_idx").on(t.userId, t.date)],
);

export type SelectAccount = typeof accountsTable.$inferSelect;
