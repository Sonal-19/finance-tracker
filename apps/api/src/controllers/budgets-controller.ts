import { and, eq, gte, lte, sql } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import { budgetsTable, categoriesTable, transactionsTable } from "$/db/schema";
import { countedBookCond } from "$/lib/services/book-service";
import { fail, ok } from "$/lib/utils";
import { toPaise, toRupees } from "$/lib/utils/money";
import { rangeFor, today } from "$/lib/utils/period";
import { protectedUser } from "$/pre-processor";

export const budgetsController = new Elysia({
  name: "budgets_controller",
  prefix: "/budgets",
})
  .use(protectedUser)
  .get(
    "/",
    async ({ user, query }) => {
      const month = query.month ?? today().slice(0, 7);
      const r = rangeFor("month", `${month}-01`);
      const T = transactionsTable;
      const [spentRows, rows] = await Promise.all([
        db
          .select({
            categoryId: T.categoryId,
            spent: sql<string>`sum(${T.amount})`,
          })
          .from(T)
          .where(
            and(
              eq(T.userId, user.id),
              eq(T.type, "debit"),
              gte(T.date, r.from),
              lte(T.date, r.to),
              countedBookCond(user.id, query.bookId),
            ),
          )
          .groupBy(T.categoryId),
        db
          .select({
            id: budgetsTable.id,
            amount: budgetsTable.amount,
            category: {
              id: categoriesTable.id,
              name: categoriesTable.name,
              icon: categoriesTable.icon,
              color: categoriesTable.color,
            },
          })
          .from(budgetsTable)
          .innerJoin(
            categoriesTable,
            eq(categoriesTable.id, budgetsTable.categoryId),
          )
          .where(eq(budgetsTable.userId, user.id))
          .orderBy(categoriesTable.name),
      ]);
      const spentBy = new Map(
        spentRows.map((s) => [s.categoryId, toRupees(s.spent)]),
      );
      const totalSpent = [...spentBy.values()].reduce((a, b) => a + b, 0);

      const overall =
        user.monthlyBudget === null ? null : toRupees(user.monthlyBudget);
      return ok({
        month,
        range: r,
        overall: { budget: overall, spent: totalSpent },
        categories: rows.map((b) => ({
          ...b,
          amount: toRupees(b.amount),
          spent: spentBy.get(b.category.id) ?? 0,
        })),
      });
    },
    {
      query: t.Object({
        month: t.Optional(t.String({ pattern: "^\\d{4}-\\d{2}$" })),
        /** Spending in one book (default: books that count in totals). */
        bookId: t.Optional(t.Numeric({ minimum: 1 })),
      }),
    },
  )
  .put(
    "/",
    async ({ user, body, status }) => {
      const [cat] = await db
        .select()
        .from(categoriesTable)
        .where(
          and(
            eq(categoriesTable.id, body.categoryId),
            eq(categoriesTable.userId, user.id),
          ),
        )
        .limit(1);
      if (!cat) return status(404, fail("Category not found"));
      if (cat.type !== "debit")
        return status(400, fail("Budgets apply to expense categories only"));
      const [row] = await db
        .insert(budgetsTable)
        .values({
          userId: user.id,
          categoryId: cat.id,
          amount: toPaise(body.amount),
        })
        .onConflictDoUpdate({
          target: [budgetsTable.userId, budgetsTable.categoryId],
          set: { amount: toPaise(body.amount) },
        })
        .returning();
      return ok({ ...row!, amount: toRupees(row!.amount) }, "Budget saved");
    },
    {
      body: t.Object({
        categoryId: t.Integer({ minimum: 1 }),
        amount: t.Number({ exclusiveMinimum: 0 }),
      }),
    },
  )
  .delete(
    "/:id",
    async ({ user, params, status }) => {
      const [row] = await db
        .delete(budgetsTable)
        .where(
          and(eq(budgetsTable.id, params.id), eq(budgetsTable.userId, user.id)),
        )
        .returning();
      return row
        ? ok(null, "Budget removed")
        : status(404, fail("Budget not found"));
    },
    { params: t.Object({ id: t.Numeric() }) },
  );
