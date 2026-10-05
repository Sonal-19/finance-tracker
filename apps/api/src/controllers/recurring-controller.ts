import { and, asc, eq, sql } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import {
  categoriesTable,
  frequencies,
  recurringRulesTable,
  txnTypes,
} from "$/db/schema";
import { resolveAccountId } from "$/lib/services/account-service";
import { resolveBookId } from "$/lib/services/book-service";
import { recurringService } from "$/lib/services/recurring-service";
import { ownedCategory } from "$/lib/services/transaction-service";
import { fail, ok } from "$/lib/utils";
import { toPaise, toRupees } from "$/lib/utils/money";
import { tEnum } from "$/lib/utils/schema";
import { protectedUser } from "$/pre-processor";

const R = recurringRulesTable;
const tDate = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

const ruleBody = t.Object({
  type: tEnum(txnTypes),
  amount: t.Number({ exclusiveMinimum: 0 }),
  categoryId: t.Integer({ minimum: 1 }),
  /** Omitted = the user's default account. */
  accountId: t.Optional(t.Integer({ minimum: 1 })),
  /** Omitted = the user's default book. */
  bookId: t.Optional(t.Integer({ minimum: 1 })),
  note: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
  frequency: tEnum(frequencies),
  startDate: tDate,
  endDate: t.Optional(t.Nullable(tDate)),
});

async function listRules(userId: number) {
  const rows = await db
    .select({
      rule: R,
      category: {
        id: categoriesTable.id,
        name: categoriesTable.name,
        icon: categoriesTable.icon,
        color: categoriesTable.color,
      },
    })
    .from(R)
    .innerJoin(categoriesTable, eq(categoriesTable.id, R.categoryId))
    .where(eq(R.userId, userId))
    .orderBy(sql`${R.status} <> 'active'`, asc(R.nextRunDate));
  return rows.map(({ rule, category }) => ({
    ...rule,
    amount: toRupees(rule.amount),
    category,
  }));
}

export const recurringController = new Elysia({
  name: "recurring_controller",
  prefix: "/recurring",
})
  .use(protectedUser)
  .get("/", async ({ user }) => ok(await listRules(user.id)))
  .post(
    "/",
    async ({ user, body, status }) => {
      const cat = await ownedCategory(user.id, body.categoryId, body.type);
      if (!cat.ok) return status(400, fail(cat.message));
      if (body.endDate && body.endDate < body.startDate)
        return status(400, fail("End date must be after start date"));
      const account = await resolveAccountId(user.id, body.accountId);
      if (!account.ok) return status(400, fail(account.message));
      const book = await resolveBookId(user.id, body.bookId);
      if (!book.ok) return status(400, fail(book.message));
      await db.insert(R).values({
        ...body,
        accountId: account.id,
        bookId: book.id,
        note: body.note?.trim() || null,
        amount: toPaise(body.amount),
        userId: user.id,
        nextRunDate: body.startDate,
      });
      const posted = await recurringService.runDue(user.id);
      return ok(
        { posted },
        posted
          ? `Recurring rule added, ${posted} past entr${posted > 1 ? "ies" : "y"} posted`
          : "Recurring rule added",
      );
    },
    { body: ruleBody },
  )
  .patch(
    "/:id",
    async ({ user, params, body, status }) => {
      const [rule] = await db
        .select()
        .from(R)
        .where(and(eq(R.id, params.id), eq(R.userId, user.id)))
        .limit(1);
      if (!rule) return status(404, fail("Rule not found"));
      const type = body.type ?? rule.type;
      const categoryId = body.categoryId ?? rule.categoryId;
      const cat = await ownedCategory(user.id, categoryId, type);
      if (!cat.ok) return status(400, fail(cat.message));
      let accountId: number | undefined;
      if (body.accountId !== undefined) {
        const account = await resolveAccountId(user.id, body.accountId);
        if (!account.ok) return status(400, fail(account.message));
        accountId = account.id;
      }
      let bookId: number | undefined;
      if (body.bookId !== undefined) {
        const book = await resolveBookId(user.id, body.bookId);
        if (!book.ok) return status(400, fail(book.message));
        bookId = book.id;
      }
      // Changing the start date restarts the schedule from there (future only).
      const restart = body.startDate && body.startDate !== rule.startDate;
      await db
        .update(R)
        .set({
          type,
          categoryId,
          ...(accountId !== undefined && { accountId }),
          ...(bookId !== undefined && { bookId }),
          ...(body.amount !== undefined && { amount: toPaise(body.amount) }),
          ...(body.note !== undefined && { note: body.note?.trim() || null }),
          ...(body.frequency && { frequency: body.frequency }),
          ...(body.endDate !== undefined && { endDate: body.endDate }),
          ...(body.status &&
            body.status !== rule.status && {
              status: body.status,
              pausedAt: body.status === "paused" ? new Date() : null,
              completedAt: null,
            }),
          ...(restart && {
            startDate: body.startDate,
            nextRunDate: body.startDate,
          }),
        })
        .where(and(eq(R.id, rule.id), eq(R.userId, user.id)));
      await recurringService.runDue(user.id);
      return ok(null, "Recurring rule updated");
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Composite([
        t.Partial(ruleBody),
        /** Pause or resume; `completed` is set by the scheduler only. */
        t.Object({ status: t.Optional(tEnum(["active", "paused"] as const)) }),
      ]),
    },
  )
  .delete(
    "/:id",
    async ({ user, params, status }) => {
      const [row] = await db
        .delete(R)
        .where(and(eq(R.id, params.id), eq(R.userId, user.id)))
        .returning();
      return row
        ? ok(null, "Recurring rule deleted (past entries kept)")
        : status(404, fail("Rule not found"));
    },
    { params: t.Object({ id: t.Numeric() }) },
  );
