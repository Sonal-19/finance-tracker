import { and, count, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import {
  authsTable,
  splitsTable,
  transactionsTable,
  userRoles,
  usersTable,
} from "$/db/schema";
import { APP_TZ } from "$/env";
import { createUser } from "$/lib/services/user-service";
import {
  isUniqueViolation,
  normalizeUsername,
  USERNAME_PATTERN,
  usernameService,
  validateUsername,
} from "$/lib/services/username-service";
import { fail, normalizeEmail, ok } from "$/lib/utils";
import { addDays, today } from "$/lib/utils/period";
import { tEnum } from "$/lib/utils/schema";
import { protectedAdmin } from "$/pre-processor";

// The only routes that read across users. Return counts and profile fields,
// never anyone's amounts.

const SIGNUP_DAYS = 30;
const PAGE_SIZE = 25;

/** A user's sign-up day in the app's timezone, as "yyyy-MM-dd". The zone is
 * inlined (it's server config, not input) so SELECT and GROUP BY are the
 * same expression; as a bind parameter Postgres sees them as different. */
const tz = sql.raw(`'${APP_TZ.replace(/'/g, "''")}'`);
const signupDay = sql<string>`to_char(${usersTable.createdAt} at time zone ${tz}, 'YYYY-MM-DD')`;

const profileColumns = {
  id: usersTable.id,
  name: usersTable.name,
  email: usersTable.email,
  username: usersTable.username,
  role: usersTable.role,
  createdAt: usersTable.createdAt,
};

export const adminController = new Elysia({
  name: "admin_controller",
  prefix: "/admin",
})
  .use(protectedAdmin)
  .get("/overview", async () => {
    const now = new Date();
    const end = today();
    const from = addDays(end, -(SIGNUP_DAYS - 1));
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

    const [[users], [sessions], [txns], [splits], perDay] = await Promise.all([
      db
        .select({
          total: count(),
          admins: count(sql`case when ${usersTable.role} = 'admin' then 1 end`),
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
        .where(
          and(eq(authsTable.state, "active"), gt(authsTable.expiresAt, now)),
        ),
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
    ]);

    const byDay = new Map(perDay.map((r) => [r.date, r.count]));
    const signups = Array.from({ length: SIGNUP_DAYS }, (_, i) => {
      const date = addDays(from, i);
      return { date, count: byDay.get(date) ?? 0 };
    });

    return ok({
      users: users!,
      sessions: sessions!,
      transactions: txns!,
      splits: splits!.total,
      signups,
    });
  })
  .get(
    "/users",
    async ({ query }) => {
      const q = query.q?.trim();
      const page = query.page ?? 1;
      const like = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : null;
      const where = like
        ? or(
            ilike(usersTable.name, like),
            ilike(usersTable.email, like),
            ilike(usersTable.username, like),
          )
        : undefined;

      const [rows, [total]] = await Promise.all([
        db
          .select({
            ...profileColumns,
            transactions: sql<number>`(select count(*)::int from ${transactionsTable} where ${transactionsTable.userId} = "users"."id")`,
            lastLoginAt: sql<
              string | null
            >`(select max(${authsTable.createdAt}) from ${authsTable} where ${authsTable.userId} = "users"."id")`,
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
      }),
    },
  )
  .post(
    "/users",
    async ({ body, status }) => {
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
  );
