import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "$/db";
import { categoriesTable, transactionsTable } from "$/db/schema";
import { countedBookCond } from "$/lib/services/book-service";
import { amountOf } from "$/lib/utils/money";
import {
  addDays,
  addMonths,
  daysBetween,
  type Period,
  previousRange,
  type Range,
  today,
} from "$/lib/utils/period";

const T = transactionsTable;
const income = sql<string>`coalesce(sum(${T.amount}) filter (where ${T.type} = 'credit'), 0)`;
const expense = sql<string>`coalesce(sum(${T.amount}) filter (where ${T.type} = 'debit'), 0)`;

/**
 * Optional narrowing of every report to one account, event and/or book.
 * With no scope at all, only books that count in the user's totals are
 * read; an account or event report shows everything in it.
 */
export type ReportScope = {
  accountId?: number;
  eventId?: number;
  bookId?: number;
};

const inRange = (userId: number, r: Range, scope: ReportScope = {}) =>
  and(
    eq(T.userId, userId),
    gte(T.date, r.from),
    lte(T.date, r.to),
    scope.accountId ? eq(T.accountId, scope.accountId) : undefined,
    scope.eventId ? eq(T.eventId, scope.eventId) : undefined,
    scope.bookId || !(scope.accountId || scope.eventId)
      ? countedBookCond(userId, scope.bookId)
      : undefined,
  );

async function totals(userId: number, r: Range, scope: ReportScope) {
  const [row] = await db
    .select({ income, expense, count: sql<number>`count(*)::int` })
    .from(T)
    .where(inRange(userId, r, scope));
  const inc = amountOf(row?.income);
  const exp = amountOf(row?.expense);
  return { income: inc, expense: exp, net: inc - exp, count: row?.count ?? 0 };
}

/** Month buckets for ranges longer than ~2 months, day buckets otherwise. */
function bucketUnit(r: Range): "day" | "month" {
  return daysBetween(r.from, r.to) > 62 ? "month" : "day";
}

function bucketKeys(r: Range, unit: "day" | "month") {
  const keys: string[] = [];
  if (unit === "day") {
    for (let d = r.from; d <= r.to; d = addDays(d, 1)) keys.push(d);
  } else {
    for (let d = `${r.from.slice(0, 7)}-01`; d <= r.to; d = addMonths(d, 1, 1))
      keys.push(d.slice(0, 7));
  }
  return keys;
}

export async function summary(
  userId: number,
  period: Period,
  r: Range,
  scope: ReportScope = {},
) {
  const prev = previousRange(period, r);
  const unit = bucketUnit(r);
  const bucketExpr =
    unit === "day"
      ? sql<string>`to_char(${T.date}, 'YYYY-MM-DD')`
      : sql<string>`to_char(${T.date}, 'YYYY-MM')`;

  const [current, previous, bucketRows, categoryRows] = await Promise.all([
    totals(userId, r, scope),
    totals(userId, prev, scope),
    db
      .select({ key: bucketExpr, income, expense })
      .from(T)
      .where(inRange(userId, r, scope))
      .groupBy(bucketExpr),
    db
      .select({
        id: categoriesTable.id,
        name: categoriesTable.name,
        icon: categoriesTable.icon,
        color: categoriesTable.color,
        type: T.type,
        total: sql<string>`sum(${T.amount})`,
        count: sql<number>`count(*)::int`,
      })
      .from(T)
      .innerJoin(categoriesTable, eq(categoriesTable.id, T.categoryId))
      .where(inRange(userId, r, scope))
      .groupBy(categoriesTable.id, T.type)
      .orderBy(desc(sql`sum(${T.amount})`)),
  ]);

  const byKey = new Map(bucketRows.map((b) => [b.key, b]));
  const nowKey = unit === "day" ? today() : today().slice(0, 7);
  let cumulative = 0;
  const buckets = bucketKeys(r, unit).map((key) => {
    const b = byKey.get(key);
    const inc = amountOf(b?.income);
    const exp = amountOf(b?.expense);
    cumulative += exp;
    // The running total stops at today so the trend line doesn't run flat into the future.
    const future = key > nowKey && !b;
    return {
      key,
      income: inc,
      expense: exp,
      cumulativeExpense: future ? null : cumulative,
    };
  });

  // Days elapsed so far in the range (a running month counts only up to today).
  const end = r.to < today() ? r.to : today();
  const days = Math.max(
    1,
    daysBetween(r.from, end < r.from ? r.from : end) + 1,
  );

  const categories = categoryRows.map((c) => ({
    ...c,
    total: amountOf(c.total),
  }));
  return {
    range: r,
    previousRange: prev,
    unit,
    current,
    previous,
    savingsRate:
      current.income > 0 ? (current.net / current.income) * 100 : null,
    avgDailyExpense: current.expense / days,
    buckets,
    expenseByCategory: categories.filter((c) => c.type === "debit"),
    incomeByCategory: categories.filter((c) => c.type === "credit"),
  };
}

/** Per-day totals for a calendar month ("yyyy-MM"). */
export async function calendar(
  userId: number,
  month: string,
  scope: ReportScope = {},
) {
  const from = `${month}-01`;
  const to = addDays(addMonths(from, 1, 1), -1);
  const rows = await db
    .select({ date: T.date, income, expense })
    .from(T)
    .where(inRange(userId, { from, to }, scope))
    .groupBy(T.date);
  return {
    from,
    to,
    days: rows.map((d) => ({
      date: d.date,
      income: amountOf(d.income),
      expense: amountOf(d.expense),
    })),
  };
}
