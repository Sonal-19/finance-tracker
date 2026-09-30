import { pgTable, unique } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";
import { categoriesTable } from "./categories.sql";

/** Monthly spending limit for one expense category (paise). */
export const budgetsTable = pgTable(
  "budgets",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    categoryId: pg
      .integer("category_id")
      .notNull()
      .references(() => categoriesTable.id, { onDelete: "cascade" }),
    amount: pg.bigint({ mode: "number" }).notNull(),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [unique("budgets_user_category").on(t.userId, t.categoryId)],
);

export type SelectBudget = typeof budgetsTable.$inferSelect;
