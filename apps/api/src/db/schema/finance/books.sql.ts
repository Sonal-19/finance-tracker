import { sql } from "drizzle-orm";
import { pgEnum, pgTable, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";

/**
 * `included` = the book's entries count in the user's own income/expense
 * totals (Personal, Family). `separate` = paid on someone else's behalf
 * (Office): left out of the totals and tracked as spent − received back.
 */
export const bookTotals = ["included", "separate"] as const;
export type BookTotals = (typeof bookTotals)[number];
export const bookTotalsEnum = pgEnum("book_totals", bookTotals);

/** Archived books keep their history but can't take new entries. */
export const bookStatuses = ["active", "archived"] as const;
export type BookStatus = (typeof bookStatuses)[number];
export const bookStatusEnum = pgEnum("book_status", bookStatuses);

/** A ledger that groups entries by who they were for. Every transaction is in one. */
export const booksTable = pgTable(
  "books",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: pg.text().notNull(),
    icon: pg.text().notNull().default("book-open"),
    color: pg.text().notNull().default("#7c3aed"),
    note: pg.text(),
    totals: bookTotalsEnum("totals").notNull().default("included"),
    status: bookStatusEnum("status").notNull().default("active"),
    /** When `status` became `archived`; null while active. */
    archivedAt: pg.timestamp("archived_at", { withTimezone: true }),
    /** Set on the user's one default book (when it was chosen), else null. */
    defaultSince: pg.timestamp("default_since", { withTimezone: true }),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    unique("books_user_name").on(t.userId, t.name),
    uniqueIndex("books_user_default_uq")
      .on(t.userId)
      .where(sql`${t.defaultSince} is not null`),
  ],
);

export type SelectBook = typeof booksTable.$inferSelect;
