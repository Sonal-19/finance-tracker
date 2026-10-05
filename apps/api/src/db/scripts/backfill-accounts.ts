/**
 * One-off, idempotent migration for existing data when accounts were added:
 * gives every user the default accounts, then assigns every transaction /
 * recurring rule without an account: cash payments → "Cash", the rest →
 * the default account. Run with `bun run --cwd apps/api db:backfill-accounts`
 * after `db:push` has created the nullable `account_id` columns.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "$/db";
import {
  accountsTable,
  recurringRulesTable,
  transactionsTable,
  usersTable,
} from "$/db/schema";
import { seedDefaultAccounts } from "$/lib/services/account-service";

const users = await db.select({ id: usersTable.id }).from(usersTable);
for (const u of users) {
  let accounts = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.userId, u.id));
  if (!accounts.length) accounts = await seedDefaultAccounts(db, u.id);
  const main = accounts.find((a) => a.defaultSince) ?? accounts[0]!;
  const cash = accounts.find((a) => a.type === "cash") ?? main;

  for (const table of [transactionsTable, recurringRulesTable]) {
    await db
      .update(table)
      .set({ accountId: cash.id })
      .where(
        and(
          eq(table.userId, u.id),
          isNull(table.accountId),
          eq(table.paymentMethod, "cash"),
        ),
      );
    await db
      .update(table)
      .set({ accountId: main.id })
      .where(and(eq(table.userId, u.id), isNull(table.accountId)));
  }
}
console.info(`✅ Accounts backfilled for ${users.length} user(s)`);
process.exit(0);
