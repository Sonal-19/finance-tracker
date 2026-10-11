import { and, eq, sql } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import { attachmentsTable, transactionsTable } from "$/db/schema";
import {
  cleanFileName,
  deleteAttachment,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_TRANSACTION,
  newAttachmentKey,
  serializeAttachment,
  sniffType,
  storageUsed,
  USER_STORAGE_QUOTA_BYTES,
} from "$/lib/services/attachment-service";
import { storageService } from "$/lib/services/storage-service";
import { fail, ok } from "$/lib/utils";
import { protectedUser } from "$/pre-processor";

const A = attachmentsTable;
const tId = t.Object({ id: t.Numeric() });

async function ownedTransactionId(userId: number, id: number) {
  const [row] = await db
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(
      and(eq(transactionsTable.id, id), eq(transactionsTable.userId, userId)),
    )
    .limit(1);
  return row?.id;
}

/** Bills and receipts kept with a transaction (images and PDFs). */
export const attachmentsController = new Elysia({
  name: "attachments_controller",
  prefix: "/attachments",
})
  .use(protectedUser)
  .get(
    "/",
    async ({ user, query }) => {
      const rows = await db
        .select()
        .from(A)
        .where(
          and(eq(A.userId, user.id), eq(A.transactionId, query.transactionId)),
        )
        .orderBy(A.id);
      return ok(rows.map(serializeAttachment));
    },
    { query: t.Object({ transactionId: t.Numeric({ minimum: 1 }) }) },
  )
  .post(
    "/",
    async ({ user, body, status }) => {
      const transactionId = await ownedTransactionId(
        user.id,
        body.transactionId,
      );
      if (!transactionId) return status(404, fail("Transaction not found"));
      const { file } = body;
      if (file.size > MAX_ATTACHMENT_BYTES)
        return status(413, fail("Files can be up to 10 MB"));
      const data = new Uint8Array(await file.arrayBuffer());
      const type = sniffType(data);
      if (!type)
        return status(
          415,
          fail("Only JPG, PNG, WebP images and PDFs can be attached"),
        );
      const [[count], used] = await Promise.all([
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(A)
          .where(eq(A.transactionId, transactionId)),
        storageUsed(user.id),
      ]);
      if ((count?.n ?? 0) >= MAX_ATTACHMENTS_PER_TRANSACTION)
        return status(
          400,
          fail(
            `A transaction can have up to ${MAX_ATTACHMENTS_PER_TRANSACTION} files`,
          ),
        );
      if (used + data.length > USER_STORAGE_QUOTA_BYTES)
        return status(
          413,
          fail("Your storage is full. Remove some older files first."),
        );

      const key = newAttachmentKey(user.id, transactionId, type);
      const fileName = cleanFileName(file.name, type);
      await storageService.put(key, data, { contentType: type, fileName });
      try {
        const [row] = await db
          .insert(A)
          .values({
            userId: user.id,
            transactionId,
            key,
            fileName,
            contentType: type,
            size: data.length,
          })
          .returning();
        return ok(serializeAttachment(row!), "File attached");
      } catch (e) {
        // e.g. the transaction was deleted meanwhile: don't leave the file behind.
        await storageService.delete(key).catch(() => {});
        throw e;
      }
    },
    {
      body: t.Object({
        transactionId: t.Numeric({ minimum: 1 }),
        file: t.File(),
      }),
    },
  )
  .get(
    "/:id/file",
    async ({ user, params, status }) => {
      const [row] = await db
        .select()
        .from(A)
        .where(and(eq(A.id, params.id), eq(A.userId, user.id)))
        .limit(1);
      if (!row) return status(404, fail("File not found"));
      return storageService.serve(row.key, row);
    },
    { params: tId },
  )
  .delete(
    "/:id",
    async ({ user, params, status }) => {
      if (!(await deleteAttachment(user.id, params.id)))
        return status(404, fail("File not found"));
      return ok(null, "File removed");
    },
    { params: tId },
  );
