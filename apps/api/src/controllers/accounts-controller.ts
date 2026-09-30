import { and, desc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import { accountsTable, accountTypes, transfersTable } from "$/db/schema";
import { accountBalances, ownedAccount } from "$/lib/services/account-service";
import { fail, ok } from "$/lib/utils";
import { toPaise, toRupees } from "$/lib/utils/money";
import { today } from "$/lib/utils/period";
import { tEnum } from "$/lib/utils/schema";
import { protectedUser } from "$/pre-processor";

const tId = t.Object({ id: t.Numeric() });
const tDate = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

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

const accountBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 40 }),
  type: tEnum(accountTypes),
  icon: t.String({ pattern: "^[a-z0-9-]{1,40}$" }),
  color: t.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
  /** Rupees; negative for a credit card that already has dues. */
  openingBalance: t.Number({ minimum: -1_000_000_000, maximum: 1_000_000_000 }),
});

async function makeDefault(userId: number, id: number) {
  await db.transaction(async (tx) => {
    await tx
      .update(accountsTable)
      .set({ isDefault: false })
      .where(eq(accountsTable.userId, userId));
    await tx
      .update(accountsTable)
      .set({ isDefault: true })
      .where(and(eq(accountsTable.id, id), eq(accountsTable.userId, userId)));
  });
}

const accountsController = new Elysia({
  name: "accounts_controller",
  prefix: "/accounts",
})
  .use(protectedUser)
  .get("/", async ({ user }) => {
    const accounts = await accountBalances(user.id);
    const active = accounts.filter((a) => !a.isArchived);
    return ok({
      accounts,
      total: active.reduce((s, a) => s + a.balance, 0),
      /** What you have (positive balances) vs what you owe (e.g. card dues). */
      assets: active
        .filter((a) => a.balance > 0)
        .reduce((s, a) => s + a.balance, 0),
      liabilities: -active
        .filter((a) => a.balance < 0)
        .reduce((s, a) => s + a.balance, 0),
    });
  })
  .get(
    "/:id",
    async ({ user, params, status }) => {
      const account = (await accountBalances(user.id)).find(
        (a) => a.id === params.id,
      );
      return account ? ok(account) : status(404, fail("Account not found"));
    },
    { params: tId },
  )
  .post(
    "/",
    async ({ user, body, status }) => {
      try {
        const [row] = await db
          .insert(accountsTable)
          .values({
            ...body,
            name: body.name.trim(),
            openingBalance: toPaise(body.openingBalance),
            userId: user.id,
          })
          .returning();
        return ok(row!, `${row!.name} added`);
      } catch (e) {
        if (isUniqueViolation(e))
          return status(
            409,
            fail("You already have an account with this name"),
          );
        throw e;
      }
    },
    { body: accountBody },
  )
  .patch(
    "/:id",
    async ({ user, params, body, status }) => {
      const account = await ownedAccount(user.id, params.id);
      if (!account) return status(404, fail("Account not found"));
      if (body.isArchived && account.isDefault)
        return status(
          400,
          fail("Make another account the default before archiving this one"),
        );
      try {
        await db
          .update(accountsTable)
          .set({
            ...body,
            ...(body.name && { name: body.name.trim() }),
            ...(body.openingBalance !== undefined && {
              openingBalance: toPaise(body.openingBalance),
            }),
          })
          .where(eq(accountsTable.id, account.id));
      } catch (e) {
        if (isUniqueViolation(e))
          return status(
            409,
            fail("You already have an account with this name"),
          );
        throw e;
      }
      return ok(
        null,
        body.isArchived === true
          ? `${account.name} archived`
          : body.isArchived === false
            ? `${account.name} restored`
            : "Account updated",
      );
    },
    {
      params: tId,
      body: t.Composite([
        t.Partial(accountBody),
        t.Object({ isArchived: t.Optional(t.Boolean()) }),
      ]),
    },
  )
  .post(
    "/:id/default",
    async ({ user, params, status }) => {
      const account = await ownedAccount(user.id, params.id);
      if (!account) return status(404, fail("Account not found"));
      if (account.isArchived)
        return status(400, fail("Restore the account first"));
      await makeDefault(user.id, account.id);
      return ok(null, `${account.name} is now your default account`);
    },
    { params: tId },
  )
  .delete(
    "/:id",
    async ({ user, params, status }) => {
      const account = (await accountBalances(user.id)).find(
        (a) => a.id === params.id,
      );
      if (!account) return status(404, fail("Account not found"));
      if (account.isDefault)
        return status(400, fail("You can't delete your default account"));
      if (account.usage > 0)
        return status(
          409,
          fail(
            `${account.name} has ${account.usage} ${account.usage === 1 ? "record" : "records"}. Archive it instead to keep your history.`,
          ),
        );
      await db.delete(accountsTable).where(eq(accountsTable.id, account.id));
      return ok(null, `${account.name} deleted`);
    },
    { params: tId },
  );

/* ============================ transfers ============================ */

const fromAcc = alias(accountsTable, "from_acc");
const toAcc = alias(accountsTable, "to_acc");

const transfersController = new Elysia({
  name: "transfers_controller",
  prefix: "/transfers",
})
  .use(protectedUser)
  .get(
    "/",
    async ({ user, query }) => {
      const TR = transfersTable;
      const rows = await db
        .select({
          id: TR.id,
          amount: TR.amount,
          date: TR.date,
          note: TR.note,
          from: {
            id: fromAcc.id,
            name: fromAcc.name,
            icon: fromAcc.icon,
            color: fromAcc.color,
          },
          to: {
            id: toAcc.id,
            name: toAcc.name,
            icon: toAcc.icon,
            color: toAcc.color,
          },
        })
        .from(TR)
        .innerJoin(fromAcc, eq(fromAcc.id, TR.fromAccountId))
        .innerJoin(toAcc, eq(toAcc.id, TR.toAccountId))
        .where(
          and(
            eq(TR.userId, user.id),
            query.accountId
              ? or(
                  eq(TR.fromAccountId, query.accountId),
                  eq(TR.toAccountId, query.accountId),
                )
              : undefined,
          ),
        )
        .orderBy(desc(TR.date), desc(TR.id))
        .limit(query.limit ?? 50);
      return ok(rows.map((r) => ({ ...r, amount: toRupees(r.amount) })));
    },
    {
      query: t.Object({
        accountId: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
      }),
    },
  )
  .post(
    "/",
    async ({ user, body, status }) => {
      if (body.fromAccountId === body.toAccountId)
        return status(400, fail("Pick two different accounts"));
      const [from, to] = await Promise.all([
        ownedAccount(user.id, body.fromAccountId),
        ownedAccount(user.id, body.toAccountId),
      ]);
      if (!from || !to) return status(404, fail("Account not found"));
      if (from.isArchived || to.isArchived)
        return status(400, fail("Archived accounts can't be used"));
      await db.insert(transfersTable).values({
        userId: user.id,
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: toPaise(body.amount),
        date: body.date ?? today(),
        note: body.note?.trim() || null,
      });
      return ok(
        null,
        `Moved ₹${body.amount.toLocaleString("en-IN")} from ${from.name} to ${to.name}`,
      );
    },
    {
      body: t.Object({
        fromAccountId: t.Integer({ minimum: 1 }),
        toAccountId: t.Integer({ minimum: 1 }),
        amount: t.Number({ exclusiveMinimum: 0, maximum: 1_000_000_000 }),
        date: t.Optional(tDate),
        note: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
      }),
    },
  )
  .delete(
    "/:id",
    async ({ user, params, status }) => {
      const [row] = await db
        .delete(transfersTable)
        .where(
          and(
            eq(transfersTable.id, params.id),
            eq(transfersTable.userId, user.id),
          ),
        )
        .returning();
      return row
        ? ok(null, "Transfer deleted")
        : status(404, fail("Transfer not found"));
    },
    { params: tId },
  );

export const accountControllers = new Elysia({ name: "account_controllers" })
  .use(accountsController)
  .use(transfersController);
