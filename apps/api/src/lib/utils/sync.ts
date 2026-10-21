import { t } from "elysia";

// Helpers for writes that may come from the web app's offline queue: a
// create carries a `clientId` so a retry can't add it twice, and an edit
// carries the `updatedAt` it started from plus when the user made it, so a
// change made elsewhere in the meantime is noticed.

/** Optional on every create the offline queue can send. */
export const tClientId = t.Optional(t.String({ format: "uuid" }));

/** Optional on every edit the offline queue can send. */
export const tSyncMeta = {
  /** The row's `updatedAt` when this device last saw it. */
  baseUpdatedAt: t.Optional(t.String({ format: "date-time" })),
  /** When the user made this edit (may be well before it reached us). */
  editedAt: t.Optional(t.String({ format: "date-time" })),
};

export type EditVerdict =
  /** Nobody else changed it (or the client didn't say): just save. */
  | "apply"
  /** Changed elsewhere, but this edit was made later: it wins. */
  | "overwrite"
  /** Changed elsewhere after this edit was made: keep theirs. */
  | "stale";

/** Latest edit wins: compares the row's current `updatedAt` with the edit. */
export function editVerdict(
  current: Date | string,
  meta: { baseUpdatedAt?: string; editedAt?: string },
): EditVerdict {
  if (!meta.baseUpdatedAt) return "apply";
  const now = new Date(current).getTime();
  if (now <= new Date(meta.baseUpdatedAt).getTime()) return "apply";
  const editedAt = meta.editedAt ? new Date(meta.editedAt).getTime() : 0;
  return editedAt >= now ? "overwrite" : "stale";
}

/** 409 body for a stale edit: what is saved now, so the client can show it. */
export function staleEdit<T>(current: T) {
  return {
    success: false as const,
    message: "This was changed on another device after your edit",
    data: current,
  };
}
