import Elysia, { t } from "elysia";
import { foreignCurrencies, fxService } from "$/lib/services/fx-service";
import { ok } from "$/lib/utils";
import { today } from "$/lib/utils/period";
import { tEnum } from "$/lib/utils/schema";
import { protectedUser } from "$/pre-processor";

export const fxController = new Elysia({ name: "fx_controller", prefix: "/fx" })
  .use(protectedUser)
  .get(
    "/rate",
    async ({ query }) =>
      ok(await fxService.forDate(query.currency, query.date ?? today())),
    {
      query: t.Object({
        currency: tEnum(foreignCurrencies),
        date: t.Optional(t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
      }),
    },
  );
