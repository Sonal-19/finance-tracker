import Elysia, { t } from "elysia";
import { systemConfigService } from "$/lib/services/system-config-service";
import { ok } from "$/lib/utils";
import { protectedAdmin } from "$/pre-processor";

// NOTE TO FUTURE EDITORS: this schema is the admin page's write contract for
// SYSTEM_CONFIG (db/schema/system/system-config.sql.ts). A key missing here
// is stripped from incoming patches, so admins can't change it. Keep it in
// lockstep with the defaults and the form in
// apps/web/src/routes/_app/system-config.tsx - see
// docs/HOW_TO_ADD_SYSTEM_CONFIG_FIELD.md.
export const UpdateSystemConfigSchema = t.Object({
  AUTH: t.Optional(
    t.Object({
      REGISTRATION_ENABLED: t.Boolean(),
      PASSKEY_LOGIN_ENABLED: t.Boolean(),
      /** 0 = unlimited */
      MAX_PASSKEYS_PER_USER: t.Integer({ minimum: 0, maximum: 1000 }),
    }),
  ),
  FX: t.Optional(
    t.Object({
      FALLBACK_USD_INR: t.Number({ minimum: 1, maximum: 10_000 }),
    }),
  ),
  NOTICE: t.Optional(
    t.Object({
      ENABLED: t.Boolean(),
      MESSAGE: t.String({ maxLength: 500 }),
    }),
  ),
});

export const systemConfigController = new Elysia({
  name: "system_config_controller",
  prefix: "/admin/system-config",
})
  .use(protectedAdmin)
  .get("/", () => ok(systemConfigService.SYSTEM_CONFIG))
  .patch(
    "/",
    async ({ user, body }) =>
      ok(
        await systemConfigService.update(body, user.id),
        "System config saved",
      ),
    { body: UpdateSystemConfigSchema },
  );
