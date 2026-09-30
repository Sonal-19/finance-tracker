import { and, asc, desc, eq, sql } from "drizzle-orm";
import { type DB, db, type TX } from "$/db";
import {
  accountsTable,
  type InsertTransaction,
  recurringRulesTable,
  transactionsTable,
  transfersTable,
} from "$/db/schema";
import { toRupees } from "$/lib/utils/money";

export const DEFAULT_ACCOUNTS = [
  {
    name: "Bank account",
    type: "bank",
    icon: "landmark",
    color: "#2563eb",
    isDefault: true,
  },
  {
    name: "Cash",
    type: "cash",
    icon: "banknote",
    color: "#16a34a",
    isDefault: false,
  },
] as const;

/** Every new user starts with a bank account (default) and a cash wallet. */
export async function seedDefaultAccounts(tx: DB | TX, userId: number) {
  return tx
    .insert(accountsTable)
    .values(DEFAULT_ACCOUNTS.map((a) => ({ ...a, userId })))
    .returning();
}

export async function defaultAccountId(userId: number, tx: DB | TX = db) {
  const [row] = await tx
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.userId, userId),
        eq(accountsTable.isArchived, false),
      ),
    )
    .orderBy(desc(accountsTable.isDefault), asc(accountsTable.id))
    .limit(1);
  if (row) return row.id;
  // Safety net: a user with no accounts gets the defaults.
  const created = await seedDefaultAccounts(tx, userId);
  return created[0]!.id;
}

export async function ownedAccount(userId: number, id: number) {
  const [a] = await db
    .select()
    .from(accountsTable)
    .where(and(eq(accountsTable.id, id), eq(accountsTable.userId, userId)))
    .limit(1);
  return a;
}

/** Resolves a requested account (must be the user's and not archived) or the default one. */
export async function resolveAccountId(
  userId: number,
  requested?: number | null,
) {
  if (!requested)
    return { ok: true as const, id: await defaultAccountId(userId) };
  const a = await ownedAccount(userId, requested);
  if (!a) return { ok: false as const, message: "Account not found" };
  if (a.isArchived)
    return { ok: false as const, message: `"${a.name}" is archived` };
  return { ok: true as const, id: a.id };
}

/** Balance per account (paise): opening + credits − debits − transfers out + transfers in. */
export async function accountBalances(userId: number) {
  const T = transactionsTable;
  const TR = transfersTable;
  const R = recurringRulesTable;
  const [accounts, txns, outs, ins, rules] = await Promise.all([
    db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.userId, userId))
      .orderBy(desc(accountsTable.isDefault), asc(accountsTable.id)),
    db
      .select({
        accountId: T.accountId,
        income: sql<string>`coalesce(sum(${T.amount}) filter (where ${T.type} = 'credit'), 0)`,
        expense: sql<string>`coalesce(sum(${T.amount}) filter (where ${T.type} = 'debit'), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(T)
      .where(eq(T.userId, userId))
      .groupBy(T.accountId),
    db
      .select({
        id: TR.fromAccountId,
        total: sql<string>`sum(${TR.amount})`,
        count: sql<number>`count(*)::int`,
      })
      .from(TR)
      .where(eq(TR.userId, userId))
      .groupBy(TR.fromAccountId),
    db
      .select({
        id: TR.toAccountId,
        total: sql<string>`sum(${TR.amount})`,
        count: sql<number>`count(*)::int`,
      })
      .from(TR)
      .where(eq(TR.userId, userId))
      .groupBy(TR.toAccountId),
    db
      .select({ id: R.accountId, count: sql<number>`count(*)::int` })
      .from(R)
      .where(eq(R.userId, userId))
      .groupBy(R.accountId),
  ]);
  return accounts.map((a) => {
    const t = txns.find((x) => x.accountId === a.id);
    const o = outs.find((x) => x.id === a.id);
    const i = ins.find((x) => x.id === a.id);
    const r = rules.find((x) => x.id === a.id);
    const balance =
      a.openingBalance +
      Number(t?.income ?? 0) -
      Number(t?.expense ?? 0) -
      Number(o?.total ?? 0) +
      Number(i?.total ?? 0);
    return {
      ...a,
      openingBalance: toRupees(a.openingBalance),
      balance: toRupees(balance),
      income: toRupees(t?.income),
      expense: toRupees(t?.expense),
      transfersOut: toRupees(o?.total),
      transfersIn: toRupees(i?.total),
      /** Transactions, transfers and recurring rules referencing this account. */
      usage:
        (t?.count ?? 0) + (o?.count ?? 0) + (i?.count ?? 0) + (r?.count ?? 0),
    };
  });
}

/** Sum of active accounts' balances (rupees). */
export async function totalBalance(userId: number) {
  const list = await accountBalances(userId);
  return list.filter((a) => !a.isArchived).reduce((s, a) => s + a.balance, 0);
}

/** Fills `accountId` on rows that don't have one (used by recurring posts, seeds). */
export async function withAccount(
  userId: number,
  rows: InsertTransaction[],
  tx: DB | TX = db,
) {
  if (rows.every((r) => r.accountId)) return rows;
  const id = await defaultAccountId(userId, tx);
  return rows.map((r) => ({ ...r, accountId: r.accountId ?? id }));
}
