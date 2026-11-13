import { and, eq } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import {
  DASHBOARD_ACCOUNTS,
  DASHBOARD_HEROES,
  taggedExpenseModes,
  userBlocksTable,
  usersTable,
} from "$/db/schema";
import { coreAuthService } from "$/lib/services/core-auth-service";
import { publicUser } from "$/lib/services/session-service";
import { systemConfigService } from "$/lib/services/system-config-service";
import { userCacheService } from "$/lib/services/user-cache-service";
import {
  type UserConfigPatch,
  userConfigService,
} from "$/lib/services/user-config-service";
import { deleteUser } from "$/lib/services/user-service";
import {
  isUniqueViolation,
  normalizeUsername,
  USERNAME_COOLDOWN_DAYS,
  USERNAME_PATTERN,
  usernameService,
  validateUsername,
} from "$/lib/services/username-service";
import { fail, ok } from "$/lib/utils";
import { tEnum } from "$/lib/utils/schema";
import {
  cleanShortcuts,
  resolveShortcuts,
  shortcutProblems,
} from "$/lib/utils/shortcuts";
import {
  cleanThemeColors,
  DARK_STYLES,
  THEME_CHOICES,
  themeErrors,
} from "$/lib/utils/theme";
import { protectedUser } from "$/pre-processor";

const tPalette = t.Record(t.String(), t.String({ maxLength: 9 }));

// NOTE TO FUTURE EDITORS: the write contract for USER_CONFIG
// (db/schema/users/user-config.sql.ts). A key missing here is stripped from
// patches. Each group is optional; inside one, every key is optional too and
// replaces the saved value as a whole.
export const UpdateUserConfigSchema = t.Object({
  /** action id → keys; only the differences from the admin's defaults */
  SHORTCUTS: t.Optional(t.Record(t.String(), t.String({ maxLength: 40 }))),
  THEME: t.Optional(
    t.Partial(
      t.Object({
        MODE: tEnum(THEME_CHOICES),
        SYSTEM_DARK: tEnum(DARK_STYLES),
        PRESET: t.String({ maxLength: 20 }),
        LIGHT: tPalette,
        DARK: tPalette,
        AMOLED: tPalette,
      }),
    ),
  ),
  DASHBOARD: t.Optional(
    t.Partial(
      t.Object({
        HERO: tEnum(DASHBOARD_HEROES),
        ACCOUNTS: tEnum(DASHBOARD_ACCOUNTS),
      }),
    ),
  ),
});

export const profileController = new Elysia({
  name: "profile_controller",
  prefix: "/profile",
})
  .use(protectedUser)
  .patch(
    "/",
    async ({ user, body, status }) => {
      let username: string | undefined;
      if (body.username !== undefined) {
        const next = normalizeUsername(body.username);
        if (next !== user.username) {
          const invalid = validateUsername(next);
          if (invalid) return status(400, fail(invalid));
          const waitMs = user.usernameChangedAt
            ? user.usernameChangedAt.getTime() +
              USERNAME_COOLDOWN_DAYS * 86_400_000 -
              Date.now()
            : 0;
          if (waitMs > 0)
            return status(
              429,
              fail(
                `You can change your username again in ${Math.ceil(waitMs / 86_400_000)} day(s)`,
              ),
            );
          if (usernameService.isTaken(next))
            return status(409, fail("That username is taken"));
          username = next;
        }
      }
      let updated: typeof usersTable.$inferSelect | undefined;
      try {
        [updated] = await db
          .update(usersTable)
          .set({
            ...(username !== undefined && {
              username,
              usernameChangedAt: new Date(),
            }),
            ...(body.taggedExpenses && {
              taggedExpenses: body.taggedExpenses,
            }),
            ...(body.name !== undefined && { name: body.name.trim() }),
            ...(body.monthlyBudget !== undefined && {
              monthlyBudget: body.monthlyBudget,
            }),
          })
          .where(eq(usersTable.id, user.id))
          .returning();
      } catch (e) {
        if (isUniqueViolation(e))
          return status(409, fail("That username is taken"));
        throw e;
      }
      userCacheService.set(updated!);
      if (username) usernameService.set(user.id, username, user.username);
      return ok(publicUser(updated!), "Profile updated");
    },
    {
      body: t.Object({
        username: t.Optional(t.String({ pattern: USERNAME_PATTERN })),
        taggedExpenses: t.Optional(tEnum(taggedExpenseModes)),
        name: t.Optional(t.String({ minLength: 2, maxLength: 80 })),
        monthlyBudget: t.Optional(t.Nullable(t.Integer({ minimum: 0 }))),
      }),
    },
  )
  /** The user's preferences (shortcuts, theme, dashboard), defaults filled in. */
  .get("/config", async ({ user }) => ok(await userConfigService.get(user.id)))
  .patch(
    "/config",
    async ({ user, body, status }) => {
      const patch: UserConfigPatch = { ...body };
      const system = systemConfigService.SYSTEM_CONFIG;
      if (body.SHORTCUTS) {
        // Checked together with the admin's defaults they sit on top of.
        // Strict here: new keys must fit around today's defaults. (Only a
        // later change to the defaults gives way to them, in resolveShortcuts.)
        const own = cleanShortcuts(body.SHORTCUTS);
        const [problem] = Object.values(
          shortcutProblems({
            ...resolveShortcuts(system.SHORTCUTS.DEFAULTS, null),
            ...own,
          }),
        );
        if (problem) return status(400, fail(problem));
        patch.SHORTCUTS = own;
      }
      if (body.THEME) {
        const current = (await userConfigService.get(user.id)).THEME;
        const colors = cleanThemeColors({ ...current, ...body.THEME });
        const [problem] = themeErrors(system.THEME, colors);
        if (problem) return status(400, fail(problem));
        patch.THEME = {
          ...body.THEME,
          ...(body.THEME.PRESET !== undefined && { PRESET: colors.PRESET }),
          ...(body.THEME.LIGHT && { LIGHT: colors.LIGHT }),
          ...(body.THEME.DARK && { DARK: colors.DARK }),
          ...(body.THEME.AMOLED && { AMOLED: colors.AMOLED }),
        };
      }
      return ok(await userConfigService.update(user.id, patch), "Saved");
    },
    { body: UpdateUserConfigSchema },
  )
  .get("/blocks", async ({ user }) => {
    const rows = await db
      .select({ username: usersTable.username, name: usersTable.name })
      .from(userBlocksTable)
      .innerJoin(usersTable, eq(usersTable.id, userBlocksTable.blockedUserId))
      .where(eq(userBlocksTable.userId, user.id))
      .orderBy(usersTable.username);
    return ok(rows);
  })
  .post(
    "/blocks",
    async ({ user, body, status }) => {
      const id = usernameService.findUserId(normalizeUsername(body.username));
      if (id === null) return status(404, fail("No user with that username"));
      if (id === user.id) return status(400, fail("You can't block yourself"));
      await db
        .insert(userBlocksTable)
        .values({ userId: user.id, blockedUserId: id })
        .onConflictDoNothing();
      return ok(null, "Blocked. They can't tag you on splits.");
    },
    { body: t.Object({ username: t.String({ maxLength: 40 }) }) },
  )
  .delete(
    "/blocks/:username",
    async ({ user, params, status }) => {
      const id = usernameService.findUserId(normalizeUsername(params.username));
      if (id === null) return status(404, fail("No user with that username"));
      await db
        .delete(userBlocksTable)
        .where(
          and(
            eq(userBlocksTable.userId, user.id),
            eq(userBlocksTable.blockedUserId, id),
          ),
        );
      return ok(null, "Unblocked");
    },
    { params: t.Object({ username: t.String({ maxLength: 40 }) }) },
  )
  .post(
    "/change-password",
    async ({ user, token, body, status }) => {
      const valid = await Bun.password.verify(
        body.currentPassword,
        user.passwordHash,
      );
      if (!valid) return status(400, fail("Current password is incorrect"));
      await db
        .update(usersTable)
        .set({ passwordHash: await Bun.password.hash(body.newPassword) })
        .where(eq(usersTable.id, user.id));
      userCacheService.invalidate(user.id);
      await coreAuthService.revokeAllForUser(user.id, token ?? undefined);
      return ok(null, "Password changed");
    },
    {
      body: t.Object({
        currentPassword: t.String({ minLength: 1 }),
        newPassword: t.String({ minLength: 8, maxLength: 128 }),
      }),
    },
  )
  .delete(
    "/",
    async ({ user, body, status, cookie }) => {
      const valid = await Bun.password.verify(body.password, user.passwordHash);
      if (!valid) return status(400, fail("Password is incorrect"));
      if (user.masterSince)
        return status(
          400,
          fail("Make another admin the master before deleting your account"),
        );
      await deleteUser(user);
      cookie?.token?.remove();
      return ok(null, "Account deleted");
    },
    { body: t.Object({ password: t.String({ minLength: 1 }) }) },
  );
