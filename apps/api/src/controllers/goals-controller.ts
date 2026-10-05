import { and, asc, desc, eq, sql } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import { goalContributionsTable, goalsTable } from "$/db/schema";
import { fail, ok } from "$/lib/utils";
import { amountOf } from "$/lib/utils/money";
import { today } from "$/lib/utils/period";
import { protectedUser } from "$/pre-processor";

const G = goalsTable;
const C = goalContributionsTable;
const tDate = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

const goalBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 60 }),
  target: t.Integer({ exclusiveMinimum: 0 }),
  targetDate: t.Optional(t.Nullable(tDate)),
  color: t.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
  icon: t.String({ pattern: "^[a-z0-9-]{1,40}$" }),
});

async function ownedGoal(userId: number, id: number) {
  const [goal] = await db
    .select()
    .from(G)
    .where(and(eq(G.id, id), eq(G.userId, userId)))
    .limit(1);
  return goal;
}

export const goalsController = new Elysia({
  name: "goals_controller",
  prefix: "/goals",
})
  .use(protectedUser)
  .get("/", async ({ user }) => {
    const rows = await db
      .select({
        goal: G,
        saved: sql<string>`coalesce(sum(${C.amount}), 0)`,
      })
      .from(G)
      .leftJoin(C, eq(C.goalId, G.id))
      .where(eq(G.userId, user.id))
      .groupBy(G.id)
      .orderBy(asc(G.createdAt));
    return ok(
      rows.map(({ goal, saved }) => ({
        ...goal,
        target: amountOf(goal.target),
        saved: amountOf(saved),
      })),
    );
  })
  .get(
    "/:id/contributions",
    async ({ user, params, status }) => {
      if (!(await ownedGoal(user.id, params.id)))
        return status(404, fail("Goal not found"));
      const rows = await db
        .select()
        .from(C)
        .where(eq(C.goalId, params.id))
        .orderBy(desc(C.date), desc(C.id));
      return ok(rows.map((r) => ({ ...r, amount: amountOf(r.amount) })));
    },
    { params: t.Object({ id: t.Numeric() }) },
  )
  .post(
    "/",
    async ({ user, body }) => {
      const [row] = await db
        .insert(G)
        .values({
          ...body,
          name: body.name.trim(),
          target: body.target,
          userId: user.id,
        })
        .returning();
      return ok(
        { ...row!, target: amountOf(row!.target), saved: 0 },
        "Goal created",
      );
    },
    { body: goalBody },
  )
  .patch(
    "/:id",
    async ({ user, params, body, status }) => {
      if (!(await ownedGoal(user.id, params.id)))
        return status(404, fail("Goal not found"));
      await db
        .update(G)
        .set({
          ...body,
          ...(body.name && { name: body.name.trim() }),
          ...(body.target !== undefined && { target: body.target }),
        })
        .where(eq(G.id, params.id));
      return ok(null, "Goal updated");
    },
    { params: t.Object({ id: t.Numeric() }), body: t.Partial(goalBody) },
  )
  .delete(
    "/:id",
    async ({ user, params, status }) => {
      const [row] = await db
        .delete(G)
        .where(and(eq(G.id, params.id), eq(G.userId, user.id)))
        .returning();
      return row
        ? ok(null, "Goal deleted")
        : status(404, fail("Goal not found"));
    },
    { params: t.Object({ id: t.Numeric() }) },
  )
  .post(
    "/:id/contributions",
    async ({ user, params, body, status }) => {
      if (!(await ownedGoal(user.id, params.id)))
        return status(404, fail("Goal not found"));
      if (body.amount === 0) return status(400, fail("Amount can't be zero"));
      await db.insert(C).values({
        goalId: params.id,
        amount: body.amount,
        date: body.date ?? today(),
        note: body.note?.trim() || null,
      });
      return ok(
        null,
        body.amount > 0 ? "Money added to goal" : "Withdrawal recorded",
      );
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Object({
        amount: t.Integer(),
        date: t.Optional(tDate),
        note: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
      }),
    },
  )
  .delete(
    "/:id/contributions/:cid",
    async ({ user, params, status }) => {
      if (!(await ownedGoal(user.id, params.id)))
        return status(404, fail("Goal not found"));
      const [row] = await db
        .delete(C)
        .where(and(eq(C.id, params.cid), eq(C.goalId, params.id)))
        .returning();
      return row
        ? ok(null, "Entry removed")
        : status(404, fail("Entry not found"));
    },
    { params: t.Object({ id: t.Numeric(), cid: t.Numeric() }) },
  );
