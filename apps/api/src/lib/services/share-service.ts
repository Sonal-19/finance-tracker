import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { db } from "$/db";
import type { SelectPaymentClaim } from "$/db/schema";
import {
  bookSharesTable,
  booksTable,
  categoriesTable,
  paymentClaimsTable,
  type SelectBook,
  type SelectBookShare,
  transactionsTable,
} from "$/db/schema";
import { amountOf } from "$/lib/utils/money";
import { today } from "$/lib/utils/period";
import { attachmentsByTransaction } from "./attachment-service";

const S = bookSharesTable;
const T = transactionsTable;

/** Rows a public page shows at most (newest first). */
export const SHARE_ROW_LIMIT = 2000;

/** `name@bank`, as printed on any UPI app's profile. */
export const UPI_ID_PATTERN =
  "^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$";

export const newShareToken = () => randomBytes(16).toString("base64url");
export const newShareSecret = () => randomBytes(32).toString("hex");

/** The owner's view of a link: no password hash, no cookie secret. */
export const serializeShare = ({
  passwordHash,
  secret: _secret,
  userId: _userId,
  ...s
}: SelectBookShare) => ({
  ...s,
  protection: passwordHash ? ("password" as const) : ("open" as const),
  expired: isExpired(s),
});

export const isExpired = (s: Pick<SelectBookShare, "expiresOn">) =>
  !!s.expiresOn && s.expiresOn < today();

/** A link with its book, or undefined when it is unknown or expired. An
 * archived book's links keep working: the history is still there. */
export async function findShare(token: string) {
  const [row] = await db
    .select({ share: S, book: booksTable })
    .from(S)
    .innerJoin(booksTable, eq(booksTable.id, S.bookId))
    .where(eq(S.token, token))
    .limit(1);
  if (!row || isExpired(row.share)) return undefined;
  return row;
}

/* ---------- password unlock (cookie) ---------- */

export const shareCookieName = (s: SelectBookShare) => `share_${s.id}`;

/** What the unlock cookie must hold. It is tied to the link's secret and its
 * current password, so changing or removing the password locks everyone out. */
export const shareCookieValue = (s: SelectBookShare) =>
  createHmac("sha256", s.secret)
    .update(s.passwordHash ?? "")
    .digest("hex");

export function isUnlocked(s: SelectBookShare, cookie: unknown) {
  if (!s.passwordHash) return true;
  if (typeof cookie !== "string") return false;
  const want = Buffer.from(shareCookieValue(s));
  const got = Buffer.from(cookie);
  return want.length === got.length && timingSafeEqual(want, got);
}

/* ---------- what the public page shows ---------- */

/** Entries of the shared book the viewer may see. A `separate` book shows
 * what was spent and what came back; any other book only its expenses.
 * The link's period bounds the expenses on both sides, but payments only
 * from its start: one made after the period ended still pays it off. */
const visibleCond = (share: SelectBookShare, book: SelectBook) =>
  and(
    eq(T.userId, share.userId),
    eq(T.bookId, share.bookId),
    share.fromDate ? gte(T.date, share.fromDate) : undefined,
    share.toDate
      ? or(lte(T.date, share.toDate), eq(T.type, "credit"))
      : undefined,
    book.totals === "separate" ? undefined : eq(T.type, "debit"),
  );

type MonthRow = {
  month: string;
  type: "debit" | "credit";
  categoryId: number;
  name: string;
  icon: string;
  color: string;
  amount: string;
  count: number;
};

/** Per month (newest first): what was spent and received, and the spending
 * by category (biggest first). */
function monthBreakdown(rows: MonthRow[]) {
  const months = new Map<
    string,
    {
      month: string;
      spent: number;
      received: number;
      count: number;
      categories: (Omit<MonthRow, "month" | "type" | "amount"> & {
        amount: number;
      })[];
    }
  >();
  for (const r of rows) {
    const m = months.get(r.month) ?? {
      month: r.month,
      spent: 0,
      received: 0,
      count: 0,
      categories: [],
    };
    const amount = amountOf(r.amount);
    m.count += r.count;
    if (r.type === "credit") m.received += amount;
    else {
      m.spent += amount;
      m.categories.push({
        categoryId: r.categoryId,
        name: r.name,
        icon: r.icon,
        color: r.color,
        amount,
        count: r.count,
      });
    }
    months.set(r.month, m);
  }
  return [...months.values()]
    .map((m) => ({
      ...m,
      categories: m.categories.sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

export async function shareEntries(share: SelectBookShare, book: SelectBook) {
  const where = visibleCond(share, book);
  const [rows, [sums], monthRows] = await Promise.all([
    db
      .select({
        id: T.id,
        type: T.type,
        amount: T.amount,
        date: T.date,
        note: T.note,
        category: {
          name: categoriesTable.name,
          icon: categoriesTable.icon,
          color: categoriesTable.color,
        },
      })
      .from(T)
      .innerJoin(categoriesTable, eq(categoriesTable.id, T.categoryId))
      .where(where)
      .orderBy(desc(T.date), desc(T.id))
      .limit(SHARE_ROW_LIMIT + 1),
    db
      .select({
        spent: sql<string>`coalesce(sum(${T.amount}) filter (where ${T.type} = 'debit'), 0)`,
        received: sql<string>`coalesce(sum(${T.amount}) filter (where ${T.type} = 'credit'), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(T)
      .where(where),
    // One row per month, type and category: the whole period, not just the
    // rows listed.
    db
      .select({
        month: sql<string>`to_char(${T.date}, 'YYYY-MM')`,
        type: T.type,
        categoryId: categoriesTable.id,
        name: categoriesTable.name,
        icon: categoriesTable.icon,
        color: categoriesTable.color,
        amount: sql<string>`sum(${T.amount})`,
        count: sql<number>`count(*)::int`,
      })
      .from(T)
      .innerJoin(categoriesTable, eq(categoriesTable.id, T.categoryId))
      .where(where)
      .groupBy(
        sql`to_char(${T.date}, 'YYYY-MM')`,
        T.type,
        categoriesTable.id,
      ),
  ]);
  const items = rows.slice(0, SHARE_ROW_LIMIT);
  const files =
    share.attachments === "shown"
      ? await attachmentsByTransaction(items.map((i) => i.id))
      : new Map();
  const spent = amountOf(sums?.spent);
  const received = amountOf(sums?.received);
  return {
    months: monthBreakdown(monthRows),
    items: items.map((i) => ({
      ...i,
      amount: amountOf(i.amount),
      attachments: (files.get(i.id) ?? []) as {
        id: number;
        fileName: string;
        contentType: string;
        size: number;
      }[],
    })),
    truncated: rows.length > SHARE_ROW_LIMIT,
    totals: {
      count: sums?.count ?? 0,
      spent,
      received,
      /** Still to be paid back; null when the book isn't kept separately. */
      due: book.totals === "separate" ? spent - received : null,
    },
  };
}

/** True when the attachment belongs to an entry this link shows. */
export async function shareShowsTransaction(
  share: SelectBookShare,
  book: SelectBook,
  transactionId: number,
) {
  const [row] = await db
    .select({ id: T.id })
    .from(T)
    .where(and(visibleCond(share, book), eq(T.id, transactionId)))
    .limit(1);
  return !!row;
}

export function recordView(share: SelectBookShare) {
  db.update(S)
    .set({
      viewCount: sql`${S.viewCount} + 1`,
      lastViewedAt: new Date(),
      // A view isn't an edit.
      updatedAt: share.updatedAt,
    })
    .where(eq(S.id, share.id))
    .catch(console.error);
}

/* ---------- "I've paid" ---------- */

/** Unanswered reports one link may hold, so it can't be flooded. */
export const MAX_PENDING_CLAIMS = 10;

export const serializeClaim = (c: SelectPaymentClaim) => ({
  id: c.id,
  bookId: c.bookId,
  amount: c.amount,
  payerName: c.payerName,
  reference: c.reference,
  status: c.status,
  createdAt: c.createdAt,
});

/** Reports from this link the owner hasn't answered, newest first. */
export async function pendingClaimsOfShare(shareId: number) {
  const C = paymentClaimsTable;
  const rows = await db
    .select({ id: C.id, amount: C.amount, createdAt: C.createdAt })
    .from(C)
    .where(and(eq(C.shareId, shareId), eq(C.status, "pending")))
    .orderBy(desc(C.id));
  return rows;
}
