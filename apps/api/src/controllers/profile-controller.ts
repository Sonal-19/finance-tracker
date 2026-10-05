import { and, eq } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import { userBlocksTable, usersTable } from "$/db/schema";
import { coreAuthService } from "$/lib/services/core-auth-service";
import { publicUser } from "$/lib/services/session-service";
import {
  isUniqueViolation,
  normalizeUsername,
  USERNAME_COOLDOWN_DAYS,
  USERNAME_PATTERN,
  usernameService,
  validateUsername,
} from "$/lib/services/username-service";
import { fail, ok } from "$/lib/utils";
import { toPaise } from "$/lib/utils/money";
import { protectedUser } from "$/pre-processor";

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
            ...(body.addTaggedExpenses !== undefined && {
              addTaggedExpenses: body.addTaggedExpenses,
            }),
            ...(body.name !== undefined && { name: body.name.trim() }),
            ...(body.monthlyBudget !== undefined && {
              monthlyBudget:
                body.monthlyBudget === null
                  ? null
                  : toPaise(body.monthlyBudget),
            }),
          })
          .where(eq(usersTable.id, user.id))
          .returning();
      } catch (e) {
        if (isUniqueViolation(e))
          return status(409, fail("That username is taken"));
        throw e;
      }
      if (username) usernameService.set(user.id, username, user.username);
      return ok(publicUser(updated!), "Profile updated");
    },
    {
      body: t.Object({
        username: t.Optional(t.String({ pattern: USERNAME_PATTERN })),
        addTaggedExpenses: t.Optional(t.Boolean()),
        name: t.Optional(t.String({ minLength: 2, maxLength: 80 })),
        monthlyBudget: t.Optional(t.Nullable(t.Number({ minimum: 0 }))),
      }),
    },
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
      await coreAuthService.revokeAllForUser(user.id);
      await db.delete(usersTable).where(eq(usersTable.id, user.id));
      cookie?.token?.remove();
      return ok(null, "Account deleted");
    },
    { body: t.Object({ password: t.String({ minLength: 1 }) }) },
  );
