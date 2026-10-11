import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "$/db";
import { attachmentsTable, type SelectAttachment } from "$/db/schema";
import { storageService } from "./storage-service";

const A = attachmentsTable;

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TRANSACTION = 5;
/** Everything one user may keep in storage. */
export const USER_STORAGE_QUOTA_BYTES = 500 * 1024 * 1024;

const TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
} as const;
export type AttachmentType = keyof typeof TYPES;

const startsWith = (b: Uint8Array, sig: number[], at = 0) =>
  sig.every((v, i) => b[at + i] === v);

/** The real type, read from the file's first bytes (the name and the type
 * the browser claims are not trusted). Null = not something we store. */
export function sniffType(b: Uint8Array): AttachmentType | null {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  if (
    startsWith(b, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)
  )
    return "image/webp";
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

/** A display name that is safe in a header and ends in the real extension. */
export function cleanFileName(name: string, type: AttachmentType) {
  const base =
    name
      .replace(/\.[a-z0-9]{1,5}$/i, "")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
      .replace(/[\x00-\x1f\x7f/\\]/g, "")
      .trim()
      .slice(0, 80) || "attachment";
  return `${base}.${TYPES[type]}`;
}

export const newAttachmentKey = (
  userId: number,
  transactionId: number,
  type: AttachmentType,
) =>
  `attachments/${userId}/${transactionId}/${crypto.randomUUID()}.${TYPES[type]}`;

/** What the web needs to list a file; the storage key never leaves the API. */
export const serializeAttachment = (a: SelectAttachment) => ({
  id: a.id,
  fileName: a.fileName,
  contentType: a.contentType,
  size: a.size,
  createdAt: a.createdAt,
});
export type AttachmentInfo = ReturnType<typeof serializeAttachment>;

/** Attachments of the given transactions, grouped by transaction id. */
export async function attachmentsByTransaction(transactionIds: number[]) {
  const out = new Map<number, AttachmentInfo[]>();
  if (!transactionIds.length) return out;
  const rows = await db
    .select()
    .from(A)
    .where(inArray(A.transactionId, transactionIds))
    .orderBy(A.id);
  for (const r of rows) {
    const list = out.get(r.transactionId!) ?? [];
    list.push(serializeAttachment(r));
    out.set(r.transactionId!, list);
  }
  return out;
}

export async function storageUsed(userId: number) {
  const [row] = await db
    .select({ bytes: sql<string>`coalesce(sum(${A.size}), 0)` })
    .from(A)
    .where(eq(A.userId, userId));
  return Number(row?.bytes ?? 0);
}

async function removeRows(rows: { id: number; key: string }[]) {
  const gone: number[] = [];
  for (const r of rows) {
    try {
      await storageService.delete(r.key);
      gone.push(r.id);
    } catch (error) {
      // Keep the row so the next sweep tries again.
      console.error(`attachment ${r.id}: storage delete failed`, error);
    }
  }
  if (gone.length) await db.delete(A).where(inArray(A.id, gone));
  return gone.length;
}

export async function deleteAttachment(userId: number, id: number) {
  const rows = await db
    .select({ id: A.id, key: A.key })
    .from(A)
    .where(and(eq(A.id, id), eq(A.userId, userId)));
  if (!rows.length) return false;
  return (await removeRows(rows)) > 0;
}

/** Keys of everything a user stored, read before the account is deleted
 * (the rows cascade away with the user). */
export async function attachmentKeysOf(userId: number) {
  const rows = await db
    .select({ key: A.key })
    .from(A)
    .where(eq(A.userId, userId));
  return rows.map((r) => r.key);
}

export async function deleteStoredObjects(keys: string[]) {
  for (const key of keys)
    await storageService.delete(key).catch((error) => {
      console.error(`storage delete failed: ${key}`, error);
    });
}

/**
 * Removes files whose transaction was deleted. Transactions are deleted from
 * many places (directly, with a split, with a recurring cleanup), so instead
 * of hooking each one the foreign key nulls `transaction_id` and this
 * collects what is left.
 */
export async function sweepOrphanAttachments() {
  const rows = await db
    .select({ id: A.id, key: A.key })
    .from(A)
    .where(isNull(A.transactionId))
    .limit(500);
  return rows.length ? removeRows(rows) : 0;
}

let timer: ReturnType<typeof setInterval> | undefined;

export function startAttachmentSweep() {
  if (timer) return;
  const run = () => sweepOrphanAttachments().catch(console.error);
  run();
  timer = setInterval(run, 60 * 60 * 1000);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
}
