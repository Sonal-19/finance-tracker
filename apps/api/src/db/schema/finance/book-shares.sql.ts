import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";
import { booksTable } from "./books.sql";
import { transactionsTable } from "./transactions.sql";

/** Whether the people opening a share link can open the bills attached to
 * its entries. */
export const shareAttachmentModes = ["hidden", "shown"] as const;
export type ShareAttachmentMode = (typeof shareAttachmentModes)[number];
export const shareAttachmentModeEnum = pgEnum(
  "share_attachment_mode",
  shareAttachmentModes,
);

/** Whether the page also has a button that opens a UPI app on the viewer's
 * phone. Many apps refuse links opened this way, so the QR code is the
 * default and the button is the link maker's choice. */
export const sharePayButtonModes = ["hidden", "shown"] as const;
export type SharePayButtonMode = (typeof sharePayButtonModes)[number];
export const sharePayButtonModeEnum = pgEnum(
  "share_pay_button_mode",
  sharePayButtonModes,
);

/**
 * A public, read-only link to one book's entries (`/s/<token>`), so whoever
 * the money was spent for can review it and pay it back. Deleting the row
 * turns the link off.
 */
export const bookSharesTable = pgTable(
  "book_shares",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    bookId: pg
      .integer("book_id")
      .notNull()
      .references(() => booksTable.id, { onDelete: "cascade" }),
    /** The unguessable part of the link. */
    token: pg.text().notNull().unique(),
    /** A line shown to the viewer above the entries. */
    message: pg.text(),
    /** Only entries on or after this date are shown; null = the whole book. */
    fromDate: pg.date("from_date", { mode: "string" }),
    /** Only expenses on or before this date are shown; null = up to today.
     * Money received back still counts after it, so the period can be paid
     * off once it has ended. */
    toDate: pg.date("to_date", { mode: "string" }),
    /** Last day the link works; null = until it is deleted. */
    expiresOn: pg.date("expires_on", { mode: "string" }),
    /** Null = anyone with the link can open it. */
    passwordHash: pg.text("password_hash"),
    /** Signs the "unlocked" cookie. Replaced whenever the password changes,
     * which locks every browser again. */
    secret: pg.text().notNull(),
    /** Where the viewer can pay; null = no payment section. */
    upiId: pg.text("upi_id"),
    /** Name shown in the UPI app; null = the owner's name. */
    payeeName: pg.text("payee_name"),
    payButton: sharePayButtonModeEnum("pay_button").notNull().default("hidden"),
    attachments: shareAttachmentModeEnum("attachments")
      .notNull()
      .default("hidden"),
    viewCount: pg.integer("view_count").notNull().default(0),
    lastViewedAt: pg.timestamp("last_viewed_at", { withTimezone: true }),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: pg
      .timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  }),
  (t) => [
    index("book_shares_book_idx").on(t.bookId),
    index("book_shares_user_idx").on(t.userId),
  ],
);

export type SelectBookShare = typeof bookSharesTable.$inferSelect;

/** `pending` until the book's owner confirms (books the money) or dismisses it. */
export const paymentClaimStatuses = [
  "pending",
  "confirmed",
  "dismissed",
] as const;
export type PaymentClaimStatus = (typeof paymentClaimStatuses)[number];
export const paymentClaimStatusEnum = pgEnum(
  "payment_claim_status",
  paymentClaimStatuses,
);

/**
 * "I've paid", pressed by someone on a share link. It is only what they
 * say: nothing is booked until the owner confirms it, which creates the
 * credit transaction in the book.
 */
export const paymentClaimsTable = pgTable(
  "payment_claims",
  (pg) => ({
    id: pg.serial().primaryKey(),
    /** The book's owner, who decides on it. */
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    bookId: pg
      .integer("book_id")
      .notNull()
      .references(() => booksTable.id, { onDelete: "cascade" }),
    /** The link it came through; null once that link is deleted. */
    shareId: pg
      .integer("share_id")
      .references(() => bookSharesTable.id, { onDelete: "set null" }),
    amount: pg.bigint({ mode: "number" }).notNull(),
    payerName: pg.text("payer_name"),
    /** UPI reference / UTR, as typed by the payer. */
    reference: pg.text(),
    status: paymentClaimStatusEnum("status").notNull().default("pending"),
    /** When `status` left `pending`. */
    decidedAt: pg.timestamp("decided_at", { withTimezone: true }),
    /** The credit booked on confirming. */
    transactionId: pg
      .integer("transaction_id")
      .references(() => transactionsTable.id, { onDelete: "set null" }),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    // What the owner is asked about, per book (also the books list's count).
    index("payment_claims_book_pending_idx")
      .on(t.bookId)
      .where(sql`${t.status} = 'pending'`),
    index("payment_claims_book_idx").on(t.bookId),
    index("payment_claims_user_idx").on(t.userId),
    index("payment_claims_share_idx")
      .on(t.shareId)
      .where(sql`${t.shareId} is not null`),
    index("payment_claims_transaction_idx")
      .on(t.transactionId)
      .where(sql`${t.transactionId} is not null`),
  ],
);

export type SelectPaymentClaim = typeof paymentClaimsTable.$inferSelect;
