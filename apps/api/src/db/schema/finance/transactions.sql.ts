import { index, pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";
import { accountsTable } from "./accounts.sql";
import { categoriesTable } from "./categories.sql";
import { paymentMethodEnum, txnTypeEnum } from "./enums.sql";
import { eventsTable } from "./events.sql";
import { recurringRulesTable } from "./recurring.sql";
import { splitsTable } from "./splits.sql";

export const transactionsTable = pgTable(
  "transactions",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: txnTypeEnum("type").notNull(),
    /** Always positive, in paise. `type` carries the sign. */
    amount: pg.bigint({ mode: "number" }).notNull(),
    categoryId: pg
      .integer("category_id")
      .notNull()
      .references(() => categoriesTable.id),
    date: pg.date({ mode: "string" }).notNull(),
    /** Which account the money moved in or out of. */
    accountId: pg
      .integer("account_id")
      .notNull()
      .references(() => accountsTable.id),
    /** Optional occasion this belongs to (festival, trip, wedding…). */
    eventId: pg
      .integer("event_id")
      .references(() => eventsTable.id, { onDelete: "set null" }),
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("upi"),
    note: pg.text(),
    /** Set when entered in a foreign currency: the amount as typed (cents), its
     * currency, and the rate used. `amount` always holds the INR value. */
    originalAmount: pg.bigint("original_amount", { mode: "number" }),
    originalCurrency: pg.text("original_currency"),
    fxRate: pg.doublePrecision("fx_rate"),
    /** Set when this row is the user's own share of a split (managed by the split). */
    splitId: pg
      .integer("split_id")
      .references(() => splitsTable.id, { onDelete: "cascade" }),
    /** Set when this row is the tagged user's copy of someone else's split. */
    sharedSplitId: pg
      .integer("shared_split_id")
      .references(() => splitsTable.id, { onDelete: "cascade" }),
    recurringId: pg
      .integer("recurring_id")
      .references(() => recurringRulesTable.id, { onDelete: "set null" }),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: pg
      .timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  }),
  (t) => [
    index("transactions_user_date_idx").on(t.userId, t.date),
    index("transactions_user_category_idx").on(t.userId, t.categoryId),
    index("transactions_account_idx").on(t.accountId),
    index("transactions_event_idx").on(t.eventId),
  ],
);

export type InsertTransaction = typeof transactionsTable.$inferInsert;
export type SelectTransaction = typeof transactionsTable.$inferSelect;
