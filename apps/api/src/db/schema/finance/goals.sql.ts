import { pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";

export const goalsTable = pgTable("goals", (pg) => ({
  id: pg.serial().primaryKey(),
  userId: pg
    .integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  name: pg.text().notNull(),
  target: pg.bigint({ mode: "number" }).notNull(),
  targetDate: pg.date("target_date", { mode: "string" }),
  color: pg.text().notNull().default("#10b981"),
  icon: pg.text().notNull().default("piggy-bank"),
  createdAt: pg
    .timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}));

/** Money put toward (positive) or taken out of (negative) a goal. */
export const goalContributionsTable = pgTable("goal_contributions", (pg) => ({
  id: pg.serial().primaryKey(),
  goalId: pg
    .integer("goal_id")
    .notNull()
    .references(() => goalsTable.id, { onDelete: "cascade" }),
  amount: pg.bigint({ mode: "number" }).notNull(),
  date: pg.date({ mode: "string" }).notNull(),
  note: pg.text(),
  createdAt: pg
    .timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}));

export type SelectGoal = typeof goalsTable.$inferSelect;
