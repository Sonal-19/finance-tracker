import { sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";
import { accountsTable } from "./accounts.sql";
import { categoriesTable } from "./categories.sql";
import { paymentMethodEnum } from "./enums.sql";
import { eventsTable } from "./events.sql";

/** People the user splits money with. They don't need an account. */
export const relations = ["friend", "office", "family", "other"] as const;
export type Relation = (typeof relations)[number];
export const relationEnum = pgEnum("relation", relations);

export const peopleTable = pgTable(
  "people",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: pg.text().notNull(),
    phone: pg.text(),
    email: pg.text(),
    relation: relationEnum("relation").notNull().default("friend"),
    /** Set when this person was tagged by @username: the real account whose
     * books mirror their share. */
    linkedUserId: pg
      .integer("linked_user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    index("people_user_idx").on(t.userId),
    unique("people_user_linked_unique").on(t.userId, t.linkedUserId),
    // "Shared with me" starts from the tagged user's id.
    index("people_linked_user_idx")
      .on(t.linkedUserId)
      .where(sql`${t.linkedUserId} is not null`),
  ],
);

export const splitGroupsTable = pgTable(
  "split_groups",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: pg.text().notNull(),
    icon: pg.text().notNull().default("users"),
    color: pg.text().notNull().default("#0d9488"),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [index("split_groups_user_idx").on(t.userId)],
);

export const splitGroupMembersTable = pgTable(
  "split_group_members",
  (pg) => ({
    groupId: pg
      .integer("group_id")
      .notNull()
      .references(() => splitGroupsTable.id, { onDelete: "cascade" }),
    personId: pg
      .integer("person_id")
      .notNull()
      .references(() => peopleTable.id, { onDelete: "cascade" }),
  }),
  (t) => [
    primaryKey({ columns: [t.groupId, t.personId] }),
    index("split_group_members_person_idx").on(t.personId),
  ],
);

export const splitMethods = ["equal", "exact", "percent", "shares"] as const;
export type SplitMethod = (typeof splitMethods)[number];
export const splitMethodEnum = pgEnum("split_method", splitMethods);

/** Whether the user's own share is booked as a debit transaction. */
export const ownShareModes = ["recorded", "skipped"] as const;
export type OwnShareMode = (typeof ownShareModes)[number];
export const ownShareModeEnum = pgEnum("own_share_mode", ownShareModes);

/** One shared bill. `paidByPersonId` null = the user paid. */
export const splitsTable = pgTable(
  "splits",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    groupId: pg
      .integer("group_id")
      .references(() => splitGroupsTable.id, { onDelete: "set null" }),
    description: pg.text().notNull(),
    total: pg.bigint({ mode: "number" }).notNull(),
    date: pg.date({ mode: "string" }).notNull(),
    paidByPersonId: pg
      .integer("paid_by_person_id")
      .references(() => peopleTable.id, { onDelete: "restrict" }),
    method: splitMethodEnum("method").notNull().default("equal"),
    /** Category for the user's own share (recorded as a debit transaction). */
    categoryId: pg
      .integer("category_id")
      .references(() => categoriesTable.id, { onDelete: "set null" }),
    ownShare: ownShareModeEnum("own_share").notNull().default("recorded"),
    /** Account your share is recorded against (null = default account). */
    accountId: pg
      .integer("account_id")
      .references(() => accountsTable.id, { onDelete: "set null" }),
    eventId: pg
      .integer("event_id")
      .references(() => eventsTable.id, { onDelete: "set null" }),
    note: pg.text(),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    index("splits_user_date_idx").on(t.userId, t.date, t.id),
    index("splits_group_idx")
      .on(t.groupId)
      .where(sql`${t.groupId} is not null`),
    index("splits_paid_by_idx")
      .on(t.paidByPersonId)
      .where(sql`${t.paidByPersonId} is not null`),
  ],
);

/** Each participant's share. `personId` null = the user. `value` is what was
 * typed for the method (₹ for exact, % for percent, count for shares). */
export const splitSharesTable = pgTable(
  "split_shares",
  (pg) => ({
    id: pg.serial().primaryKey(),
    splitId: pg
      .integer("split_id")
      .notNull()
      .references(() => splitsTable.id, { onDelete: "cascade" }),
    personId: pg
      .integer("person_id")
      .references(() => peopleTable.id, { onDelete: "restrict" }),
    amount: pg.bigint({ mode: "number" }).notNull(),
    value: pg.doublePrecision(),
  }),
  (t) => [
    index("split_shares_split_idx").on(t.splitId),
    index("split_shares_person_idx")
      .on(t.personId)
      .where(sql`${t.personId} is not null`),
  ],
);

/** received = person paid the user back; paid = user paid the person. */
export const settlementDirections = ["received", "paid"] as const;
export type SettlementDirection = (typeof settlementDirections)[number];
export const settlementDirectionEnum = pgEnum(
  "settlement_direction",
  settlementDirections,
);

export const settlementsTable = pgTable(
  "settlements",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    personId: pg
      .integer("person_id")
      .notNull()
      .references(() => peopleTable.id, { onDelete: "restrict" }),
    groupId: pg
      .integer("group_id")
      .references(() => splitGroupsTable.id, { onDelete: "set null" }),
    direction: settlementDirectionEnum("direction").notNull(),
    amount: pg.bigint({ mode: "number" }).notNull(),
    date: pg.date({ mode: "string" }).notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("upi"),
    note: pg.text(),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    index("settlements_user_person_idx").on(t.userId, t.personId),
    index("settlements_person_idx").on(t.personId),
  ],
);

export type SelectPerson = typeof peopleTable.$inferSelect;
export type SelectSplit = typeof splitsTable.$inferSelect;

/** A tagged user's choice for one split: `added` = keep my share as an
 * expense, `skipped` = don't. No row = follow their `tagged_expenses` setting. */
export const sharedSplitDecisions = ["added", "skipped"] as const;
export type SharedSplitDecision = (typeof sharedSplitDecisions)[number];
export const sharedSplitDecisionEnum = pgEnum(
  "shared_split_decision",
  sharedSplitDecisions,
);

export const sharedSplitPrefsTable = pgTable(
  "shared_split_prefs",
  (pg) => ({
    splitId: pg
      .integer("split_id")
      .notNull()
      .references(() => splitsTable.id, { onDelete: "cascade" }),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    decision: sharedSplitDecisionEnum("decision").notNull(),
    decidedAt: pg
      .timestamp("decided_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    primaryKey({ columns: [t.splitId, t.userId] }),
    index("shared_split_prefs_user_idx").on(t.userId),
  ],
);
