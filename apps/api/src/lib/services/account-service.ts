import { and, eq, sql } from "drizzle-orm";
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
  const now = new Date();
  return tx
    .insert(accountsTable)
    .values(
      DEFAULT_ACCOUNTS.map(({ isDefault, ...a }) => ({
        ...a,
        userId,
        defaultSince: isDefault ? now : null,
      })),
    )
    .returning();
}

/** The user's default account, else their oldest active one. */
export async function defaultAccountId(userId: number, tx: DB | TX = db) {
  const [row] = await tx
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(
      and(eq(accountsTable.userId, userId), eq(accountsTable.status, "active")),
    )
    .orderBy(sql`${accountsTable.defaultSince} nulls last`, accountsTable.id)
    .limit(1);
  if (row) return row.id;
  // Safety net: a user with no accounts gets the defaults.
  const created = await seedDefaultAccounts(tx, userId);
  return created[0]!.id;
}

const ownedAccountQuery = db
  .select()
  .from(accountsTable)
  .where(
    and(
      eq(accountsTable.id, sql.placeholder("id")),
      eq(accountsTable.userId, sql.placeholder("userId")),
    ),
  )
  .limit(1)
  .prepare("owned_account");

export async function ownedAccount(userId: number, id: number) {
  const [a] = await ownedAccountQuery.execute({ id, userId });
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
  if (a.status === "archived")
    return { ok: false as const, message: `"${a.name}" is archived` };
  return { ok: true as const, id: a.id };
}

const A = accountsTable;
const T = transactionsTable;
const TR = transfersTable;
const R = recurringRulesTable;

// Each sum is a correlated subquery on an index that leads with the account
// id and carries the amount, so one round trip reads the accounts and
// answers every total from indexes alone. Names are spelled out because
// drizzle drops the table prefix from columns in a single-table select,
// which would turn `account_id = accounts.id` into `account_id = id`.
const ofAccount = (column: string) => sql.raw(`${column} = "accounts"."id"`);
const txnSum = (type: "credit" | "debit") =>
  sql<string>`(select coalesce(sum(t.amount), 0) from ${T} t where ${ofAccount("t.account_id")} and t.type = ${sql.raw(`'${type}'`)})`;
const transferSum = (column: "from_account_id" | "to_account_id") =>
  sql<string>`(select coalesce(sum(tr.amount), 0) from ${TR} tr where ${ofAccount(`tr.${column}`)})`;

const balanceColumns = {
  income: txnSum("credit"),
  expense: txnSum("debit"),
  transfersOut: transferSum("from_account_id"),
  transfersIn: transferSum("to_account_id"),
};

const usageColumn = sql<number>`(
  (select count(*) from ${T} t where ${ofAccount("t.account_id")})
  + (select count(*) from ${TR} tr where ${ofAccount("tr.from_account_id")} or ${ofAccount("tr.to_account_id")})
  + (select count(*) from ${R} r where ${ofAccount("r.account_id")})
)::int`;

/** Balance per account (rupees): opening + credits − debits − transfers out + transfers in. */
export async function accountBalances(userId: number, accountId?: number) {
  const rows = await db
    .select({ account: A, ...balanceColumns, usage: usageColumn })
    .from(A)
    .where(
      and(eq(A.userId, userId), accountId ? eq(A.id, accountId) : undefined),
    )
    .orderBy(sql`${A.defaultSince} nulls last`, A.id);
  return rows.map(({ account: a, ...r }) => {
    const balance =
      a.openingBalance +
      Number(r.income) -
      Number(r.expense) -
      Number(r.transfersOut) +
      Number(r.transfersIn);
    return {
      ...a,
      openingBalance: toRupees(a.openingBalance),
      balance: toRupees(balance),
      income: toRupees(r.income),
      expense: toRupees(r.expense),
      transfersOut: toRupees(r.transfersOut),
      transfersIn: toRupees(r.transfersIn),
      /** Transactions, transfers and recurring rules referencing this account. */
      usage: r.usage,
    };
  });
}

const totalBalanceQuery = db
  .select({
    total: sql<string>`coalesce(sum("accounts"."opening_balance" + ${balanceColumns.income} - ${balanceColumns.expense} - ${balanceColumns.transfersOut} + ${balanceColumns.transfersIn}), 0)`,
  })
  .from(A)
  .where(and(eq(A.userId, sql.placeholder("userId")), eq(A.status, "active")))
  .prepare("total_balance");

/** Sum of active accounts' balances (rupees). */
export async function totalBalance(userId: number) {
  const [row] = await totalBalanceQuery.execute({ userId });
  return toRupees(row?.total);
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
