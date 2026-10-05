import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import { type DB, db, type TX } from "$/db";
import {
  booksTable,
  recurringRulesTable,
  splitsTable,
  transactionsTable,
} from "$/db/schema";
import { amountOf } from "$/lib/utils/money";

export const DEFAULT_BOOK = {
  name: "Personal",
  icon: "book-open",
  color: "#2563eb",
} as const;

/** Every new user starts with one book that counts in their totals. */
export async function seedDefaultBooks(tx: DB | TX, userId: number) {
  return tx
    .insert(booksTable)
    .values({ ...DEFAULT_BOOK, userId, defaultSince: new Date() })
    .returning();
}

/** The user's default book, else their oldest active one. */
export async function defaultBookId(userId: number, tx: DB | TX = db) {
  const [row] = await tx
    .select({ id: booksTable.id })
    .from(booksTable)
    .where(and(eq(booksTable.userId, userId), eq(booksTable.status, "active")))
    .orderBy(sql`${booksTable.defaultSince} nulls last`, booksTable.id)
    .limit(1);
  if (row) return row.id;
  // Safety net: a user with no books gets the default one.
  const created = await seedDefaultBooks(tx, userId);
  return created[0]!.id;
}

const ownedBookQuery = db
  .select()
  .from(booksTable)
  .where(
    and(
      eq(booksTable.id, sql.placeholder("id")),
      eq(booksTable.userId, sql.placeholder("userId")),
    ),
  )
  .limit(1)
  .prepare("owned_book");

export async function ownedBook(userId: number, id: number) {
  const [b] = await ownedBookQuery.execute({ id, userId });
  return b;
}

/** Resolves a requested book (must be the user's and not archived) or the default one. */
export async function resolveBookId(userId: number, requested?: number | null) {
  if (!requested) return { ok: true as const, id: await defaultBookId(userId) };
  const b = await ownedBook(userId, requested);
  if (!b) return { ok: false as const, message: "Book not found" };
  if (b.status === "archived")
    return { ok: false as const, message: `"${b.name}" is archived` };
  return { ok: true as const, id: b.id };
}

/**
 * Which transactions count in the user's own income/expense numbers: one
 * book when asked for, otherwise every book whose totals are `included`
 * (so money paid on someone's behalf stays out of reports and budgets).
 */
export function countedBookCond(userId: number, bookId?: number): SQL {
  const T = transactionsTable;
  if (bookId) return eq(T.bookId, bookId);
  return inArray(
    T.bookId,
    db
      .select({ id: booksTable.id })
      .from(booksTable)
      .where(
        and(eq(booksTable.userId, userId), eq(booksTable.totals, "included")),
      ),
  );
}

const B = booksTable;
const T = transactionsTable;
const R = recurringRulesTable;
const S = splitsTable;

// Correlated subqueries on `transactions_book_idx` (book id, type, amount),
// so the list is one round trip answered from indexes. The table name is
// spelled out because drizzle drops it from columns in a single-table select.
const ofBook = (column: string) => sql.raw(`${column} = "books"."id"`);
const txnSum = (type: "credit" | "debit") =>
  sql<string>`(select coalesce(sum(t.amount), 0) from ${T} t where ${ofBook("t.book_id")} and t.type = ${sql.raw(`'${type}'`)})`;

const summaryColumns = {
  spent: txnSum("debit"),
  received: txnSum("credit"),
  count: sql<number>`(select count(*) from ${T} t where ${ofBook("t.book_id")})::int`,
  usage: sql<number>`(
    (select count(*) from ${T} t where ${ofBook("t.book_id")})
    + (select count(*) from ${R} r where ${ofBook("r.book_id")})
    + (select count(*) from ${S} s where ${ofBook("s.book_id")})
  )::int`,
};

/** Books with what was spent and received in each (rupees). */
export async function bookSummaries(userId: number, bookId?: number) {
  const rows = await db
    .select({ book: B, ...summaryColumns })
    .from(B)
    .where(and(eq(B.userId, userId), bookId ? eq(B.id, bookId) : undefined))
    .orderBy(sql`${B.defaultSince} nulls last`, B.id);
  return rows.map(({ book, ...r }) => {
    const spent = amountOf(r.spent);
    const received = amountOf(r.received);
    return {
      ...book,
      spent,
      received,
      /** Spent on someone's behalf and not yet received back. */
      outstanding: spent - received,
      count: r.count,
      /** Transactions, recurring rules and splits referencing this book. */
      usage: r.usage,
    };
  });
}
