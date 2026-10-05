import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  type SQL,
  sql,
} from "drizzle-orm";
import { db } from "$/db";
import {
  accountsTable,
  booksTable,
  categoriesTable,
  eventsTable,
  type TxnType,
  transactionsTable,
} from "$/db/schema";
import { toRupees } from "$/lib/utils/money";

export type TxnFilters = {
  type?: TxnType;
  categoryIds?: number[];
  accountId?: number;
  bookId?: number;
  /** A positive id filters to that event; `0` means "not in any event". */
  eventId?: number;
  from?: string;
  to?: string;
  q?: string;
  minAmount?: number;
  maxAmount?: number;
};

export function txnWhere(userId: number, f: TxnFilters) {
  const T = transactionsTable;
  const conds: SQL[] = [eq(T.userId, userId)];
  if (f.type) conds.push(eq(T.type, f.type));
  if (f.categoryIds?.length) conds.push(inArray(T.categoryId, f.categoryIds));
  if (f.accountId) conds.push(eq(T.accountId, f.accountId));
  if (f.bookId) conds.push(eq(T.bookId, f.bookId));
  if (f.eventId !== undefined)
    conds.push(f.eventId === 0 ? isNull(T.eventId) : eq(T.eventId, f.eventId));
  if (f.from) conds.push(gte(T.date, f.from));
  if (f.to) conds.push(lte(T.date, f.to));
  if (f.minAmount !== undefined) conds.push(gte(T.amount, f.minAmount));
  if (f.maxAmount !== undefined) conds.push(lte(T.amount, f.maxAmount));
  if (f.q?.trim()) {
    const like = `%${f.q.trim().replace(/[%_]/g, "\\$&")}%`;
    conds.push(
      sql`(${ilike(T.note, like)} or ${ilike(categoriesTable.name, like)})`,
    );
  }
  return and(...conds)!;
}

export const txnSelect = {
  id: transactionsTable.id,
  type: transactionsTable.type,
  amount: transactionsTable.amount,
  date: transactionsTable.date,
  note: transactionsTable.note,
  originalAmount: transactionsTable.originalAmount,
  originalCurrency: transactionsTable.originalCurrency,
  fxRate: transactionsTable.fxRate,
  recurringId: transactionsTable.recurringId,
  splitId: transactionsTable.splitId,
  sharedSplitId: transactionsTable.sharedSplitId,
  createdAt: transactionsTable.createdAt,
  category: {
    id: categoriesTable.id,
    name: categoriesTable.name,
    icon: categoriesTable.icon,
    color: categoriesTable.color,
  },
  account: {
    id: accountsTable.id,
    name: accountsTable.name,
    icon: accountsTable.icon,
    color: accountsTable.color,
  },
  book: {
    id: booksTable.id,
    name: booksTable.name,
    icon: booksTable.icon,
    color: booksTable.color,
    totals: booksTable.totals,
  },
  event: {
    id: eventsTable.id,
    name: eventsTable.name,
    icon: eventsTable.icon,
    color: eventsTable.color,
  },
};

/** Transactions with their category, account, book and (optional) event. */
export function selectTxns() {
  return db
    .select(txnSelect)
    .from(transactionsTable)
    .innerJoin(
      categoriesTable,
      eq(categoriesTable.id, transactionsTable.categoryId),
    )
    .innerJoin(accountsTable, eq(accountsTable.id, transactionsTable.accountId))
    .innerJoin(booksTable, eq(booksTable.id, transactionsTable.bookId))
    .leftJoin(eventsTable, eq(eventsTable.id, transactionsTable.eventId));
}

type TxnRow = Awaited<ReturnType<typeof selectTxns>>[number];

export const serializeTxn = (r: TxnRow) => ({
  ...r,
  amount: toRupees(r.amount),
  originalAmount: r.originalAmount === null ? null : toRupees(r.originalAmount),
});

export async function listTransactions(
  userId: number,
  f: TxnFilters,
  page: { limit: number; offset: number },
) {
  const where = txnWhere(userId, f);
  // Only the text search looks at the category name; without it the
  // aggregates skip the join entirely.
  const aggregate = <T extends Record<string, SQL>>(columns: T) => {
    const q = db.select(columns).from(transactionsTable).$dynamic();
    return f.q?.trim()
      ? q.innerJoin(
          categoriesTable,
          eq(categoriesTable.id, transactionsTable.categoryId),
        )
      : q;
  };
  const income = sql<string>`coalesce(sum(${transactionsTable.amount}) filter (where ${transactionsTable.type} = 'credit'), 0)`;
  const expense = sql<string>`coalesce(sum(${transactionsTable.amount}) filter (where ${transactionsTable.type} = 'debit'), 0)`;

  // The page and the filter-wide totals don't depend on each other.
  const [rows, [totals]] = await Promise.all([
    selectTxns()
      .where(where)
      .orderBy(desc(transactionsTable.date), desc(transactionsTable.id))
      .limit(page.limit + 1)
      .offset(page.offset),
    aggregate({ count: sql<number>`count(*)::int`, income, expense }).where(
      where,
    ),
  ]);
  const hasMore = rows.length > page.limit;
  const items = rows.slice(0, page.limit);

  // Per-day totals for the days on this page (whole day, not just this page's rows).
  const dates = [...new Set(items.map((i) => i.date))];
  const dayRows = dates.length
    ? await aggregate({
        date: sql<string>`to_char(${transactionsTable.date}, 'YYYY-MM-DD')`,
        income,
        expense,
      })
        .where(and(where, inArray(transactionsTable.date, dates)))
        .groupBy(transactionsTable.date)
    : [];

  return {
    items: items.map(serializeTxn),
    hasMore,
    totals: {
      count: totals?.count ?? 0,
      income: toRupees(totals?.income),
      expense: toRupees(totals?.expense),
    },
    dayTotals: Object.fromEntries(
      dayRows.map((d) => [
        d.date,
        { income: toRupees(d.income), expense: toRupees(d.expense) },
      ]),
    ),
  };
}

export async function getTransaction(userId: number, id: number) {
  const [row] = await selectTxns()
    .where(
      and(eq(transactionsTable.userId, userId), eq(transactionsTable.id, id)),
    )
    .limit(1);
  return row ? serializeTxn(row) : null;
}

const ownedCategoryQuery = db
  .select()
  .from(categoriesTable)
  .where(
    and(
      eq(categoriesTable.id, sql.placeholder("id")),
      eq(categoriesTable.userId, sql.placeholder("userId")),
    ),
  )
  .limit(1)
  .prepare("owned_category");

/** Ensures the category belongs to the user and matches the txn type. */
export async function ownedCategory(
  userId: number,
  categoryId: number,
  type: TxnType,
) {
  const [cat] = await ownedCategoryQuery.execute({ id: categoryId, userId });
  if (!cat) return { ok: false as const, message: "Category not found" };
  if (cat.type !== type)
    return {
      ok: false as const,
      message: `"${cat.name}" is an ${cat.type === "credit" ? "income" : "expense"} category`,
    };
  return { ok: true as const, category: cat };
}

/** Event must belong to the user (null/undefined = no event). */
export async function ownedEventId(userId: number, eventId?: number | null) {
  if (!eventId) return { ok: true as const, id: null };
  const [e] = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(and(eq(eventsTable.id, eventId), eq(eventsTable.userId, userId)))
    .limit(1);
  return e
    ? { ok: true as const, id: e.id }
    : { ok: false as const, message: "Event not found" };
}
