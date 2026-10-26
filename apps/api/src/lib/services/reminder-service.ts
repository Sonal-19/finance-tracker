import { and, eq, lt, lte, ne, sql } from "drizzle-orm";
import { db } from "$/db";
import {
  accountsTable,
  categoriesTable,
  type NotificationKind,
  notificationsTable,
  recurringRulesTable,
  remindersTable,
  type SelectReminder,
  usersTable,
} from "$/db/schema";
import { APP_TZ } from "$/env";
import { formatAmount } from "$/lib/utils/money";
import {
  addDaysTo,
  daysLeftText,
  dueSlot,
  MAX_DAYS_BEFORE,
  nextReminderDate,
  recurringSlots,
  zonedInstant,
} from "$/lib/utils/reminders";
import { pushService } from "./push-service";

const CHECK_EVERY_MS = 60_000;
/** Inbox entries older than this are cleared. */
const KEEP_DAYS = 90;

const localDate = (d: Date) =>
  d.toLocaleDateString("en-CA", { timeZone: APP_TZ });

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

type Delivery = {
  userId: number;
  kind: NotificationKind;
  title: string;
  body: string;
  url: string;
  dedupeKey: string;
  recurringId?: number | null;
  reminderId?: number | null;
};

/** Records a notification once (by `dedupeKey`) and pushes it. Returns
 * false when that slot already went out. */
export async function deliver(d: Delivery) {
  const [row] = await db
    .insert(notificationsTable)
    .values({
      userId: d.userId,
      kind: d.kind,
      title: d.title,
      body: d.body,
      url: d.url,
      dedupeKey: d.dedupeKey,
      recurringId: d.recurringId ?? null,
      reminderId: d.reminderId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: notificationsTable.id });
  if (!row) return false;
  await pushService
    .sendToUser(d.userId, [
      { title: d.title, body: d.body, tag: d.dedupeKey, url: d.url },
    ])
    .catch((err) => console.error("[Reminders] push failed", err));
  return true;
}

/** The next time a custom reminder goes off after it fired at `at`, or
 * null when it doesn't repeat. Skips occurrences already in the past. */
export function followingAt(r: SelectReminder, at: Date, now: Date) {
  if (r.repeat === "once") return null;
  const anchor = Number(r.date.slice(8, 10));
  let date = localDate(at);
  let next: Date;
  let guard = 0;
  do {
    date = nextReminderDate(date, r.repeat, anchor);
    next = zonedInstant(date, r.time, APP_TZ);
  } while (next <= now && ++guard < 5000);
  return next;
}

/**
 * Sends reminders every minute, for everyone, whether or not their app is
 * open: recurring rules before they post (`recurringSlots`), and the
 * user's own reminders when they're due. Every send lands in the inbox;
 * browsers with push turned on also get a notification.
 */
class ReminderService {
  #running = false;
  #lastCleanup = 0;

  start() {
    const timer = setInterval(() => void this.runOnce(), CHECK_EVERY_MS);
    if (typeof timer === "object" && "unref" in timer) timer.unref();
    setTimeout(() => void this.runOnce(), 5_000);
    console.info("[Reminders] scheduler started");
  }

  async runOnce(now = new Date()) {
    if (this.#running) return;
    this.#running = true;
    try {
      await this.#recurring(now);
      await this.#custom(now);
      if (now.getTime() - this.#lastCleanup > 60 * 60 * 1000) {
        this.#lastCleanup = now.getTime();
        await db
          .delete(notificationsTable)
          .where(
            lt(
              notificationsTable.createdAt,
              new Date(now.getTime() - KEEP_DAYS * 86_400_000),
            ),
          );
      }
    } catch (err) {
      console.error("[Reminders] run failed", err);
    } finally {
      this.#running = false;
    }
  }

  async #recurring(now: Date) {
    const R = recurringRulesTable;
    // Nothing reminds further ahead than MAX_DAYS_BEFORE.
    const horizon = addDaysTo(localDate(now), MAX_DAYS_BEFORE + 1);
    const rules = await db
      .select({
        rule: R,
        category: categoriesTable.name,
        account: accountsTable.name,
      })
      .from(R)
      .innerJoin(usersTable, eq(usersTable.id, R.userId))
      .innerJoin(categoriesTable, eq(categoriesTable.id, R.categoryId))
      .innerJoin(accountsTable, eq(accountsTable.id, R.accountId))
      .where(
        and(
          eq(R.status, "active"),
          ne(R.reminder, "off"),
          lte(R.nextRunDate, horizon),
          eq(usersTable.status, "active"),
          sql`(${R.endDate} is null or ${R.nextRunDate} <= ${R.endDate})`,
        ),
      );
    for (const { rule, category, account } of rules) {
      const slot = dueSlot(recurringSlots(rule, rule.nextRunDate, APP_TZ), now);
      if (!slot) continue;
      const what = rule.note?.trim() || category;
      const income = rule.type === "credit";
      await deliver({
        userId: rule.userId,
        kind: "recurring",
        recurringId: rule.id,
        url: "/recurring",
        dedupeKey: `rec:${rule.id}:${rule.nextRunDate}:${slot.date}`,
        title: `${what} ${income ? "arrives" : "is due"} ${daysLeftText(slot.daysLeft)}`,
        body: `${formatAmount(rule.amount)} ${income ? "income" : "expense"} on ${dayLabel(rule.nextRunDate)} · ${account}. It's added to your transactions automatically.`,
      }).catch((err) =>
        console.error(`[Reminders] recurring ${rule.id} failed`, err),
      );
    }
  }

  async #custom(now: Date) {
    const due = await db
      .select({ r: remindersTable })
      .from(remindersTable)
      .innerJoin(usersTable, eq(usersTable.id, remindersTable.userId))
      .where(
        and(
          eq(remindersTable.status, "active"),
          lte(remindersTable.nextAt, now),
          eq(usersTable.status, "active"),
        ),
      );
    for (const { r } of due) {
      try {
        await deliver({
          userId: r.userId,
          kind: "reminder",
          reminderId: r.id,
          url: "/reminders",
          dedupeKey: `rem:${r.id}:${r.nextAt.toISOString()}`,
          title: `⏰ ${r.title}`,
          body: r.note?.trim() || "Your reminder",
        });
        const next = followingAt(r, r.nextAt, now);
        await db
          .update(remindersTable)
          .set(
            next
              ? { nextAt: next, lastSentAt: now }
              : { status: "done", doneAt: now, lastSentAt: now },
          )
          .where(eq(remindersTable.id, r.id));
      } catch (err) {
        console.error(`[Reminders] reminder ${r.id} failed`, err);
      }
    }
  }
}

export const reminderService = new ReminderService();
