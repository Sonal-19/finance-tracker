import { sql } from "drizzle-orm";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";

/**
 * An occasion that groups spending across categories (festival visit,
 * wedding, trip). At most one event per user has `activeSince` set: while
 * it does, new transactions default to it.
 */
export const eventsTable = pgTable(
  "events",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: pg.text().notNull(),
    icon: pg.text().notNull().default("party-popper"),
    color: pg.text().notNull().default("#db2777"),
    startDate: pg.date("start_date", { mode: "string" }),
    endDate: pg.date("end_date", { mode: "string" }),
    /** Optional spending budget. */
    budget: pg.bigint({ mode: "number" }),
    /** When this became the active event; null = not active. */
    activeSince: pg.timestamp("active_since", { withTimezone: true }),
    note: pg.text(),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    index("events_user_idx").on(t.userId),
    uniqueIndex("events_user_active_uq")
      .on(t.userId)
      .where(sql`${t.activeSince} is not null`),
  ],
);

export type SelectEvent = typeof eventsTable.$inferSelect;
