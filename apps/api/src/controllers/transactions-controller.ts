import { and, desc, eq } from "drizzle-orm";

import Elysia, { t } from "elysia";
import { db } from "$/db";
import { paymentMethods, transactionsTable, txnTypes } from "$/db/schema";
import { resolveAccountId } from "$/lib/services/account-service";
import { foreignCurrencies, fxService } from "$/lib/services/fx-service";
import {
  getTransaction,
  listTransactions,
  ownedCategory,
  ownedEventId,
  selectTxns,
  type TxnFilters,
  txnWhere,
} from "$/lib/services/transaction-service";
import { csvEscape, fail, ok } from "$/lib/utils";
import { toPaise, toRupees } from "$/lib/utils/money";
import { tEnum } from "$/lib/utils/schema";
import { protectedUser } from "$/pre-processor";

const tDate = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const tAmount = t.Number({ exclusiveMinimum: 0, maximum: 1_000_000_000 });

const filterQuery = t.Object({
  type: t.Optional(tEnum(txnTypes)),
  categoryIds: t.Optional(t.String()),
  paymentMethod: t.Optional(tEnum(paymentMethods)),
  accountId: t.Optional(t.Numeric({ minimum: 1 })),
  /** 0 = transactions not in any event */
  eventId: t.Optional(t.Numeric({ minimum: 0 })),
  from: t.Optional(tDate),
  to: t.Optional(tDate),
  q: t.Optional(t.String({ maxLength: 100 })),
  minAmount: t.Optional(t.Numeric()),
  maxAmount: t.Optional(t.Numeric()),
});

type FilterQuery = typeof filterQuery.static;

function toFilters(q: FilterQuery): TxnFilters {
  return {
    type: q.type,
    paymentMethod: q.paymentMethod,
    accountId: q.accountId,
    eventId: q.eventId,
    from: q.from,
    to: q.to,
    q: q.q,
    categoryIds: q.categoryIds
      ?.split(",")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0),
    minAmount: q.minAmount !== undefined ? toPaise(q.minAmount) : undefined,
    maxAmount: q.maxAmount !== undefined ? toPaise(q.maxAmount) : undefined,
  };
}

const currencies = ["INR", ...foreignCurrencies] as const;
type Currency = (typeof currencies)[number];

/** Resolves the INR paise to store plus the original-currency columns. */
async function convert(
  amount: number,
  currency: Currency,
  date: string,
  manualRate?: number,
) {
  if (currency === "INR")
    return {
      amount: toPaise(amount),
      originalAmount: null,
      originalCurrency: null,
      fxRate: null,
    };
  const rate = manualRate ?? (await fxService.forDate(currency, date)).rate;
  return {
    amount: toPaise(amount * rate),
    originalAmount: toPaise(amount),
    originalCurrency: currency,
    fxRate: rate,
  };
}

const txnBody = t.Object({
  type: tEnum(txnTypes),
  /** In `currency` (INR when omitted). Stored converted to INR. */
  amount: tAmount,
  currency: t.Optional(tEnum(currencies)),
  /** Optional manual rate (e.g. what the bank actually charged). */
  fxRate: t.Optional(t.Number({ exclusiveMinimum: 0, maximum: 100_000 })),
  categoryId: t.Integer({ minimum: 1 }),
  date: tDate,
  paymentMethod: tEnum(paymentMethods),
  /** Omitted = the user's default account. */
  accountId: t.Optional(t.Integer({ minimum: 1 })),
  eventId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  note: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
});

const ymdOf = (d: string | Date) =>
  d instanceof Date ? d.toISOString().slice(0, 10) : d.slice(0, 10);

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank transfer",
  debit_card: "Debit card",
  credit_card: "Credit card",
  other: "Other",
};

export const transactionsController = new Elysia({
  name: "transactions_controller",
  prefix: "/transactions",
})
  .use(protectedUser)
  .get(
    "/",
    async ({ user, query }) => {
      const limit = Math.min(query.limit ?? 30, 100);
      const offset = query.offset ?? 0;
      return ok(
        await listTransactions(user.id, toFilters(query), { limit, offset }),
      );
    },
    {
      query: t.Composite([
        filterQuery,
        t.Object({
          limit: t.Optional(t.Numeric({ minimum: 1 })),
          offset: t.Optional(t.Numeric({ minimum: 0 })),
        }),
      ]),
    },
  )
  .get(
    "/export.csv",
    async ({ user, query, set }) => {
      const rows = await selectTxns()
        .where(txnWhere(user.id, toFilters(query)))
        .orderBy(desc(transactionsTable.date), desc(transactionsTable.id));
      const header = [
        "Date",
        "Type",
        "Category",
        "Account",
        "Event",
        "Amount (INR)",
        "Payment method",
        "Note",
        "Original amount",
        "Original currency",
        "Exchange rate",
      ];
      const lines = rows.map((r) =>
        [
          r.date,
          r.type === "credit" ? "Credit" : "Debit",
          r.category.name,
          r.account.name,
          r.event?.name,
          toRupees(r.amount).toFixed(2),
          PAYMENT_LABEL[r.paymentMethod],
          r.note,
          r.originalAmount === null
            ? ""
            : toRupees(r.originalAmount).toFixed(2),
          r.originalCurrency,
          r.fxRate,
        ]
          .map(csvEscape)
          .join(","),
      );
      set.headers["Content-Type"] = "text/csv; charset=utf-8";
      set.headers["Content-Disposition"] =
        `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`;
      return [header.join(","), ...lines].join("\n");
    },
    { query: filterQuery },
  )
  .get(
    "/:id",
    async ({ user, params, status }) => {
      const txn = await getTransaction(user.id, params.id);
      return txn ? ok(txn) : status(404, fail("Transaction not found"));
    },
    { params: t.Object({ id: t.Numeric() }) },
  )
  .post(
    "/",
    async ({ user, body, status }) => {
      const cat = await ownedCategory(user.id, body.categoryId, body.type);
      if (!cat.ok) return status(400, fail(cat.message));
      const account = await resolveAccountId(user.id, body.accountId);
      if (!account.ok) return status(400, fail(account.message));
      const event = await ownedEventId(user.id, body.eventId);
      if (!event.ok) return status(400, fail(event.message));
      const { currency = "INR", fxRate, ...rest } = body;
      const [row] = await db
        .insert(transactionsTable)
        .values({
          ...rest,
          accountId: account.id,
          eventId: event.id,
          ...(await convert(body.amount, currency, body.date, fxRate)),
          note: body.note?.trim() || null,
          userId: user.id,
        })
        .returning({ id: transactionsTable.id });
      return ok(await getTransaction(user.id, row!.id), "Transaction added");
    },
    { body: txnBody },
  )
  .patch(
    "/:id",
    async ({ user, params, body, status }) => {
      const existing = await getTransaction(user.id, params.id);
      if (!existing) return status(404, fail("Transaction not found"));
      const type = body.type ?? existing.type;
      const categoryId = body.categoryId ?? existing.category.id;
      const cat = await ownedCategory(user.id, categoryId, type);
      if (!cat.ok) return status(400, fail(cat.message));
      let accountId: number | undefined;
      if (body.accountId !== undefined) {
        const account = await resolveAccountId(user.id, body.accountId);
        if (!account.ok) return status(400, fail(account.message));
        accountId = account.id;
      }
      let eventId: number | null | undefined;
      if (body.eventId !== undefined) {
        const event = await ownedEventId(user.id, body.eventId);
        if (!event.ok) return status(400, fail(event.message));
        eventId = event.id;
      }
      // Re-convert only when the amount, currency or rate changed. Keep the
      // rate originally used unless a new one is given or the currency changed.
      const prevCurrency = (existing.originalCurrency ?? "INR") as Currency;
      const currency = body.currency ?? prevCurrency;
      const reconvert =
        body.amount !== undefined ||
        body.currency !== undefined ||
        body.fxRate !== undefined;
      const money = reconvert
        ? await convert(
            body.amount ??
              (currency === prevCurrency && existing.originalAmount !== null
                ? existing.originalAmount
                : existing.amount),
            currency,
            body.date ?? ymdOf(existing.date),
            body.fxRate ??
              (currency === prevCurrency
                ? (existing.fxRate ?? undefined)
                : undefined),
          )
        : {};
      await db
        .update(transactionsTable)
        .set({
          type,
          categoryId,
          ...money,
          ...(accountId !== undefined && { accountId }),
          ...(eventId !== undefined && { eventId }),
          ...(body.date !== undefined && { date: body.date }),
          ...(body.paymentMethod !== undefined && {
            paymentMethod: body.paymentMethod,
          }),
          ...(body.note !== undefined && { note: body.note?.trim() || null }),
        })
        .where(
          and(
            eq(transactionsTable.id, params.id),
            eq(transactionsTable.userId, user.id),
          ),
        );
      return ok(
        await getTransaction(user.id, params.id),
        "Transaction updated",
      );
    },
    { params: t.Object({ id: t.Numeric() }), body: t.Partial(txnBody) },
  )
  .delete(
    "/:id",
    async ({ user, params, status }) => {
      const [row] = await db
        .delete(transactionsTable)
        .where(
          and(
            eq(transactionsTable.id, params.id),
            eq(transactionsTable.userId, user.id),
          ),
        )
        .returning();
      if (!row) return status(404, fail("Transaction not found"));
      return ok(
        {
          ...row,
          amount: toRupees(row.amount),
          originalAmount:
            row.originalAmount === null ? null : toRupees(row.originalAmount),
        },
        "Transaction deleted",
      );
    },
    { params: t.Object({ id: t.Numeric() }) },
  );
