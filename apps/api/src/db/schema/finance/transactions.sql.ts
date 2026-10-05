import { sql } from "drizzle-orm";
import { index, pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";
import { accountsTable } from "./accounts.sql";
import { booksTable } from "./books.sql";
import { categoriesTable } from "./categories.sql";
import { txnTypeEnum } from "./enums.sql";
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
    /** Which account (payment method) the money moved in or out of. */
    accountId: pg
      .integer("account_id")
      .notNull()
      .references(() => accountsTable.id),
    /** Who it was for: Personal, Family, Office… */
    bookId: pg
      .integer("book_id")
      .notNull()
      .references(() => booksTable.id),
    /** Optional occasion this belongs to (festival, trip, wedding…). */
    eventId: pg
      .integer("event_id")
      .references(() => eventsTable.id, { onDelete: "set null" }),
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
    // The ledger's main path: a user's rows newest first. `id` breaks ties so
    // `order by date desc, id desc limit n` is one backward index scan.
    index("transactions_user_date_idx").on(t.userId, t.date, t.id),
    // `type` + `amount` are in the key so an account's balance is answered
    // from the index alone (index-only scan).
    index("transactions_account_idx").on(t.accountId, t.type, t.amount),
    // Same shape for a book's spent / received totals.
    index("transactions_book_idx").on(t.bookId, t.type, t.amount),
    index("transactions_category_idx").on(t.categoryId, t.date),
    // The rest are sparse, so they only index the rows that have a value.
    // They also keep deletes/cascades on the parent off a full table scan.
    index("transactions_event_idx")
      .on(t.eventId, t.date)
      .where(sql`${t.eventId} is not null`),
    index("transactions_split_idx")
      .on(t.splitId)
      .where(sql`${t.splitId} is not null`),
    index("transactions_shared_split_idx")
      .on(t.sharedSplitId, t.userId)
      .where(sql`${t.sharedSplitId} is not null`),
    index("transactions_recurring_idx")
      .on(t.recurringId)
      .where(sql`${t.recurringId} is not null`),
  ],
);

export type InsertTransaction = typeof transactionsTable.$inferInsert;
export type SelectTransaction = typeof transactionsTable.$inferSelect;
