import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import { categoriesTable, eventsTable, transactionsTable } from "$/db/schema";
import { fail, ok } from "$/lib/utils";
import { amountOf } from "$/lib/utils/money";
import { today } from "$/lib/utils/period";
import { tEnum } from "$/lib/utils/schema";
import { protectedUser } from "$/pre-processor";

const E = eventsTable;
const T = transactionsTable;
const tId = t.Object({ id: t.Numeric() });
const tDate = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

const eventBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 60 }),
  icon: t.String({ pattern: "^[a-z0-9-]{1,40}$" }),
  color: t.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
  startDate: t.Optional(t.Nullable(tDate)),
  endDate: t.Optional(t.Nullable(tDate)),
  /** Rupees; null = no budget. */
  budget: t.Optional(t.Nullable(t.Integer({ exclusiveMinimum: 0 }))),
  note: t.Optional(t.Nullable(t.String({ maxLength: 300 }))),
  /** `active` makes this the event new transactions default to. */
  activation: t.Optional(tEnum(["active", "inactive"] as const)),
});

const spent = sql<string>`coalesce(sum(${T.amount}) filter (where ${T.type} = 'debit'), 0)`;
const received = sql<string>`coalesce(sum(${T.amount}) filter (where ${T.type} = 'credit'), 0)`;

const deactivate = (userId: number) =>
  db
    .update(E)
    .set({ activeSince: null })
    .where(and(eq(E.userId, userId), isNotNull(E.activeSince)));

async function setActive(userId: number, id: number) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(E)
      .set({ activeSince: null })
      .where(and(eq(E.userId, userId), isNotNull(E.activeSince)));
    await tx
      .update(E)
      .set({ activeSince: now })
      .where(and(eq(E.id, id), eq(E.userId, userId)));
  });
  return now;
}

type EventRow = typeof E.$inferSelect;
const serializeEvent = (
  e: EventRow,
  s?: { spent: string; received: string; count: number },
) => {
  const now = today();
  return {
    ...e,
    budget: e.budget === null ? null : amountOf(e.budget),
    spent: amountOf(s?.spent),
    received: amountOf(s?.received),
    count: s?.count ?? 0,
    status:
      e.startDate && e.startDate > now
        ? ("upcoming" as const)
        : e.endDate && e.endDate < now
          ? ("past" as const)
          : ("ongoing" as const),
  };
};

async function ownedEvent(userId: number, id: number) {
  const [e] = await db
    .select()
    .from(E)
    .where(and(eq(E.id, id), eq(E.userId, userId)))
    .limit(1);
  return e;
}

export const eventsController = new Elysia({
  name: "events_controller",
  prefix: "/events",
})
  .use(protectedUser)
  .get("/", async ({ user }) => {
    const [events, totals] = await Promise.all([
      db
        .select()
        .from(E)
        .where(eq(E.userId, user.id))
        .orderBy(
          sql`${E.activeSince} is null`,
          desc(sql`coalesce(${E.startDate}, ${E.createdAt}::date)`),
        ),
      // Driven from the user's events so each one is a short index range.
      db
        .select({
          eventId: E.id,
          spent,
          received,
          count: sql<number>`count(*)::int`,
        })
        .from(E)
        .innerJoin(T, and(eq(T.eventId, E.id), eq(T.userId, user.id)))
        .where(eq(E.userId, user.id))
        .groupBy(E.id),
    ]);
    // An active event whose end date has passed stops auto-tagging. Only
    // that one case writes; a plain list read never does.
    const now = today();
    const expired = events.find(
      (e) => e.activeSince && e.endDate && e.endDate < now,
    );
    if (expired) {
      await deactivate(user.id);
      expired.activeSince = null;
    }
    const byEvent = new Map(totals.map((x) => [x.eventId, x]));
    return ok(events.map((e) => serializeEvent(e, byEvent.get(e.id))));
  })
  .get(
    "/:id",
    async ({ user, params, status }) => {
      const event = await ownedEvent(user.id, params.id);
      if (!event) return status(404, fail("Event not found"));
      const inEvent = and(eq(T.userId, user.id), eq(T.eventId, event.id));
      const [[totals], byCategory, byDay] = await Promise.all([
        db
          .select({ spent, received, count: sql<number>`count(*)::int` })
          .from(T)
          .where(inEvent),
        db
          .select({
            id: categoriesTable.id,
            name: categoriesTable.name,
            icon: categoriesTable.icon,
            color: categoriesTable.color,
            total: sql<string>`sum(${T.amount})`,
            count: sql<number>`count(*)::int`,
          })
          .from(T)
          .innerJoin(categoriesTable, eq(categoriesTable.id, T.categoryId))
          .where(and(inEvent, eq(T.type, "debit")))
          .groupBy(categoriesTable.id)
          .orderBy(desc(sql`sum(${T.amount})`)),
        db
          .select({ date: T.date, spent })
          .from(T)
          .where(inEvent)
          .groupBy(T.date)
          .orderBy(T.date),
      ]);
      return ok({
        event: serializeEvent(event, totals),
        byCategory: byCategory.map((c) => ({ ...c, total: amountOf(c.total) })),
        byDay: byDay.map((d) => ({ date: d.date, spent: amountOf(d.spent) })),
      });
    },
    { params: tId },
  )
  .post(
    "/",
    async ({ user, body, status }) => {
      if (body.startDate && body.endDate && body.endDate < body.startDate)
        return status(400, fail("End date must be after the start date"));
      const { activation, budget, ...rest } = body;
      const [row] = await db
        .insert(E)
        .values({
          ...rest,
          name: rest.name.trim(),
          note: rest.note?.trim() || null,
          budget: budget ? budget : null,
          userId: user.id,
        })
        .returning();
      const active = activation === "active";
      const activeSince = active ? await setActive(user.id, row!.id) : null;
      return ok(
        { ...row!, activeSince },
        active ? `${row!.name} created and active` : `${row!.name} created`,
      );
    },
    { body: eventBody },
  )
  .patch(
    "/:id",
    async ({ user, params, body, status }) => {
      const event = await ownedEvent(user.id, params.id);
      if (!event) return status(404, fail("Event not found"));
      const startDate =
        body.startDate !== undefined ? body.startDate : event.startDate;
      const endDate = body.endDate !== undefined ? body.endDate : event.endDate;
      if (startDate && endDate && endDate < startDate)
        return status(400, fail("End date must be after the start date"));
      const { activation, budget, ...rest } = body;
      if (Object.keys(rest).length || budget !== undefined)
        await db
          .update(E)
          .set({
            ...rest,
            ...(rest.name && { name: rest.name.trim() }),
            ...(rest.note !== undefined && { note: rest.note?.trim() || null }),
            ...(budget !== undefined && {
              budget: budget ? budget : null,
            }),
          })
          .where(and(eq(E.id, event.id), eq(E.userId, user.id)));
      if (activation === "active" && !event.activeSince)
        await setActive(user.id, event.id);
      if (activation === "inactive" && event.activeSince)
        await deactivate(user.id);
      return ok(
        null,
        activation === "active"
          ? `${event.name} is active — new transactions will be tagged to it`
          : activation === "inactive"
            ? `${event.name} is no longer active`
            : "Event updated",
      );
    },
    { params: tId, body: t.Partial(eventBody) },
  )
  .delete(
    "/:id",
    async ({ user, params, status }) => {
      const [row] = await db
        .delete(E)
        .where(and(eq(E.id, params.id), eq(E.userId, user.id)))
        .returning();
      return row
        ? ok(null, "Event deleted (its transactions are kept)")
        : status(404, fail("Event not found"));
    },
    { params: tId },
  );
