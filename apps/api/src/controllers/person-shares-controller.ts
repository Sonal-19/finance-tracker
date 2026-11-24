import { and, desc, eq } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import {
  personSharesTable,
  settlementClaimsTable,
  settlementsTable,
  shareParticipantModes,
  sharePayButtonModes,
} from "$/db/schema";
import { IS_PROD } from "$/env";
import {
  findPersonShare,
  MAX_PENDING_SETTLEMENT_CLAIMS,
  pendingClaimsOfPersonShare,
  personShareCookieName,
  personShareEntries,
  recordPersonShareView,
  serializePersonShare,
  serializeSettlementClaim,
} from "$/lib/services/person-share-service";
import { clientIp, rateLimitService } from "$/lib/services/rate-limit-service";
import { deliver } from "$/lib/services/reminder-service";
import {
  isUnlocked,
  lookupFrom,
  newShareSecret,
  newShareToken,
  shareCookieValue,
  UPI_ID_PATTERN,
} from "$/lib/services/share-service";
import { ownedPeople } from "$/lib/services/split-service";
import { userCacheService } from "$/lib/services/user-cache-service";
import { isUniqueViolation } from "$/lib/services/username-service";
import { csvEscape, fail, ok } from "$/lib/utils";
import { formatAmount } from "$/lib/utils/money";
import { today } from "$/lib/utils/period";
import { tEnum } from "$/lib/utils/schema";
import { authProcessor, protectedUser } from "$/pre-processor";

const P = personSharesTable;
const C = settlementClaimsTable;
const tId = t.Object({ id: t.Numeric() });
const tDate = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

const linkBody = t.Object({
  message: t.Optional(t.Nullable(t.String({ maxLength: 300 }))),
  expiresOn: t.Optional(t.Nullable(tDate)),
  /** A string sets or changes it, null removes it, omitted keeps it. */
  password: t.Optional(t.Nullable(t.String({ minLength: 4, maxLength: 64 }))),
  upiId: t.Optional(t.Nullable(t.String({ pattern: UPI_ID_PATTERN }))),
  payeeName: t.Optional(t.Nullable(t.String({ maxLength: 60 }))),
  payButton: t.Optional(tEnum(sharePayButtonModes)),
  /** `hidden` = only the viewer's own share of each bill. */
  participants: t.Optional(tEnum(shareParticipantModes)),
});
type LinkBody = typeof linkBody.static;

async function linkValues(body: LinkBody) {
  return {
    ...(body.message !== undefined && {
      message: body.message?.trim() || null,
    }),
    ...(body.expiresOn !== undefined && { expiresOn: body.expiresOn }),
    ...(body.upiId !== undefined && { upiId: body.upiId?.trim() || null }),
    ...(body.payeeName !== undefined && {
      payeeName: body.payeeName?.trim() || null,
    }),
    ...(body.payButton && { payButton: body.payButton }),
    ...(body.participants && { participants: body.participants }),
    ...(body.password !== undefined && {
      passwordHash: body.password
        ? await Bun.password.hash(body.password)
        : null,
      secret: newShareSecret(),
    }),
  };
}

/** The owner's side: public links for people they split with (`/p/<token>`). */
export const personSharesController = new Elysia({
  name: "person_shares_controller",
  prefix: "/person-shares",
})
  .use(protectedUser)
  .get(
    "/",
    async ({ user, query }) => {
      const rows = await db
        .select()
        .from(P)
        .where(
          and(
            eq(P.userId, user.id),
            query.personId ? eq(P.personId, query.personId) : undefined,
          ),
        )
        .orderBy(desc(P.id));
      return ok(rows.map(serializePersonShare));
    },
    { query: t.Object({ personId: t.Optional(t.Numeric({ minimum: 1 })) }) },
  )
  .post(
    "/",
    async ({ user, body, status }) => {
      const { personId, ...rest } = body;
      const [person] = await ownedPeople(user.id, [personId]);
      if (!person) return status(404, fail("Person not found"));
      const values = {
        secret: newShareSecret(),
        ...(await linkValues(rest)),
        userId: user.id,
        personId,
      };
      for (let attempt = 0; ; attempt++) {
        try {
          const [row] = await db
            .insert(P)
            .values({ ...values, token: newShareToken() })
            .returning();
          return ok(serializePersonShare(row!), "Link created");
        } catch (e) {
          if (!isUniqueViolation(e) || attempt >= 4) throw e;
        }
      }
    },
    {
      body: t.Composite([
        t.Object({ personId: t.Integer({ minimum: 1 }) }),
        linkBody,
      ]),
    },
  )
  .patch(
    "/:id",
    async ({ user, params, body, status }) => {
      const [row] = await db
        .update(P)
        .set({ ...(await linkValues(body)), updatedAt: new Date() })
        .where(and(eq(P.id, params.id), eq(P.userId, user.id)))
        .returning();
      if (!row) return status(404, fail("Link not found"));
      return ok(serializePersonShare(row), "Link updated");
    },
    { params: tId, body: linkBody },
  )
  .delete(
    "/:id",
    async ({ user, params, status }) => {
      const [row] = await db
        .delete(P)
        .where(and(eq(P.id, params.id), eq(P.userId, user.id)))
        .returning({ id: P.id });
      if (!row) return status(404, fail("Link not found"));
      return ok(null, "Link deleted. It no longer opens for anyone.");
    },
    { params: tId },
  )
  .get(
    "/claims",
    async ({ user, query }) => {
      const rows = await db
        .select()
        .from(C)
        .where(
          and(
            eq(C.userId, user.id),
            eq(C.status, "pending"),
            query.personId ? eq(C.personId, query.personId) : undefined,
          ),
        )
        .orderBy(desc(C.id));
      return ok(rows.map(serializeSettlementClaim));
    },
    { query: t.Object({ personId: t.Optional(t.Numeric({ minimum: 1 })) }) },
  )
  /** Records the reported payment as money received from that person. */
  .post(
    "/claims/:id/confirm",
    async ({ user, params, status }) => {
      const [claim] = await db
        .select()
        .from(C)
        .where(and(eq(C.id, params.id), eq(C.userId, user.id)))
        .limit(1);
      if (!claim) return status(404, fail("Payment report not found"));
      if (claim.status !== "pending")
        return status(409, fail("You already answered this one"));
      const [person] = await ownedPeople(user.id, [claim.personId]);
      if (!person) return status(404, fail("Person not found"));
      const done = await db.transaction(async (tx) => {
        const [won] = await tx
          .update(C)
          .set({ status: "confirmed", decidedAt: new Date() })
          .where(and(eq(C.id, claim.id), eq(C.status, "pending")))
          .returning({ id: C.id });
        if (!won) return false;
        const [st] = await tx
          .insert(settlementsTable)
          .values({
            userId: user.id,
            personId: person.id,
            direction: "received",
            amount: claim.amount,
            date: today(),
            note:
              [claim.note, claim.reference && `Ref ${claim.reference}`]
                .filter(Boolean)
                .join(" · ") || "Reported on their link",
          })
          .returning({ id: settlementsTable.id });
        await tx
          .update(C)
          .set({ settlementId: st!.id })
          .where(eq(C.id, claim.id));
        return true;
      });
      if (!done) return status(409, fail("You already answered this one"));
      return ok(
        null,
        `Recorded ${formatAmount(claim.amount)} from ${person.name}`,
      );
    },
    { params: tId },
  )
  .post(
    "/claims/:id/dismiss",
    async ({ user, params, status }) => {
      const [row] = await db
        .update(C)
        .set({ status: "dismissed", decidedAt: new Date() })
        .where(
          and(
            eq(C.id, params.id),
            eq(C.userId, user.id),
            eq(C.status, "pending"),
          ),
        )
        .returning({ id: C.id });
      if (!row) return status(404, fail("Payment report not found"));
      return ok(null, "Dismissed. Nothing was recorded.");
    },
    { params: tId },
  );

const UNLOCK_LIMIT = 10;
const UNLOCK_WINDOW_MS = 10 * 60 * 1000;
const UNLOCK_DAYS = 30;
const CLAIM_LIMIT = 5;
const CLAIM_WINDOW_MS = 60 * 60 * 1000;
const NOT_FOUND = "This link doesn't exist or has expired";
const COOKIE_PATH = "/api/public/person-shares";
const tToken = t.Object({ token: t.String({ minLength: 6, maxLength: 64 }) });

const findFrom = (token: string, ip: string) =>
  lookupFrom(ip, () => findPersonShare(token));

/** What the person holding their link sees. No login: the token is the
 * key, plus the link's password (kept as an httpOnly cookie once entered). */
export const publicPersonSharesController = new Elysia({
  name: "public_person_shares_controller",
  prefix: "/public/person-shares",
})
  .use(authProcessor)
  .derive(({ request, server }) => ({ ip: clientIp(request, server) }))
  .get(
    "/:token",
    async ({ params, ip, cookie, auth, status }) => {
      const found = await findFrom(params.token, ip);
      if (!found) return status(404, fail(NOT_FOUND));
      const { share, person } = found;
      const owner = await userCacheService.get(share.userId);
      const ownerName = owner?.name ?? "Someone";
      if (!isUnlocked(share, cookie[personShareCookieName(share)]?.value))
        return ok({ locked: true as const, ownerName });
      if (auth.user?.id !== share.userId) recordPersonShareView(share);
      return ok({
        locked: false as const,
        ownerName,
        personName: person.name,
        message: share.message,
        participants: share.participants,
        upi: share.upiId
          ? {
              id: share.upiId,
              payeeName: share.payeeName ?? ownerName,
              button: share.payButton,
            }
          : null,
        pendingClaims: await pendingClaimsOfPersonShare(share.id),
        ...(await personShareEntries(share, ownerName)),
      });
    },
    { params: tToken },
  )
  .post(
    "/:token/unlock",
    async ({ params, ip, body, cookie, status }) => {
      const key = `pshare-unlock:${params.token}:${ip}`;
      if (!rateLimitService.hit(key, UNLOCK_LIMIT, UNLOCK_WINDOW_MS))
        return status(
          429,
          fail("Too many attempts. Try again in a few minutes."),
        );
      const found = await findFrom(params.token, ip);
      if (!found) return status(404, fail(NOT_FOUND));
      const { share } = found;
      if (
        share.passwordHash &&
        !(await Bun.password.verify(body.password, share.passwordHash))
      )
        return status(401, fail("Wrong password"));
      rateLimitService.reset(key);
      cookie[personShareCookieName(share)]?.set({
        value: shareCookieValue(share),
        path: COOKIE_PATH,
        secure: IS_PROD,
        httpOnly: true,
        sameSite: "lax",
        maxAge: UNLOCK_DAYS * 24 * 60 * 60,
      });
      return ok(null, "Unlocked");
    },
    {
      params: tToken,
      body: t.Object({ password: t.String({ minLength: 1, maxLength: 64 }) }),
    },
  )
  .post(
    "/:token/claims",
    async ({ params, ip, body, cookie, status }) => {
      const found = await findFrom(params.token, ip);
      if (!found) return status(404, fail(NOT_FOUND));
      const { share, person } = found;
      if (!isUnlocked(share, cookie[personShareCookieName(share)]?.value))
        return status(401, fail("Enter the password first"));
      const key = `pshare-claim:${share.id}:${ip}`;
      if (!rateLimitService.hit(key, CLAIM_LIMIT, CLAIM_WINDOW_MS))
        return status(429, fail("Too many reports. Try again later."));
      const pending = await pendingClaimsOfPersonShare(share.id);
      if (pending.length >= MAX_PENDING_SETTLEMENT_CLAIMS)
        return status(
          429,
          fail("There are already reports waiting to be checked"),
        );
      const [claim] = await db
        .insert(C)
        .values({
          userId: share.userId,
          personId: share.personId,
          shareId: share.id,
          amount: body.amount,
          reference: body.reference?.trim() || null,
          note: body.note?.trim() || null,
        })
        .returning({ id: C.id });
      deliver({
        userId: share.userId,
        kind: "payment",
        title: `${person.name} says they paid you`,
        body: `${formatAmount(body.amount)} · confirm it to update your balance`,
        url: `/split/people/${person.id}`,
        dedupeKey: `settlement-claim:${claim!.id}`,
      }).catch(console.error);
      const owner = await userCacheService.get(share.userId);
      return ok(
        null,
        `Sent. ${owner?.name ?? "They"} will confirm once they see the money.`,
      );
    },
    {
      params: tToken,
      body: t.Object({
        amount: t.Integer({ exclusiveMinimum: 0, maximum: 100_000_000_000 }),
        reference: t.Optional(t.Nullable(t.String({ maxLength: 40 }))),
        note: t.Optional(t.Nullable(t.String({ maxLength: 120 }))),
      }),
    },
  )
  .get(
    "/:token/export.csv",
    async ({ params, ip, cookie, set, status }) => {
      const found = await findFrom(params.token, ip);
      if (!found) return status(404, fail(NOT_FOUND));
      const { share, person } = found;
      if (!isUnlocked(share, cookie[personShareCookieName(share)]?.value))
        return status(401, fail("Enter the password first"));
      const owner = await userCacheService.get(share.userId);
      const ownerName = owner?.name ?? "Owner";
      const { activity } = await personShareEntries(share, ownerName);
      const money = (n: number) => (n / 100).toFixed(2);
      const lines = activity.map((a) =>
        (a.kind === "split"
          ? [
              a.date,
              "Bill",
              a.description,
              a.paidBy.name,
              money(a.total),
              money(a.yourShare),
              money(a.effect),
              money(a.balanceAfter),
            ]
          : [
              a.date,
              a.direction === "you_paid" ? "You paid" : "You received",
              a.note,
              "",
              "",
              "",
              money(a.effect),
              money(a.balanceAfter),
            ]
        )
          .map(csvEscape)
          .join(","),
      );
      set.headers["Content-Type"] = "text/csv; charset=utf-8";
      set.headers["Content-Disposition"] =
        `attachment; filename="${`${person.name}-${ownerName}`.replace(/[^a-zA-Z0-9 _-]/g, "_")}-splits.csv"`;
      return [
        "Date,Type,Description,Paid by,Bill (INR),Your share (INR),You owe +/− (INR),Balance (INR)",
        ...lines,
      ].join("\n");
    },
    { params: tToken },
  );
