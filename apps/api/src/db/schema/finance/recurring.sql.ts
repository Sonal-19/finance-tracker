import { pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";
import { accountsTable } from "./accounts.sql";
import { categoriesTable } from "./categories.sql";
import { frequencyEnum, paymentMethodEnum, txnTypeEnum } from "./enums.sql";

/** A rule that auto-posts a transaction every period (rent, salary, EMI…). */
export const recurringRulesTable = pgTable("recurring_rules", (pg) => ({
  id: pg.serial().primaryKey(),
  userId: pg
    .integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  type: txnTypeEnum("type").notNull(),
  amount: pg.bigint({ mode: "number" }).notNull(),
  categoryId: pg
    .integer("category_id")
    .notNull()
    .references(() => categoriesTable.id),
  accountId: pg
    .integer("account_id")
    .notNull()
    .references(() => accountsTable.id),
  paymentMethod: paymentMethodEnum("payment_method").notNull().default("bank"),
  note: pg.text(),
  frequency: frequencyEnum("frequency").notNull(),
  startDate: pg.date("start_date", { mode: "string" }).notNull(),
  endDate: pg.date("end_date", { mode: "string" }),
  nextRunDate: pg.date("next_run_date", { mode: "string" }).notNull(),
  isActive: pg.boolean("is_active").notNull().default(true),
  createdAt: pg
    .timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: pg
    .timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
}));

export type SelectRecurringRule = typeof recurringRulesTable.$inferSelect;
