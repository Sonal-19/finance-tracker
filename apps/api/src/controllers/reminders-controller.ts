import { and, asc, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import {
  categoriesTable,
  notificationsTable,
  recurringRulesTable,
  reminderRepeats,
  remindersTable,
  type SelectReminder,
} from "$/db/schema";
import { APP_TZ } from "$/env";
import { followingAt } from "$/lib/services/reminder-service";
import { fail, ok } from "$/lib/utils";
import { amountOf } from "$/lib/utils/money";
import {
  addDaysTo,
  MAX_DAYS_BEFORE,
  recurringSlots,
  TIME_PATTERN,
  zonedInstant,
} from "$/lib/utils/reminders";
import { tEnum } from "$/lib/utils/schema";
import { protectedUser } from "$/pre-processor";

const M = remindersTable;
const N = notificationsTable;
const tDate = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const INBOX_SIZE = 50;

const reminderBody = t.Object({
  title: t.String({ minLength: 1, maxLength: 120 }),
  note: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
  date: tDate,
  time: t.String({ pattern: TIME_PATTERN }),
  repeat: tEnum(reminderRepeats),
});

/** First time a reminder goes off at or after now: its own date/time, or
 * for a repeating one already in the past, the next occurrence. */
function firstAt(r: Pick<SelectReminder, "date" | "time" | "repeat">) {
  const now = new Date();
  const at = zonedInstant(r.date, r.time, APP_TZ);
  if (at > now || r.repeat === "once") return at;
  return followingAt(r as SelectReminder, at, now) ?? at;
}

const localDate = (d: Date) =>
  d.toLocaleDateString("en-CA", { timeZone: APP_TZ });

/** The user's own reminders (Reminders tab). */
export const remindersController = new Elysia({
  name: "reminders_controller",
  prefix: "/reminders",
})
  .use(protectedUser)
  .get("/", async ({ user }) =>
    ok(
      await db
        .select()
        .from(M)
        .where(eq(M.userId, user.id))
        .orderBy(
          // Active first, then by when they next go off.
          asc(ne(M.status, "active")),
          asc(M.nextAt),
        ),
    ),
  )
  .post(
    "/",
    async ({ user, body, status }) => {
      const nextAt = firstAt(body);
      if (body.repeat === "once" && nextAt <= new Date())
        return status(400, fail("Pick a time in the future"));
      const [row] = await db
        .insert(M)
        .values({
          ...body,
          title: body.title.trim(),
          note: body.note?.trim() || null,
          userId: user.id,
          nextAt,
        })
        .returning();
      return ok(row, "Reminder set");
    },
    { body: reminderBody },
  )
  .patch(
    "/:id",
    async ({ user, params, body, status }) => {
      const [r] = await db
        .select()
        .from(M)
        .where(and(eq(M.id, params.id), eq(M.userId, user.id)))
        .limit(1);
      if (!r) return status(404, fail("Reminder not found"));
      const merged = {
        date: body.date ?? r.date,
        time: body.time ?? r.time,
        repeat: body.repeat ?? r.repeat,
      };
      const timing =
        merged.date !== r.date ||
        merged.time !== r.time ||
        merged.repeat !== r.repeat;
      const resume = body.status === "active" && r.status !== "active";
      // A new time, or turning it back on, reschedules from now.
      const nextAt = timing || resume ? firstAt(merged) : r.nextAt;
      if (
        (timing || resume) &&
        merged.repeat === "once" &&
        nextAt <= new Date()
      )
        return status(400, fail("Pick a time in the future"));
      const [row] = await db
        .update(M)
        .set({
          ...merged,
          ...(body.title !== undefined && { title: body.title.trim() }),
          ...(body.note !== undefined && { note: body.note?.trim() || null }),
          nextAt,
          ...(body.status === "paused" &&
            r.status !== "paused" && {
              status: "paused",
              pausedAt: new Date(),
            }),
          ...((resume || (timing && r.status === "done")) && {
            status: "active",
            pausedAt: null,
            doneAt: null,
          }),
        })
        .where(and(eq(M.id, r.id), eq(M.userId, user.id)))
        .returning();
      return ok(
        row,
        body.status === "paused"
          ? "Reminder paused"
          : resume
            ? "Reminder on again"
            : "Reminder saved",
      );
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Composite([
        t.Partial(reminderBody),
        t.Object({ status: t.Optional(tEnum(["active", "paused"] as const)) }),
      ]),
    },
  )
  .delete(
    "/:id",
    async ({ user, params, status }) => {
      const [row] = await db
        .delete(M)
        .where(and(eq(M.id, params.id), eq(M.userId, user.id)))
        .returning({ id: M.id });
      return row
        ? ok(null, "Reminder deleted")
        : status(404, fail("Reminder not found"));
    },
    { params: t.Object({ id: t.Numeric() }) },
  )
  /** Reminders coming up from recurring rules (next MAX_DAYS_BEFORE days). */
  .get("/upcoming", async ({ user }) => {
    const R = recurringRulesTable;
    const now = new Date();
    const rules = await db
      .select({ rule: R, category: categoriesTable.name })
      .from(R)
      .innerJoin(categoriesTable, eq(categoriesTable.id, R.categoryId))
      .where(
        and(
          eq(R.userId, user.id),
          eq(R.status, "active"),
          ne(R.reminder, "off"),
        ),
      )
      .orderBy(asc(R.nextRunDate));
    const horizon = addDaysTo(localDate(now), MAX_DAYS_BEFORE + 1);
    return ok(
      rules
        .filter(
          ({ rule }) =>
            rule.nextRunDate <= horizon &&
            (!rule.endDate || rule.nextRunDate <= rule.endDate),
        )
        .map(({ rule, category }) => ({
          recurringId: rule.id,
          title: rule.note?.trim() || category,
          type: rule.type,
          amount: amountOf(rule.amount),
          runDate: rule.nextRunDate,
          reminder: rule.reminder,
          slots: recurringSlots(rule, rule.nextRunDate, APP_TZ)
            .filter((s) => s.at > now)
            .map((s) => ({ at: s.at, daysLeft: s.daysLeft })),
        }))
        .filter((r) => r.slots.length),
    );
  });

/** The in-app inbox: every reminder that went out. */
export const notificationsController = new Elysia({
  name: "notifications_controller",
  prefix: "/notifications",
})
  .use(protectedUser)
  .get("/", async ({ user }) => {
    const [items, [unread]] = await Promise.all([
      db
        .select()
        .from(N)
        .where(eq(N.userId, user.id))
        .orderBy(desc(N.createdAt), desc(N.id))
        .limit(INBOX_SIZE),
      db
        .select({ n: count() })
        .from(N)
        .where(and(eq(N.userId, user.id), isNull(N.readAt))),
    ]);
    return ok({ items, unread: unread!.n });
  })
  /** Marks some (`ids`) or all as read. */
  .post(
    "/read",
    async ({ user, body }) => {
      await db
        .update(N)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(N.userId, user.id),
            isNull(N.readAt),
            body.ids?.length ? inArray(N.id, body.ids) : undefined,
          ),
        );
      return ok(null);
    },
    {
      body: t.Object({
        ids: t.Optional(t.Array(t.Integer({ minimum: 1 }), { maxItems: 200 })),
      }),
    },
  )
  .delete("/", async ({ user }) => {
    await db.delete(N).where(eq(N.userId, user.id));
    return ok(null, "Notifications cleared");
  });
