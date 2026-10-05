import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import {
  bookStatuses,
  booksTable,
  bookTotals,
  categoriesTable,
  transactionsTable,
} from "$/db/schema";
import { bookSummaries, ownedBook } from "$/lib/services/book-service";
import { fail, ok } from "$/lib/utils";
import { amountOf } from "$/lib/utils/money";
import { tEnum } from "$/lib/utils/schema";
import { protectedUser } from "$/pre-processor";

const B = booksTable;
const T = transactionsTable;
const tId = t.Object({ id: t.Numeric() });

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

const bookBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 40 }),
  icon: t.String({ pattern: "^[a-z0-9-]{1,40}$" }),
  color: t.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
  note: t.Optional(t.Nullable(t.String({ maxLength: 300 }))),
  /** `separate` keeps the book out of the user's own income/expense totals. */
  totals: tEnum(bookTotals),
});

async function makeDefault(userId: number, id: number) {
  await db.transaction(async (tx) => {
    await tx
      .update(B)
      .set({ defaultSince: null })
      .where(and(eq(B.userId, userId), isNotNull(B.defaultSince)));
    await tx
      .update(B)
      .set({ defaultSince: new Date() })
      .where(and(eq(B.id, id), eq(B.userId, userId)));
  });
}

export const booksController = new Elysia({
  name: "books_controller",
  prefix: "/books",
})
  .use(protectedUser)
  .get("/", async ({ user }) => ok(await bookSummaries(user.id)))
  .get(
    "/:id",
    async ({ user, params, status }) => {
      const [book] = await bookSummaries(user.id, params.id);
      if (!book) return status(404, fail("Book not found"));
      const byCategory = await db
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
        .where(
          and(
            eq(T.userId, user.id),
            eq(T.bookId, book.id),
            eq(T.type, "debit"),
          ),
        )
        .groupBy(categoriesTable.id)
        .orderBy(desc(sql`sum(${T.amount})`));
      return ok({
        book,
        byCategory: byCategory.map((c) => ({ ...c, total: amountOf(c.total) })),
      });
    },
    { params: tId },
  )
  .post(
    "/",
    async ({ user, body, status }) => {
      try {
        const [row] = await db
          .insert(B)
          .values({
            ...body,
            name: body.name.trim(),
            note: body.note?.trim() || null,
            userId: user.id,
          })
          .returning();
        return ok(row!, `${row!.name} added`);
      } catch (e) {
        if (isUniqueViolation(e))
          return status(409, fail("You already have a book with this name"));
        throw e;
      }
    },
    { body: bookBody },
  )
  .patch(
    "/:id",
    async ({ user, params, body, status }) => {
      const book = await ownedBook(user.id, params.id);
      if (!book) return status(404, fail("Book not found"));
      if (body.status === "archived" && book.defaultSince)
        return status(
          400,
          fail("Make another book the default before archiving this one"),
        );
      try {
        await db
          .update(B)
          .set({
            ...body,
            ...(body.name && { name: body.name.trim() }),
            ...(body.note !== undefined && { note: body.note?.trim() || null }),
            ...(body.status &&
              body.status !== book.status && {
                archivedAt: body.status === "archived" ? new Date() : null,
              }),
          })
          .where(and(eq(B.id, book.id), eq(B.userId, user.id)));
      } catch (e) {
        if (isUniqueViolation(e))
          return status(409, fail("You already have a book with this name"));
        throw e;
      }
      return ok(
        null,
        body.status === "archived"
          ? `${book.name} archived`
          : body.status === "active" && book.status === "archived"
            ? `${book.name} restored`
            : "Book updated",
      );
    },
    {
      params: tId,
      body: t.Composite([
        t.Partial(bookBody),
        t.Object({ status: t.Optional(tEnum(bookStatuses)) }),
      ]),
    },
  )
  .post(
    "/:id/default",
    async ({ user, params, status }) => {
      const book = await ownedBook(user.id, params.id);
      if (!book) return status(404, fail("Book not found"));
      if (book.status === "archived")
        return status(400, fail("Restore the book first"));
      await makeDefault(user.id, book.id);
      return ok(null, `${book.name} is now your default book`);
    },
    { params: tId },
  )
  .delete(
    "/:id",
    async ({ user, params, status }) => {
      const [book] = await bookSummaries(user.id, params.id);
      if (!book) return status(404, fail("Book not found"));
      if (book.defaultSince)
        return status(400, fail("You can't delete your default book"));
      if (book.usage > 0)
        return status(
          409,
          fail(
            `${book.name} has ${book.usage} ${book.usage === 1 ? "record" : "records"}. Archive it instead to keep your history.`,
          ),
        );
      await db.delete(B).where(and(eq(B.id, book.id), eq(B.userId, user.id)));
      return ok(null, `${book.name} deleted`);
    },
    { params: tId },
  );
