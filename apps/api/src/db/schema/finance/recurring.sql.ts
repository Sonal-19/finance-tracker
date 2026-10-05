import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";
import { accountsTable } from "./accounts.sql";
import { categoriesTable } from "./categories.sql";
import { frequencyEnum, paymentMethodEnum, txnTypeEnum } from "./enums.sql";

/** `paused` = switched off by the user, `completed` = ran past its end date. */
export const recurringStatuses = ["active", "paused", "completed"] as const;
export type RecurringStatus = (typeof recurringStatuses)[number];
export const recurringStatusEnum = pgEnum(
  "recurring_status",
  recurringStatuses,
);

/** A rule that auto-posts a transaction every period (rent, salary, EMI…). */
export const recurringRulesTable = pgTable(
  "recurring_rules",
  (pg) => ({
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
    paymentMethod: paymentMethodEnum("payment_method")
      .notNull()
      .default("bank"),
    note: pg.text(),
    frequency: frequencyEnum("frequency").notNull(),
    startDate: pg.date("start_date", { mode: "string" }).notNull(),
    endDate: pg.date("end_date", { mode: "string" }),
    nextRunDate: pg.date("next_run_date", { mode: "string" }).notNull(),
    status: recurringStatusEnum("status").notNull().default("active"),
    pausedAt: pg.timestamp("paused_at", { withTimezone: true }),
    completedAt: pg.timestamp("completed_at", { withTimezone: true }),
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
    index("recurring_user_idx").on(t.userId),
    // The hourly poster only ever looks at active rules that are due.
    index("recurring_due_idx")
      .on(t.nextRunDate)
      .where(sql`${t.status} = 'active'`),
    index("recurring_category_idx").on(t.categoryId),
    index("recurring_account_idx").on(t.accountId),
  ],
);

export type SelectRecurringRule = typeof recurringRulesTable.$inferSelect;
