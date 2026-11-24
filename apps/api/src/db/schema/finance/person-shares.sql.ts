import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";
import {
  paymentClaimStatusEnum,
  sharePayButtonModeEnum,
} from "./book-shares.sql";
import { peopleTable, settlementsTable } from "./splits.sql";

/** Whether a person's link names the others on each bill and their shares,
 * or only shows the viewer's own share. */
export const shareParticipantModes = ["shown", "hidden"] as const;
export type ShareParticipantMode = (typeof shareParticipantModes)[number];
export const shareParticipantModeEnum = pgEnum(
  "share_participant_mode",
  shareParticipantModes,
);

/**
 * A public, read-only link (`/p/<token>`) for one person the user splits
 * with: every bill they were part of, payments both ways and the balance.
 * They need no account. Deleting the row turns the link off.
 */
export const personSharesTable = pgTable(
  "person_shares",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    personId: pg
      .integer("person_id")
      .notNull()
      .references(() => peopleTable.id, { onDelete: "cascade" }),
    token: pg.text().notNull().unique(),
    /** A line shown to the viewer above the bills. */
    message: pg.text(),
    /** Last day the link works; null = until it is deleted. */
    expiresOn: pg.date("expires_on", { mode: "string" }),
    /** Null = anyone with the link can open it. */
    passwordHash: pg.text("password_hash"),
    /** Signs the "unlocked" cookie; replaced whenever the password changes. */
    secret: pg.text().notNull(),
    upiId: pg.text("upi_id"),
    payeeName: pg.text("payee_name"),
    payButton: sharePayButtonModeEnum("pay_button").notNull().default("hidden"),
    participants: shareParticipantModeEnum("participants")
      .notNull()
      .default("shown"),
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
    index("person_shares_person_idx").on(t.personId),
    index("person_shares_user_idx").on(t.userId),
  ],
);

export type SelectPersonShare = typeof personSharesTable.$inferSelect;

/**
 * "I've paid you back", pressed on a person's link. Only what they say:
 * nothing changes until the user confirms, which records a settlement.
 */
export const settlementClaimsTable = pgTable(
  "settlement_claims",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    personId: pg
      .integer("person_id")
      .notNull()
      .references(() => peopleTable.id, { onDelete: "cascade" }),
    /** The link it came through; null once that link is deleted. */
    shareId: pg
      .integer("share_id")
      .references(() => personSharesTable.id, { onDelete: "set null" }),
    amount: pg.bigint({ mode: "number" }).notNull(),
    /** UPI reference / UTR, as typed by the payer. */
    reference: pg.text(),
    note: pg.text(),
    status: paymentClaimStatusEnum("status").notNull().default("pending"),
    decidedAt: pg.timestamp("decided_at", { withTimezone: true }),
    /** The settlement recorded on confirming. */
    settlementId: pg
      .integer("settlement_id")
      .references(() => settlementsTable.id, { onDelete: "set null" }),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    index("settlement_claims_person_pending_idx")
      .on(t.personId)
      .where(sql`${t.status} = 'pending'`),
    index("settlement_claims_person_idx").on(t.personId),
    index("settlement_claims_user_idx").on(t.userId),
    index("settlement_claims_share_idx")
      .on(t.shareId)
      .where(sql`${t.shareId} is not null`),
    index("settlement_claims_settlement_idx")
      .on(t.settlementId)
      .where(sql`${t.settlementId} is not null`),
  ],
);

export type SelectSettlementClaim = typeof settlementClaimsTable.$inferSelect;
