import { and, desc, eq, sql } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import {
  attachmentsTable,
  bookSharesTable,
  categoriesTable,
  paymentClaimsTable,
  shareAttachmentModes,
  sharePayButtonModes,
  transactionsTable,
} from "$/db/schema";
import { IS_PROD } from "$/env";
import { resolveAccountId } from "$/lib/services/account-service";
import { ownedBook } from "$/lib/services/book-service";
import { clientIp, rateLimitService } from "$/lib/services/rate-limit-service";
import {
  findShare,
  isUnlocked,
  MAX_PENDING_CLAIMS,
  newShareSecret,
  newShareToken,
  pendingClaimsOfShare,
  recordView,
  serializeClaim,
  serializeShare,
  shareCookieName,
  shareCookieValue,
  shareEntries,
  shareShowsTransaction,
  UPI_ID_PATTERN,
} from "$/lib/services/share-service";
import { storageService } from "$/lib/services/storage-service";
import { userCacheService } from "$/lib/services/user-cache-service";
import { isUniqueViolation } from "$/lib/services/username-service";
import { csvEscape, fail, ok } from "$/lib/utils";
import { formatAmount } from "$/lib/utils/money";
import { today } from "$/lib/utils/period";
import { tEnum } from "$/lib/utils/schema";
import { authProcessor, protectedUser } from "$/pre-processor";

const S = bookSharesTable;
const C = paymentClaimsTable;
const tId = t.Object({ id: t.Numeric() });
const tDate = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const tSharePassword = t.String({ minLength: 4, maxLength: 64 });

const shareBody = t.Object({
  title: t.Optional(t.Nullable(t.String({ maxLength: 80 }))),
  message: t.Optional(t.Nullable(t.String({ maxLength: 300 }))),
  fromDate: t.Optional(t.Nullable(tDate)),
  toDate: t.Optional(t.Nullable(tDate)),
  expiresOn: t.Optional(t.Nullable(tDate)),
  /** A string sets or changes it, null removes it, omitted keeps it. */
  password: t.Optional(t.Nullable(tSharePassword)),
  upiId: t.Optional(t.Nullable(t.String({ pattern: UPI_ID_PATTERN }))),
  payeeName: t.Optional(t.Nullable(t.String({ maxLength: 60 }))),
  attachments: t.Optional(tEnum(shareAttachmentModes)),
  payButton: t.Optional(tEnum(sharePayButtonModes)),
});

type ShareBody = typeof shareBody.static;

/** The web always sends both ends of the period together. */
const backwardsPeriod = (b: ShareBody) =>
  !!b.fromDate && !!b.toDate && b.toDate < b.fromDate;
const BACKWARDS = "The end date is before the start date";

/** Columns to write for the fields present in the body. */
async function shareValues(body: ShareBody) {
  return {
    ...(body.title !== undefined && { title: body.title?.trim() || null }),
    ...(body.message !== undefined && {
      message: body.message?.trim() || null,
    }),
    ...(body.fromDate !== undefined && { fromDate: body.fromDate }),
    ...(body.toDate !== undefined && { toDate: body.toDate }),
    ...(body.expiresOn !== undefined && { expiresOn: body.expiresOn }),
    ...(body.upiId !== undefined && { upiId: body.upiId?.trim() || null }),
    ...(body.payeeName !== undefined && {
      payeeName: body.payeeName?.trim() || null,
    }),
    ...(body.attachments && { attachments: body.attachments }),
    ...(body.payButton && { payButton: body.payButton }),
    // A new secret with every password change locks all browsers again.
    ...(body.password !== undefined && {
      passwordHash: body.password
        ? await Bun.password.hash(body.password)
        : null,
      secret: newShareSecret(),
    }),
  };
}

/** The owner's side: public links to a book (`/s/<token>` on the web). */
export const sharesController = new Elysia({
  name: "shares_controller",
  prefix: "/shares",
})
  .use(protectedUser)
  .get(
    "/",
    async ({ user, query }) => {
      const rows = await db
        .select()
        .from(S)
        .where(
          and(
            eq(S.userId, user.id),
            query.bookId ? eq(S.bookId, query.bookId) : undefined,
          ),
        )
        .orderBy(desc(S.id));
      return ok(rows.map(serializeShare));
    },
    { query: t.Object({ bookId: t.Optional(t.Numeric({ minimum: 1 })) }) },
  )
  .post(
    "/",
    async ({ user, body, status }) => {
      const book = await ownedBook(user.id, body.bookId);
      if (!book) return status(404, fail("Book not found"));
      if (backwardsPeriod(body)) return status(400, fail(BACKWARDS));
      const { bookId, ...rest } = body;
      const values = {
        secret: newShareSecret(),
        ...(await shareValues(rest)),
        userId: user.id,
        bookId,
      };
      // Short tokens can collide (rarely): the unique index refuses it, so
      // draw another.
      for (let attempt = 0; ; attempt++) {
        try {
          const [row] = await db
            .insert(S)
            .values({ ...values, token: newShareToken() })
            .returning();
          return ok(serializeShare(row!), "Link created");
        } catch (e) {
          if (!isUniqueViolation(e) || attempt >= 4) throw e;
        }
      }
    },
    {
      body: t.Composite([
        t.Object({ bookId: t.Integer({ minimum: 1 }) }),
        shareBody,
      ]),
    },
  )
  .patch(
    "/:id",
    async ({ user, params, body, status }) => {
      if (backwardsPeriod(body)) return status(400, fail(BACKWARDS));
      const [row] = await db
        .update(S)
        .set({ ...(await shareValues(body)), updatedAt: new Date() })
        .where(and(eq(S.id, params.id), eq(S.userId, user.id)))
        .returning();
      if (!row) return status(404, fail("Link not found"));
      return ok(serializeShare(row), "Link updated");
    },
    { params: tId, body: shareBody },
  )
  .delete(
    "/:id",
    async ({ user, params, status }) => {
      const [row] = await db
        .delete(S)
        .where(and(eq(S.id, params.id), eq(S.userId, user.id)))
        .returning({ id: S.id });
      if (!row) return status(404, fail("Link not found"));
      return ok(null, "Link deleted. It no longer opens for anyone.");
    },
    { params: tId },
  )
  // "I've paid" reports from the public page. Nothing is booked until the
  // owner confirms one here.
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
            query.bookId ? eq(C.bookId, query.bookId) : undefined,
          ),
        )
        .orderBy(desc(C.id));
      return ok(rows.map(serializeClaim));
    },
    { query: t.Object({ bookId: t.Optional(t.Numeric({ minimum: 1 })) }) },
  )
  .post(
    "/claims/:id/confirm",
    async ({ user, params, body, status }) => {
      const [claim] = await db
        .select()
        .from(C)
        .where(and(eq(C.id, params.id), eq(C.userId, user.id)))
        .limit(1);
      if (!claim) return status(404, fail("Payment report not found"));
      if (claim.status !== "pending")
        return status(409, fail("You already answered this one"));
      const [book, account, [category]] = await Promise.all([
        ownedBook(user.id, claim.bookId),
        resolveAccountId(user.id, body.accountId),
        // "Refund" when the user still has it, else their first income category.
        db
          .select({ id: categoriesTable.id })
          .from(categoriesTable)
          .where(
            and(
              eq(categoriesTable.userId, user.id),
              eq(categoriesTable.type, "credit"),
            ),
          )
          .orderBy(
            sql`${categoriesTable.name} = 'Refund' desc`,
            categoriesTable.id,
          )
          .limit(1),
      ]);
      if (!book) return status(404, fail("Book not found"));
      if (book.status === "archived")
        return status(400, fail(`Restore "${book.name}" first`));
      if (!account.ok) return status(400, fail(account.message));
      if (!category) return status(400, fail("Add an income category first"));

      const done = await db.transaction(async (tx) => {
        // The status check in the update makes a double tap book it once.
        const [won] = await tx
          .update(C)
          .set({ status: "confirmed", decidedAt: new Date() })
          .where(and(eq(C.id, claim.id), eq(C.status, "pending")))
          .returning({ id: C.id });
        if (!won) return false;
        const [txn] = await tx
          .insert(transactionsTable)
          .values({
            userId: user.id,
            type: "credit",
            amount: claim.amount,
            categoryId: category.id,
            date: today(),
            accountId: account.id,
            bookId: book.id,
            note:
              [
                claim.payerName && `Paid by ${claim.payerName}`,
                claim.reference && `Ref ${claim.reference}`,
              ]
                .filter(Boolean)
                .join(" · ") || "Payment received",
          })
          .returning({ id: transactionsTable.id });
        await tx
          .update(C)
          .set({ transactionId: txn!.id })
          .where(eq(C.id, claim.id));
        return true;
      });
      if (!done) return status(409, fail("You already answered this one"));
      return ok(
        null,
        `${formatAmount(claim.amount)} recorded as received in ${book.name}`,
      );
    },
    {
      params: tId,
      /** Omitted = the user's default account. */
      body: t.Object({ accountId: t.Optional(t.Integer({ minimum: 1 })) }),
    },
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
const tToken = t.Object({ token: t.String({ minLength: 6, maxLength: 64 }) });
/** Wrong tokens one IP may try per window before every lookup from it
 * answers "not found" (keeps 6-character tokens from being guessed). */
const MISS_LIMIT = 30;
const MISS_WINDOW_MS = 15 * 60 * 1000;

/** `findShare`, counting misses per IP. */
async function findShareFrom(token: string, ip: string) {
  const key = `share-miss:${ip}`;
  if (rateLimitService.isOver(key, MISS_LIMIT)) return null;
  const found = await findShare(token);
  if (!found) rateLimitService.hit(key, MISS_LIMIT, MISS_WINDOW_MS);
  return found;
}

/** What anyone holding a link sees. No login: the token is the key, plus
 * the link's password (kept as an httpOnly cookie once entered). */
export const publicSharesController = new Elysia({
  name: "public_shares_controller",
  prefix: "/public/shares",
})
  .use(authProcessor)
  .derive(({ request, server }) => ({ ip: clientIp(request, server) }))
  .get(
    "/:token",
    async ({ params, ip, cookie, auth, status }) => {
      const found = await findShareFrom(params.token, ip);
      if (!found) return status(404, fail(NOT_FOUND));
      const { share, book } = found;
      const owner = await userCacheService.get(share.userId);
      const ownerName = owner?.name ?? "Someone";
      if (!isUnlocked(share, cookie[shareCookieName(share)]?.value))
        return ok({ locked: true as const, ownerName });
      // The owner previewing their own link isn't a view.
      if (auth.user?.id !== share.userId) recordView(share);
      return ok({
        locked: false as const,
        ownerName,
        book: {
          // The link's own title hides the book's real name.
          name: share.title ?? book.name,
          icon: book.icon,
          color: book.color,
          totals: book.totals,
        },
        message: share.message,
        fromDate: share.fromDate,
        toDate: share.toDate,
        attachments: share.attachments,
        upi: share.upiId
          ? {
              id: share.upiId,
              payeeName: share.payeeName ?? ownerName,
              button: share.payButton,
            }
          : null,
        /** "I've paid" reports the owner hasn't answered yet. */
        pendingClaims: await pendingClaimsOfShare(share.id),
        ...(await shareEntries(share, book)),
      });
    },
    { params: tToken },
  )
  .post(
    "/:token/unlock",
    async ({ params, ip, body, cookie, request, server, status }) => {
      const key = `share-unlock:${params.token}:${clientIp(request, server)}`;
      if (!rateLimitService.hit(key, UNLOCK_LIMIT, UNLOCK_WINDOW_MS))
        return status(
          429,
          fail("Too many attempts. Try again in a few minutes."),
        );
      const found = await findShareFrom(params.token, ip);
      if (!found) return status(404, fail(NOT_FOUND));
      const { share } = found;
      if (
        share.passwordHash &&
        !(await Bun.password.verify(body.password, share.passwordHash))
      )
        return status(401, fail("Wrong password"));
      rateLimitService.reset(key);
      cookie[shareCookieName(share)]?.set({
        value: shareCookieValue(share),
        path: "/api/public/shares",
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
    async ({ params, ip, body, cookie, request, server, status }) => {
      const found = await findShareFrom(params.token, ip);
      if (!found) return status(404, fail(NOT_FOUND));
      const { share } = found;
      if (!isUnlocked(share, cookie[shareCookieName(share)]?.value))
        return status(401, fail("Enter the password first"));
      const key = `share-claim:${share.id}:${clientIp(request, server)}`;
      if (!rateLimitService.hit(key, CLAIM_LIMIT, CLAIM_WINDOW_MS))
        return status(429, fail("Too many reports. Try again later."));
      const pending = await pendingClaimsOfShare(share.id);
      if (pending.length >= MAX_PENDING_CLAIMS)
        return status(
          429,
          fail("There are already reports waiting to be checked"),
        );
      await db.insert(C).values({
        userId: share.userId,
        bookId: share.bookId,
        shareId: share.id,
        amount: body.amount,
        payerName: body.payerName?.trim() || null,
        reference: body.reference?.trim() || null,
      });
      const owner = await userCacheService.get(share.userId);
      return ok(
        null,
        `Sent. ${owner?.name ?? "The owner"} will confirm once they see the money.`,
      );
    },
    {
      params: tToken,
      body: t.Object({
        amount: t.Integer({ exclusiveMinimum: 0, maximum: 100_000_000_000 }),
        payerName: t.Optional(t.Nullable(t.String({ maxLength: 60 }))),
        reference: t.Optional(t.Nullable(t.String({ maxLength: 40 }))),
      }),
    },
  )
  .get(
    "/:token/export.csv",
    async ({ params, ip, cookie, set, status }) => {
      const found = await findShareFrom(params.token, ip);
      if (!found) return status(404, fail(NOT_FOUND));
      const { share, book } = found;
      if (!isUnlocked(share, cookie[shareCookieName(share)]?.value))
        return status(401, fail("Enter the password first"));
      const { items } = await shareEntries(share, book);
      const lines = items.map((i) =>
        [
          i.date,
          i.type === "debit" ? "Spent" : "Received",
          i.category.name,
          i.note,
          (i.amount / 100).toFixed(2),
        ]
          .map(csvEscape)
          .join(","),
      );
      set.headers["Content-Type"] = "text/csv; charset=utf-8";
      set.headers["Content-Disposition"] =
        `attachment; filename="${(share.title ?? book.name).replace(/[^a-zA-Z0-9 _-]/g, "_")}-expenses.csv"`;
      return ["Date,Type,Category,Note,Amount (INR)", ...lines].join("\n");
    },
    { params: tToken },
  )
  .get(
    "/:token/attachments/:id/file",
    async ({ params, ip, cookie, status }) => {
      const found = await findShareFrom(params.token, ip);
      if (!found) return status(404, fail(NOT_FOUND));
      const { share, book } = found;
      if (!isUnlocked(share, cookie[shareCookieName(share)]?.value))
        return status(401, fail("Enter the password first"));
      const [file] =
        share.attachments === "shown"
          ? await db
              .select()
              .from(attachmentsTable)
              .where(
                and(
                  eq(attachmentsTable.id, params.id),
                  eq(attachmentsTable.userId, share.userId),
                ),
              )
              .limit(1)
          : [];
      if (
        !file?.transactionId ||
        !(await shareShowsTransaction(share, book, file.transactionId))
      )
        return status(404, fail("File not found"));
      return storageService.serve(file.key, file);
    },
    { params: t.Composite([tToken, tId]) },
  );
