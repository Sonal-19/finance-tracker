import Elysia, { t } from "elysia";
import { IS_PROD } from "$/env";
import { mailService } from "$/lib/services/mail-service";
import { systemConfigService } from "$/lib/services/system-config-service";
import { fail, ok } from "$/lib/utils";
import {
  cleanShortcuts,
  resolveShortcuts,
  shortcutProblems,
} from "$/lib/utils/shortcuts";
import {
  cleanThemeColors,
  DEFAULT_PRESET,
  themeErrors,
} from "$/lib/utils/theme";
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
      REGISTRATION_OTP_REQUIRED: t.Boolean(),
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
  SHORTCUTS: t.Optional(
    t.Object({
      /** action id → keys; checked with shortcutProblems before saving */
      DEFAULTS: t.Record(t.String(), t.String({ maxLength: 40 })),
    }),
  ),
  THEME: t.Optional(
    t.Object({
      /** a preset id from lib/utils/theme.ts */
      PRESET: t.String({ maxLength: 20 }),
      /** token → "#rrggbb"; checked with themeErrors before saving */
      LIGHT: t.Record(t.String(), t.String({ maxLength: 9 })),
      DARK: t.Record(t.String(), t.String({ maxLength: 9 })),
      AMOLED: t.Record(t.String(), t.String({ maxLength: 9 })),
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
    async ({ user, body, status }) => {
      // Without SMTP no code can be delivered, so this would lock sign-ups.
      if (
        body.AUTH?.REGISTRATION_OTP_REQUIRED &&
        IS_PROD &&
        !mailService.configured
      )
        return status(
          400,
          fail("Set up SMTP on the server before requiring an email code"),
        );
      if (body.SHORTCUTS) {
        const defaults = resolveShortcuts(body.SHORTCUTS.DEFAULTS, null);
        const [problem] = Object.values(shortcutProblems(defaults));
        if (problem) return status(400, fail(`Shortcuts: ${problem}`));
        body.SHORTCUTS.DEFAULTS = cleanShortcuts(defaults);
      }
      if (body.THEME) {
        const colors = cleanThemeColors(body.THEME);
        const [problem] = themeErrors(colors);
        if (problem) return status(400, fail(`Theme: ${problem}`));
        body.THEME = { ...colors, PRESET: colors.PRESET || DEFAULT_PRESET };
      }
      return ok(
        await systemConfigService.update(body, user.id),
        "System config saved",
      );
    },
    { body: UpdateSystemConfigSchema },
  );
