import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";
import { accountsTable } from "./accounts.sql";
import { booksTable } from "./books.sql";
import { categoriesTable } from "./categories.sql";
import { frequencyEnum, txnTypeEnum } from "./enums.sql";

/** `paused` = switched off by the user, `completed` = ran past its end date. */
export const recurringStatuses = ["active", "paused", "completed"] as const;
export type RecurringStatus = (typeof recurringStatuses)[number];
export const recurringStatusEnum = pgEnum(
  "recurring_status",
  recurringStatuses,
);

/** When a rule reminds before it posts: `default` = 3, 2 and 1 days before
 * at 09:00 (`DEFAULT_RECURRING_REMINDER`), `custom` = the rule's own
 * `reminder_*` columns, `off` = never. */
export const recurringReminderModes = ["default", "custom", "off"] as const;
export type RecurringReminderMode = (typeof recurringReminderModes)[number];
export const recurringReminderModeEnum = pgEnum(
  "recurring_reminder_mode",
  recurringReminderModes,
);

/** A custom recurring reminder: every day from N days before, or once. */
export const reminderCadences = ["daily", "once"] as const;
export type ReminderCadence = (typeof reminderCadences)[number];
export const reminderCadenceEnum = pgEnum("reminder_cadence", reminderCadences);

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
    bookId: pg
      .integer("book_id")
      .notNull()
      .references(() => booksTable.id),
    note: pg.text(),
    frequency: frequencyEnum("frequency").notNull(),
    startDate: pg.date("start_date", { mode: "string" }).notNull(),
    endDate: pg.date("end_date", { mode: "string" }),
    nextRunDate: pg.date("next_run_date", { mode: "string" }).notNull(),
    status: recurringStatusEnum("status").notNull().default("active"),
    reminder: recurringReminderModeEnum("reminder")
      .notNull()
      .default("default"),
    /** `custom` only: how many days before the run date (0 = on the day). */
    reminderDaysBefore: pg.integer("reminder_days_before"),
    /** `custom` only: time of day, `HH:mm` in APP_TZ. */
    reminderTime: pg.text("reminder_time"),
    /** `custom` only: every day until the run date, or just once. */
    reminderCadence: reminderCadenceEnum("reminder_cadence"),
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
    index("recurring_book_idx").on(t.bookId),
  ],
);

export type SelectRecurringRule = typeof recurringRulesTable.$inferSelect;
