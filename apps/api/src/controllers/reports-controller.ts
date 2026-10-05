import Elysia, { t } from "elysia";
import { totalBalance } from "$/lib/services/account-service";
import { calendar, summary } from "$/lib/services/report-service";
import { fail, ok } from "$/lib/utils";
import { periods, rangeFor, today } from "$/lib/utils/period";
import { tEnum } from "$/lib/utils/schema";
import { protectedUser } from "$/pre-processor";

const tDate = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const scopeQuery = {
  /** Limit the report to one account. */
  accountId: t.Optional(t.Numeric({ minimum: 1 })),
  /** Limit the report to one event. */
  eventId: t.Optional(t.Numeric({ minimum: 1 })),
  /** Limit the report to one book (default: books that count in totals). */
  bookId: t.Optional(t.Numeric({ minimum: 1 })),
};

export const reportsController = new Elysia({
  name: "reports_controller",
  prefix: "/reports",
})
  .use(protectedUser)
  .get(
    "/summary",
    async ({ user, query, status }) => {
      const period = query.period ?? "month";
      let range: { from: string; to: string };
      if (period === "custom") {
        if (!query.from || !query.to || query.from > query.to)
          return status(400, fail("Pick a valid from/to date range"));
        range = { from: query.from, to: query.to };
      } else {
        range = rangeFor(period, query.date ?? today());
      }
      return ok(
        await summary(user.id, period, range, {
          accountId: query.accountId,
          eventId: query.eventId,
          bookId: query.bookId,
        }),
      );
    },
    {
      query: t.Object({
        period: t.Optional(tEnum(periods)),
        date: t.Optional(tDate),
        from: t.Optional(tDate),
        to: t.Optional(tDate),
        ...scopeQuery,
      }),
    },
  )
  .get(
    "/calendar",
    async ({ user, query }) =>
      ok(
        await calendar(user.id, query.month ?? today().slice(0, 7), {
          accountId: query.accountId,
          eventId: query.eventId,
          bookId: query.bookId,
        }),
      ),
    {
      query: t.Object({
        month: t.Optional(t.String({ pattern: "^\\d{4}-\\d{2}$" })),
        ...scopeQuery,
      }),
    },
  )
  /** Sum of all active accounts' balances. */
  .get("/balance", async ({ user }) =>
    ok({ balance: await totalBalance(user.id) }),
  );
