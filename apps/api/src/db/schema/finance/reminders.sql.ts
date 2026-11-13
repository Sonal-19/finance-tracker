import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";
import { recurringRulesTable } from "./recurring.sql";

/** How a custom reminder repeats after its first time. */
export const reminderRepeats = [
  "once",
  "daily",
  "weekly",
  "monthly",
  "yearly",
] as const;
export type ReminderRepeat = (typeof reminderRepeats)[number];
export const reminderRepeatEnum = pgEnum("reminder_repeat", reminderRepeats);

/** `paused` by the user, `done` once a one-off reminder has gone out. */
export const reminderStatuses = ["active", "paused", "done"] as const;
export type ReminderStatus = (typeof reminderStatuses)[number];
export const reminderStatusEnum = pgEnum("reminder_status", reminderStatuses);

/** A reminder the user wrote themself (Reminders tab). */
export const remindersTable = pgTable(
  "reminders",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: pg.text().notNull(),
    note: pg.text(),
    /** First time it goes off, `yyyy-MM-dd` + `HH:mm` in APP_TZ. */
    date: pg.date({ mode: "string" }).notNull(),
    time: pg.text().notNull(),
    repeat: reminderRepeatEnum("repeat").notNull().default("once"),
    /** The next time it goes off (the scheduler's only input). */
    nextAt: pg.timestamp("next_at", { withTimezone: true }).notNull(),
    status: reminderStatusEnum("status").notNull().default("active"),
    pausedAt: pg.timestamp("paused_at", { withTimezone: true }),
    doneAt: pg.timestamp("done_at", { withTimezone: true }),
    lastSentAt: pg.timestamp("last_sent_at", { withTimezone: true }),
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
    index("reminders_user_idx").on(t.userId),
    // The minute scheduler only reads active reminders that are due.
    index("reminders_due_idx").on(t.nextAt).where(sql`${t.status} = 'active'`),
  ],
);
export type SelectReminder = typeof remindersTable.$inferSelect;

export const notificationKinds = ["recurring", "reminder", "test"] as const;
export type NotificationKind = (typeof notificationKinds)[number];
export const notificationKindEnum = pgEnum(
  "notification_kind",
  notificationKinds,
);

/** Every reminder that went out: the in-app inbox (bell), and the record
 * that stops one being sent twice (`dedupe_key`). */
export const notificationsTable = pgTable(
  "notifications",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    kind: notificationKindEnum("kind").notNull(),
    title: pg.text().notNull(),
    body: pg.text().notNull(),
    /** Where a tap goes in the app. */
    url: pg.text().notNull().default("/reminders"),
    recurringId: pg
      .integer("recurring_id")
      .references(() => recurringRulesTable.id, { onDelete: "set null" }),
    reminderId: pg
      .integer("reminder_id")
      .references(() => remindersTable.id, { onDelete: "set null" }),
    /** One per reminder slot, e.g. `rec:12:2026-11-01:2026-10-29`. */
    dedupeKey: pg.text("dedupe_key").notNull(),
    readAt: pg.timestamp("read_at", { withTimezone: true }),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    uniqueIndex("notifications_dedupe_uq").on(t.userId, t.dedupeKey),
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    index("notifications_unread_idx")
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
    index("notifications_recurring_idx")
      .on(t.recurringId)
      .where(sql`${t.recurringId} is not null`),
    index("notifications_reminder_idx")
      .on(t.reminderId)
      .where(sql`${t.reminderId} is not null`),
  ],
);
