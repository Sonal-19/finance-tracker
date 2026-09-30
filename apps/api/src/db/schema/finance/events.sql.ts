import { pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";

/**
 * An occasion that groups spending across categories (festival visit,
 * wedding, trip). At most one event per user is `isActive`: while it is,
 * new transactions default to it.
 */
export const eventsTable = pgTable("events", (pg) => ({
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
  /** Optional spending budget (paise). */
  budget: pg.bigint({ mode: "number" }),
  isActive: pg.boolean("is_active").notNull().default(false),
  note: pg.text(),
  createdAt: pg
    .timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}));

export type SelectEvent = typeof eventsTable.$inferSelect;
