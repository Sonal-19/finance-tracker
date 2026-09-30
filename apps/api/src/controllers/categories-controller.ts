import { and, asc, eq, sql } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import {
  categoriesTable,
  recurringRulesTable,
  transactionsTable,
  txnTypes,
} from "$/db/schema";
import { fail, ok } from "$/lib/utils";
import { tEnum } from "$/lib/utils/schema";
import { protectedUser } from "$/pre-processor";

const tColor = t.String({ pattern: "^#[0-9a-fA-F]{6}$" });
const tIcon = t.String({ pattern: "^[a-z0-9-]{1,40}$" });

function isUniqueViolation(e: unknown) {
  const err = e as {
    code?: string;
    errno?: string;
    cause?: { code?: string; errno?: string };
  };
  return [err.code, err.errno, err.cause?.code, err.cause?.errno].includes(
    "23505",
  );
}

export const categoriesController = new Elysia({
  name: "categories_controller",
  prefix: "/categories",
})
  .use(protectedUser)
  .get("/", async ({ user }) => {
    const rows = await db
      .select({
        id: categoriesTable.id,
        name: categoriesTable.name,
        type: categoriesTable.type,
        icon: categoriesTable.icon,
        color: categoriesTable.color,
        isDefault: categoriesTable.isDefault,
        txnCount: sql<number>`count(${transactionsTable.id})::int`,
      })
      .from(categoriesTable)
      .leftJoin(
        transactionsTable,
        eq(transactionsTable.categoryId, categoriesTable.id),
      )
      .where(eq(categoriesTable.userId, user.id))
      .groupBy(categoriesTable.id)
      .orderBy(asc(categoriesTable.type), asc(categoriesTable.id));
    return ok(rows);
  })
  .post(
    "/",
    async ({ user, body, status }) => {
      try {
        const [row] = await db
          .insert(categoriesTable)
          .values({ ...body, name: body.name.trim(), userId: user.id })
          .returning();
        return ok({ ...row!, txnCount: 0 }, "Category added");
      } catch (e) {
        if (isUniqueViolation(e))
          return status(409, fail("A category with this name already exists"));
        throw e;
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 40 }),
        type: tEnum(txnTypes),
        icon: tIcon,
        color: tColor,
      }),
    },
  )
  .patch(
    "/:id",
    async ({ user, params, body, status }) => {
      try {
        const [row] = await db
          .update(categoriesTable)
          .set({ ...body, ...(body.name && { name: body.name.trim() }) })
          .where(
            and(
              eq(categoriesTable.id, params.id),
              eq(categoriesTable.userId, user.id),
            ),
          )
          .returning();
        return row
          ? ok(row, "Category updated")
          : status(404, fail("Category not found"));
      } catch (e) {
        if (isUniqueViolation(e))
          return status(409, fail("A category with this name already exists"));
        throw e;
      }
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 40 })),
        icon: t.Optional(tIcon),
        color: t.Optional(tColor),
      }),
    },
  )
  .delete(
    "/:id",
    async ({ user, params, query, status }) => {
      const [cat] = await db
        .select()
        .from(categoriesTable)
        .where(
          and(
            eq(categoriesTable.id, params.id),
            eq(categoriesTable.userId, user.id),
          ),
        )
        .limit(1);
      if (!cat) return status(404, fail("Category not found"));

      const [{ used } = { used: 0 }] = await db
        .select({
          used: sql<number>`(select count(*)::int from ${transactionsTable} where ${transactionsTable.categoryId} = ${cat.id}) + (select count(*)::int from ${recurringRulesTable} where ${recurringRulesTable.categoryId} = ${cat.id})`,
        })
        .from(sql`(select 1) as one`);

      if (used > 0) {
        if (!query.reassignTo)
          return status(
            409,
            fail(
              `This category is used by ${used} records. Choose another category to move them to.`,
            ),
          );
        const [target] = await db
          .select()
          .from(categoriesTable)
          .where(
            and(
              eq(categoriesTable.id, query.reassignTo),
              eq(categoriesTable.userId, user.id),
              eq(categoriesTable.type, cat.type),
            ),
          )
          .limit(1);
        if (!target || target.id === cat.id)
          return status(
            400,
            fail("Pick a different category of the same type"),
          );
        await db.transaction(async (tx) => {
          await tx
            .update(transactionsTable)
            .set({ categoryId: target.id })
            .where(eq(transactionsTable.categoryId, cat.id));
          await tx
            .update(recurringRulesTable)
            .set({ categoryId: target.id })
            .where(eq(recurringRulesTable.categoryId, cat.id));
          await tx
            .delete(categoriesTable)
            .where(eq(categoriesTable.id, cat.id));
        });
      } else {
        await db.delete(categoriesTable).where(eq(categoriesTable.id, cat.id));
      }
      return ok(null, "Category deleted");
    },
    {
      params: t.Object({ id: t.Numeric() }),
      query: t.Object({ reassignTo: t.Optional(t.Numeric()) }),
    },
  );
