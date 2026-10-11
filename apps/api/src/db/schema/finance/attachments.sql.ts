import { index, pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";
import { transactionsTable } from "./transactions.sql";

/**
 * A bill, receipt or screenshot kept with a transaction. The file itself is
 * in object storage under `key` (`storageService`); this row is who owns it
 * and what it is.
 */
export const attachmentsTable = pgTable(
  "attachments",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    /** Null once the transaction is gone: the row then only waits for
     * `sweepOrphanAttachments` to remove its file from storage. */
    transactionId: pg
      .integer("transaction_id")
      .references(() => transactionsTable.id, { onDelete: "set null" }),
    key: pg.text().notNull().unique(),
    fileName: pg.text("file_name").notNull(),
    /** Detected from the file's first bytes, never taken from the upload. */
    contentType: pg.text("content_type").notNull(),
    /** Bytes. */
    size: pg.integer().notNull(),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    index("attachments_transaction_idx").on(t.transactionId),
    // `size` is in the key so a user's storage use is an index-only sum.
    index("attachments_user_idx").on(t.userId, t.size),
  ],
);

export type SelectAttachment = typeof attachmentsTable.$inferSelect;
