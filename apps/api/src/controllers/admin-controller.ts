import {
  and,
  count,
  desc,
  eq,
  gt,
  ilike,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import {
  type AdminActionType,
  type AdminPermission,
  accountsTable,
  adminActionsTable,
  adminGrantsTable,
  adminPermissions,
  attachmentsTable,
  authsTable,
  booksTable,
  passkeysTable,
  peopleTable,
  type SelectAuth,
  type SelectUser,
  splitsTable,
  transactionsTable,
  userRoles,
  userStatuses,
  usersTable,
} from "$/db/schema";
import { APP_TZ } from "$/env";
import {
  adminPermissionsOf,
  isMaster,
  lacks,
  targetProblem,
} from "$/lib/services/admin-access-service";
import { coreAuthService } from "$/lib/services/core-auth-service";
import { userCacheService } from "$/lib/services/user-cache-service";
import { createUser, deleteUser } from "$/lib/services/user-service";
import {
  isUniqueViolation,
  normalizeUsername,
  USERNAME_PATTERN,
  usernameService,
  validateUsername,
} from "$/lib/services/username-service";
import { fail, normalizeEmail, ok } from "$/lib/utils";
import { type DeviceKind, describeDevice } from "$/lib/utils/device";
import { addDays, today } from "$/lib/utils/period";
import { tEnum } from "$/lib/utils/schema";
import { protectedAdmin } from "$/pre-processor";

// The only routes that read across users. Return counts and profile fields,
// never anyone's amounts. Any admin sees the overview; everything else needs
// a permission the master admin granted (`authorize`), and roles, grants and
// other admins' accounts are the master's alone.

const SIGNUP_DAYS = 30;
const PAGE_SIZE = 25;

/** A user's sign-up day in the app's timezone, as "yyyy-MM-dd". The zone is
 * inlined (it's server config, not input) so SELECT and GROUP BY are the
 * same expression; as a bind parameter Postgres sees them as different. */
const tz = sql.raw(`'${APP_TZ.replace(/'/g, "''")}'`);
const signupDay = sql<string>`to_char(${usersTable.createdAt} at time zone ${tz}, 'YYYY-MM-DD')`;
const signinDay = sql<string>`to_char(${authsTable.createdAt} at time zone ${tz}, 'YYYY-MM-DD')`;

const profileColumns = {
  id: usersTable.id,
  name: usersTable.name,
  email: usersTable.email,
  username: usersTable.username,
  role: usersTable.role,
  masterSince: usersTable.masterSince,
  status: usersTable.status,
  suspendedAt: usersTable.suspendedAt,
  createdAt: usersTable.createdAt,
};

/** A live session: active and not past its expiry. */
const liveSession = () =>
  and(eq(authsTable.state, "active"), gt(authsTable.expiresAt, new Date()));

const sessionColumns = {
  id: authsTable.id,
  state: authsTable.state,
  ip: authsTable.ip,
  details: authsTable.details,
  createdAt: authsTable.createdAt,
  lastSeenAt: authsTable.lastSeenAt,
  expiresAt: authsTable.expiresAt,
  token: authsTable.token,
};
type SessionRow = Omit<SelectAuth, "userId" | "device">;

/** A session as the admin sees it: device worked out from the User-Agent,
 * and never the token (only whether it's the admin's own). */
const serializeSession = (
  { token, details, lastSeenAt, ...row }: SessionRow,
  ownToken: string | null,
) => ({
  ...row,
  ...describeDevice(details?.userAgent),
  /** Last request, or sign-in when it hasn't been used since. */
  lastSeenAt: lastSeenAt ?? row.createdAt,
  current: token === ownToken,
});

/** Rows `{ key, n }` sorted by count, the rest folded into "Other". */
function tally(values: string[], top = 5) {
  const by = new Map<string, number>();
  for (const v of values)
    by.set(v || "Unknown", (by.get(v || "Unknown") ?? 0) + 1);
  const sorted = [...by].sort((a, b) => b[1] - a[1]);
  const rows = sorted.slice(0, top).map(([key, n]) => ({ key, n }));
  const rest = sorted.slice(top).reduce((n, [, c]) => n + c, 0);
  if (rest) rows.push({ key: "Other", n: rest });
  return rows;
}

const logAction = (
  adminId: number,
  action: AdminActionType,
  targetUserId: number | null,
  details?: Record<string, string | number>,
) =>
  db
    .insert(adminActionsTable)
    .values({ adminId, action, targetUserId, details: details ?? null })
    .execute()
    .catch(console.error);

const tId = t.Object({ id: t.Numeric({ minimum: 1 }) });

async function findUser(id: number) {
  const [row] = await db
    .select({ ...profileColumns })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  return row;
}
type Target = NonNullable<Awaited<ReturnType<typeof findUser>>>;

type Denied = { code: 400 | 403 | 404; message: string };
const MASTER_ONLY = "Only the master admin can do that";

/** Checks `admin` may do `need` (a permission, or "master"). With a
 * `targetId`, also loads that user and checks they may act on them. */
async function authorize(
  admin: SelectUser,
  need: AdminPermission | "master",
): Promise<Denied | null>;
async function authorize(
  admin: SelectUser,
  need: AdminPermission | "master",
  targetId: number,
): Promise<Denied | Target>;
async function authorize(
  admin: SelectUser,
  need: AdminPermission | "master",
  targetId?: number,
): Promise<Denied | Target | null> {
  if (need === "master") {
    if (!isMaster(admin)) return { code: 403, message: MASTER_ONLY };
  } else {
    const missing = await lacks(admin, need);
    if (missing) return { code: 403, message: missing };
  }
  if (targetId === undefined) return null;
  const target = await findUser(targetId);
  if (!target) return { code: 404, message: "User not found" };
  const problem = targetProblem(admin, target);
  return problem ? { code: 403, message: problem } : target;
}
const denied = (r: unknown): r is Denied =>
  !!r && typeof r === "object" && "code" in r;

export const adminController = new Elysia({
  name: "admin_controller",
  prefix: "/admin",
})
  .use(protectedAdmin)
  /** The signed-in admin's own access, so the console shows only what works. */
  .get("/me", async ({ user }) =>
    ok({
      master: isMaster(user),
      permissions: await adminPermissionsOf(user),
    }),
  )
  .get("/overview", async () => {
    const now = new Date();
    const end = today();
    const from = addDays(end, -(SIGNUP_DAYS - 1));
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

    const [[users], [sessions], [txns], [splits], perDay, live, signinsPerDay] =
      await Promise.all([
        db
          .select({
            total: count(),
            admins: count(
              sql`case when ${usersTable.role} = 'admin' then 1 end`,
            ),
            suspended: count(
              sql`case when ${usersTable.status} = 'suspended' then 1 end`,
            ),
            today: count(sql`case when ${signupDay} = ${end} then 1 end`),
            last7: count(
              sql`case when ${signupDay} >= ${addDays(end, -6)} then 1 end`,
            ),
            last30: count(sql`case when ${signupDay} >= ${from} then 1 end`),
          })
          .from(usersTable),
        db
          .select({
            active: count(),
            activeUsers: sql<number>`count(distinct ${authsTable.userId})::int`,
          })
          .from(authsTable)
          .where(liveSession()),
        db
          .select({
            total: count(),
            last7: count(
              sql`case when ${transactionsTable.createdAt} > ${weekAgo} then 1 end`,
            ),
          })
          .from(transactionsTable),
        db.select({ total: count() }).from(splitsTable),
        db
          .select({ date: signupDay, count: count() })
          .from(usersTable)
          .where(sql`${signupDay} >= ${from}`)
          .groupBy(signupDay),
        db
          .select({ details: authsTable.details })
          .from(authsTable)
          .where(liveSession()),
        db
          .select({ date: signinDay, count: count() })
          .from(authsTable)
          .where(sql`${signinDay} >= ${from}`)
          .groupBy(signinDay),
      ]);

    const byDay = new Map(perDay.map((r) => [r.date, r.count]));
    const signinsByDay = new Map(signinsPerDay.map((r) => [r.date, r.count]));
    const signups = Array.from({ length: SIGNUP_DAYS }, (_, i) => {
      const date = addDays(from, i);
      return {
        date,
        count: byDay.get(date) ?? 0,
        signins: signinsByDay.get(date) ?? 0,
      };
    });

    const devices = live.map((r) => describeDevice(r.details?.userAgent));
    const kinds: Record<DeviceKind, number> = {
      desktop: 0,
      mobile: 0,
      tablet: 0,
      unknown: 0,
    };
    for (const d of devices) kinds[d.kind]++;

    return ok({
      users: users!,
      sessions: sessions!,
      transactions: txns!,
      splits: splits!.total,
      signups,
      devices: {
        kinds,
        browsers: tally(devices.map((d) => d.browser)),
        os: tally(devices.map((d) => d.os)),
      },
    });
  })
  .get(
    "/users",
    async ({ query, status, user: admin }) => {
      const no = await authorize(admin, "users.view");
      if (no) return status(no.code, fail(no.message));
      const q = query.q?.trim();
      const page = query.page ?? 1;
      const like = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : null;
      const conds: (SQL | undefined)[] = [
        like
          ? or(
              ilike(usersTable.name, like),
              ilike(usersTable.email, like),
              ilike(usersTable.username, like),
            )
          : undefined,
        query.status ? eq(usersTable.status, query.status) : undefined,
        query.role ? eq(usersTable.role, query.role) : undefined,
      ];
      const where = and(...conds);

      const [rows, [total]] = await Promise.all([
        db
          .select({
            ...profileColumns,
            transactions: sql<number>`(select count(*)::int from ${transactionsTable} where ${transactionsTable.userId} = "users"."id")`,
            lastLoginAt: sql<
              string | null
            >`(select max(${authsTable.createdAt}) from ${authsTable} where ${authsTable.userId} = "users"."id")`,
            activeSessions: sql<number>`(select count(*)::int from ${authsTable} where ${authsTable.userId} = "users"."id" and ${authsTable.state} = 'active' and ${authsTable.expiresAt} > now())`,
          })
          .from(usersTable)
          .where(where)
          .orderBy(desc(usersTable.createdAt), desc(usersTable.id))
          .limit(PAGE_SIZE)
          .offset((page - 1) * PAGE_SIZE),
        db.select({ n: count() }).from(usersTable).where(where),
      ]);

      return ok({
        items: rows,
        total: total!.n,
        page,
        pageSize: PAGE_SIZE,
      });
    },
    {
      query: t.Object({
        q: t.Optional(t.String({ maxLength: 100 })),
        page: t.Optional(t.Numeric({ minimum: 1 })),
        status: t.Optional(tEnum(userStatuses)),
        role: t.Optional(tEnum(userRoles)),
      }),
    },
  )
  .post(
    "/users",
    async ({ body, status, user: admin }) => {
      const no = await authorize(
        admin,
        body.role === "admin" ? "master" : "users.create",
      );
      if (no) return status(no.code, fail(no.message));
      const email = normalizeEmail(body.email);
      const username = normalizeUsername(body.username);
      const invalid = validateUsername(username);
      if (invalid) return status(400, fail(invalid));
      if (usernameService.isTaken(username))
        return status(409, fail("That username is taken"));
      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, email));
      if (existing)
        return status(409, fail("An account with this email already exists"));

      // Skips REGISTRATION_ENABLED and the email code: the admin vouches.
      try {
        const user = await createUser({
          name: body.name.trim(),
          email,
          username,
          password: body.password,
          role: body.role,
        });
        logAction(admin.id, "create_user", user.id, { role: user.role });
        return ok(
          {
            id: user.id,
            name: user.name,
            email: user.email,
            username: user.username,
            role: user.role,
            createdAt: user.createdAt,
          },
          `Created @${user.username}`,
        );
      } catch (e) {
        if (isUniqueViolation(e))
          return status(409, fail("That username or email is already taken"));
        throw e;
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 80 }),
        email: t.String({ format: "email", maxLength: 254 }),
        username: t.String({ pattern: USERNAME_PATTERN }),
        password: t.String({ minLength: 8, maxLength: 128 }),
        role: t.Optional(tEnum(userRoles)),
      }),
    },
  )
  .get(
    "/users/:id",
    async ({ params, status, token, user: me }) => {
      const no = await authorize(me, "users.view");
      if (no) return status(no.code, fail(no.message));
      const profile = await findUser(params.id);
      if (!profile) return status(404, fail("User not found"));
      const id = profile.id;
      const mine = await adminPermissionsOf(me);
      const countOf = (
        table:
          | typeof transactionsTable
          | typeof splitsTable
          | typeof accountsTable
          | typeof booksTable
          | typeof peopleTable
          | typeof passkeysTable,
      ) =>
        db
          .select({ n: count() })
          .from(table)
          .where(eq(table.userId, id))
          .then(([r]) => r!.n);
      const target = alias(usersTable, "target");
      const admin = alias(usersTable, "admin");

      const [
        transactions,
        splits,
        accounts,
        books,
        people,
        passkeys,
        [files],
        sessions,
        actions,
        grants,
      ] = await Promise.all([
        countOf(transactionsTable),
        countOf(splitsTable),
        countOf(accountsTable),
        countOf(booksTable),
        countOf(peopleTable),
        countOf(passkeysTable),
        db
          .select({
            n: count(),
            bytes: sql<string>`coalesce(sum(${attachmentsTable.size}), 0)`,
          })
          .from(attachmentsTable)
          .where(eq(attachmentsTable.userId, id)),
        // Live ones first, then the most recent ended ones.
        db
          .select(sessionColumns)
          .from(authsTable)
          .where(
            mine.includes("sessions.view")
              ? eq(authsTable.userId, id)
              : sql`false`,
          )
          .orderBy(
            sql`(${authsTable.state} = 'active' and ${authsTable.expiresAt} > now()) desc`,
            desc(authsTable.createdAt),
          )
          .limit(50),
        db
          .select({
            id: adminActionsTable.id,
            action: adminActionsTable.action,
            details: adminActionsTable.details,
            createdAt: adminActionsTable.createdAt,
            adminName: admin.name,
            targetName: target.name,
          })
          .from(adminActionsTable)
          .leftJoin(admin, eq(admin.id, adminActionsTable.adminId))
          .leftJoin(target, eq(target.id, adminActionsTable.targetUserId))
          .where(
            mine.includes("activity.view")
              ? eq(adminActionsTable.targetUserId, id)
              : sql`false`,
          )
          .orderBy(desc(adminActionsTable.createdAt))
          .limit(20),
        adminPermissionsOf(profile),
      ]);

      const now = new Date();
      const all = sessions.map((s) => ({
        ...serializeSession(s, token),
        live: s.state === "active" && s.expiresAt > now,
      }));
      return ok({
        ...profile,
        counts: {
          transactions,
          splits,
          accounts,
          books,
          people,
          passkeys,
          attachments: files!.n,
          storageBytes: Number(files!.bytes),
        },
        sessions: all.filter((s) => s.live),
        pastSessions: all.filter((s) => !s.live).slice(0, 15),
        actions,
        /** An admin's permissions (every one for the master). */
        permissions: grants,
        /** What the signed-in admin may do to this account. */
        canManage: targetProblem(me, profile) === null,
      });
    },
    { params: tId },
  )
  .delete(
    "/users/:id/sessions",
    async ({ params, status, user: admin, token }) => {
      const target = await authorize(admin, "sessions.revoke", params.id);
      if (denied(target)) return status(target.code, fail(target.message));
      // An admin signing themself out everywhere keeps this session.
      const keep = target.id === admin.id ? (token ?? undefined) : undefined;
      await coreAuthService.revokeAllForUser(target.id, keep);
      logAction(admin.id, "revoke_all_sessions", target.id);
      return ok(
        null,
        keep
          ? "Signed out of your other devices"
          : `Signed @${target.username} out of every device`,
      );
    },
    { params: tId },
  )
  .get(
    "/sessions",
    async ({ query, token, status, user: admin }) => {
      const no = await authorize(admin, "sessions.view");
      if (no) return status(no.code, fail(no.message));
      const q = query.q?.trim();
      const page = query.page ?? 1;
      const like = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : null;
      const where = and(
        liveSession(),
        like
          ? or(
              ilike(usersTable.name, like),
              ilike(usersTable.email, like),
              ilike(usersTable.username, like),
              ilike(authsTable.device, like),
              ilike(authsTable.ip, like),
            )
          : undefined,
      );
      const [rows, [total]] = await Promise.all([
        db
          .select({
            ...sessionColumns,
            userId: usersTable.id,
            name: usersTable.name,
            username: usersTable.username,
            email: usersTable.email,
            role: usersTable.role,
            masterSince: usersTable.masterSince,
          })
          .from(authsTable)
          .innerJoin(usersTable, eq(usersTable.id, authsTable.userId))
          .where(where)
          .orderBy(
            desc(
              sql`coalesce(${authsTable.lastSeenAt}, ${authsTable.createdAt})`,
            ),
            desc(authsTable.id),
          )
          .limit(PAGE_SIZE)
          .offset((page - 1) * PAGE_SIZE),
        db
          .select({ n: count() })
          .from(authsTable)
          .innerJoin(usersTable, eq(usersTable.id, authsTable.userId))
          .where(where),
      ]);
      return ok({
        items: rows.map(
          ({ userId, name, username, email, role, masterSince, ...s }) => ({
            ...serializeSession(s, token),
            user: { id: userId, name, username, email, role, masterSince },
          }),
        ),
        total: total!.n,
        page,
        pageSize: PAGE_SIZE,
      });
    },
    {
      query: t.Object({
        q: t.Optional(t.String({ maxLength: 100 })),
        page: t.Optional(t.Numeric({ minimum: 1 })),
      }),
    },
  )
  .delete(
    "/sessions/:id",
    async ({ params, status, user: admin }) => {
      const [row] = await db
        .select({
          userId: authsTable.userId,
          details: authsTable.details,
        })
        .from(authsTable)
        .where(eq(authsTable.id, params.id))
        .limit(1);
      if (!row) return status(404, fail("That session has already ended"));
      const target = await authorize(admin, "sessions.revoke", row.userId);
      if (denied(target)) return status(target.code, fail(target.message));
      if (!(await coreAuthService.revokeSession(row.userId, params.id)))
        return status(404, fail("That session has already ended"));
      const device = describeDevice(row.details?.userAgent).name;
      logAction(admin.id, "revoke_session", row.userId, { device });
      return ok(null, `Signed out ${device}`);
    },
    { params: tId },
  )
  .patch(
    "/users/:id/role",
    async ({ params, body, status, user: admin }) => {
      if (params.id === admin.id)
        return status(400, fail("You can't change your own role"));
      const before = await authorize(admin, "master", params.id);
      if (denied(before)) return status(before.code, fail(before.message));
      if (before.role === body.role) return ok(null, "Nothing to change");
      const row = await db.transaction(async (tx) => {
        // A former admin keeps no permissions to come back to.
        if (body.role === "user")
          await tx
            .delete(adminGrantsTable)
            .where(eq(adminGrantsTable.userId, params.id));
        const [r] = await tx
          .update(usersTable)
          .set({ role: body.role })
          .where(eq(usersTable.id, params.id))
          .returning();
        return r;
      });
      userCacheService.set(row!);
      logAction(admin.id, "change_role", row!.id, {
        from: before.role,
        to: body.role,
      });
      return ok(
        null,
        body.role === "admin"
          ? `@${row!.username} is now an admin`
          : `@${row!.username} is no longer an admin`,
      );
    },
    { params: tId, body: t.Object({ role: tEnum(userRoles) }) },
  )
  .patch(
    "/users/:id/status",
    async ({ params, body, status, user: admin }) => {
      if (params.id === admin.id)
        return status(400, fail("You can't suspend your own account"));
      const before = await authorize(admin, "users.suspend", params.id);
      if (denied(before)) return status(before.code, fail(before.message));
      if (before.status === body.status) return ok(null, "Nothing to change");
      const suspend = body.status === "suspended";
      const [row] = await db
        .update(usersTable)
        .set({ status: body.status, suspendedAt: suspend ? new Date() : null })
        .where(eq(usersTable.id, params.id))
        .returning();
      userCacheService.set(row!);
      if (suspend) await coreAuthService.revokeAllForUser(row!.id);
      logAction(admin.id, suspend ? "suspend" : "reactivate", row!.id);
      return ok(
        null,
        suspend
          ? `@${row!.username} is suspended and signed out everywhere`
          : `@${row!.username} can sign in again`,
      );
    },
    { params: tId, body: t.Object({ status: tEnum(userStatuses) }) },
  )
  .post(
    "/users/:id/password",
    async ({ params, body, status, user: admin }) => {
      if (params.id === admin.id)
        return status(400, fail("Change your own password in Settings"));
      const target = await authorize(admin, "users.password", params.id);
      if (denied(target)) return status(target.code, fail(target.message));
      await db
        .update(usersTable)
        .set({ passwordHash: await Bun.password.hash(body.password) })
        .where(eq(usersTable.id, target.id));
      userCacheService.invalidate(target.id);
      await coreAuthService.revokeAllForUser(target.id);
      logAction(admin.id, "reset_password", target.id);
      return ok(
        null,
        `Password set for @${target.username}; they've been signed out`,
      );
    },
    {
      params: tId,
      body: t.Object({ password: t.String({ minLength: 8, maxLength: 128 }) }),
    },
  )
  .get(
    "/activity",
    async ({ query, status, user: me }) => {
      const no = await authorize(me, "activity.view");
      if (no) return status(no.code, fail(no.message));
      const page = query.page ?? 1;
      const target = alias(usersTable, "target");
      const admin = alias(usersTable, "admin");
      const [rows, [total]] = await Promise.all([
        db
          .select({
            id: adminActionsTable.id,
            action: adminActionsTable.action,
            details: adminActionsTable.details,
            createdAt: adminActionsTable.createdAt,
            adminId: adminActionsTable.adminId,
            adminName: admin.name,
            adminUsername: admin.username,
            targetId: adminActionsTable.targetUserId,
            targetName: target.name,
            targetUsername: target.username,
          })
          .from(adminActionsTable)
          .leftJoin(admin, eq(admin.id, adminActionsTable.adminId))
          .leftJoin(target, eq(target.id, adminActionsTable.targetUserId))
          .orderBy(
            desc(adminActionsTable.createdAt),
            desc(adminActionsTable.id),
          )
          .limit(PAGE_SIZE)
          .offset((page - 1) * PAGE_SIZE),
        db.select({ n: count() }).from(adminActionsTable),
      ]);
      return ok({ items: rows, total: total!.n, page, pageSize: PAGE_SIZE });
    },
    { query: t.Object({ page: t.Optional(t.Numeric({ minimum: 1 })) }) },
  )
  .patch(
    "/users/:id",
    async ({ params, body, status, user: admin }) => {
      const target = await authorize(admin, "users.edit", params.id);
      if (denied(target)) return status(target.code, fail(target.message));
      const set: Partial<
        Pick<SelectUser, "name" | "email" | "username" | "usernameChangedAt">
      > = {};
      if (body.name !== undefined) set.name = body.name.trim();
      if (body.email !== undefined) {
        const email = normalizeEmail(body.email);
        if (email !== target.email) {
          const [taken] = await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.email, email));
          if (taken)
            return status(
              409,
              fail("An account with this email already exists"),
            );
          set.email = email;
        }
      }
      if (body.username !== undefined) {
        const username = normalizeUsername(body.username);
        if (username !== target.username) {
          const invalid = validateUsername(username);
          if (invalid) return status(400, fail(invalid));
          if (usernameService.isTaken(username))
            return status(409, fail("That username is taken"));
          // An admin's rename doesn't start the user's 30-day wait.
          set.username = username;
        }
      }
      if (!Object.keys(set).length) return ok(null, "Nothing to change");
      try {
        const [row] = await db
          .update(usersTable)
          .set(set)
          .where(eq(usersTable.id, target.id))
          .returning();
        userCacheService.set(row!);
        if (set.username)
          usernameService.set(row!.id, row!.username, target.username);
        logAction(admin.id, "edit_user", row!.id, {
          fields: Object.keys(set).join(", "),
        });
        return ok(null, `Saved @${row!.username}`);
      } catch (e) {
        if (isUniqueViolation(e))
          return status(409, fail("That username or email is already taken"));
        throw e;
      }
    },
    {
      params: tId,
      body: t.Object({
        name: t.Optional(t.String({ minLength: 2, maxLength: 80 })),
        email: t.Optional(t.String({ format: "email", maxLength: 254 })),
        username: t.Optional(t.String({ pattern: USERNAME_PATTERN })),
      }),
    },
  )
  .delete(
    "/users/:id",
    async ({ params, body, status, user: admin }) => {
      if (params.id === admin.id)
        return status(400, fail("Delete your own account from Settings"));
      const target = await authorize(admin, "users.delete", params.id);
      if (denied(target)) return status(target.code, fail(target.message));
      if (normalizeUsername(body.confirm) !== target.username)
        return status(400, fail(`Type ${target.username} to confirm`));
      await deleteUser(target);
      // The target is gone, so the log keeps who it was.
      logAction(admin.id, "delete_user", null, {
        username: target.username,
        email: target.email,
      });
      return ok(null, `Deleted @${target.username} and all their data`);
    },
    { params: tId, body: t.Object({ confirm: t.String({ maxLength: 40 }) }) },
  )
  .put(
    "/users/:id/permissions",
    async ({ params, body, status, user: admin }) => {
      const target = await authorize(admin, "master", params.id);
      if (denied(target)) return status(target.code, fail(target.message));
      if (target.role !== "admin")
        return status(400, fail("Make them an admin first"));
      if (isMaster(target))
        return status(400, fail("The master admin has every permission"));
      const next = [...new Set(body.permissions)];
      const before = await adminPermissionsOf(target);
      await db.transaction(async (tx) => {
        await tx
          .delete(adminGrantsTable)
          .where(eq(adminGrantsTable.userId, target.id));
        if (next.length)
          await tx.insert(adminGrantsTable).values(
            next.map((permission) => ({
              userId: target.id,
              permission,
              grantedBy: admin.id,
            })),
          );
      });
      const added = next.filter((p) => !before.includes(p));
      const removed = before.filter((p) => !next.includes(p));
      if (added.length || removed.length)
        logAction(admin.id, "change_permissions", target.id, {
          ...(added.length && { added: added.join(", ") }),
          ...(removed.length && { removed: removed.join(", ") }),
        });
      return ok(next, `Permissions saved for @${target.username}`);
    },
    {
      params: tId,
      body: t.Object({
        permissions: t.Array(tEnum(adminPermissions), { maxItems: 50 }),
      }),
    },
  )
  .post(
    "/users/:id/master",
    async ({ params, status, user: admin }) => {
      const target = await authorize(admin, "master", params.id);
      if (denied(target)) return status(target.code, fail(target.message));
      if (target.id === admin.id)
        return status(400, fail("You're already the master admin"));
      if (target.role !== "admin" || target.status !== "active")
        return status(400, fail("Only an active admin can become master"));
      const [mine, theirs] = await db.transaction(async (tx) => {
        // Clear ours first: the unique index allows one master at a time.
        const [a] = await tx
          .update(usersTable)
          .set({ masterSince: null })
          .where(eq(usersTable.id, admin.id))
          .returning();
        const [b] = await tx
          .update(usersTable)
          .set({ masterSince: new Date() })
          .where(eq(usersTable.id, target.id))
          .returning();
        // The new master has everything; stored grants would only be noise.
        await tx
          .delete(adminGrantsTable)
          .where(eq(adminGrantsTable.userId, target.id));
        return [a!, b!];
      });
      userCacheService.set(mine);
      userCacheService.set(theirs);
      logAction(admin.id, "transfer_master", target.id);
      return ok(null, `@${target.username} is now the master admin`);
    },
    { params: tId },
  );
