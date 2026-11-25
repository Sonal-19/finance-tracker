import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";
import { recurringRulesTable } from "./recurring.sql";
import { peopleTable } from "./splits.sql";

/** `pending` = waiting for the tagged user, `accepted` = their own copy of
 * the rule runs (`copy_rule_id`), `declined` = they said no or left. */
export const recurringShareStatuses = [
  "pending",
  "accepted",
  "declined",
] as const;
export type RecurringShareStatus = (typeof recurringShareStatuses)[number];
export const recurringShareStatusEnum = pgEnum(
  "recurring_share_status",
  recurringShareStatuses,
);

/**
 * A recurring rule shared with a tagged person (rent with a flatmate, a
 * family subscription…). Accepting creates a rule in the tagged user's own
 * account for `amount` (their share) that follows the owner's schedule;
 * the owner's edits are copied over and notified (`recurring-share-service`).
 */
export const recurringSharesTable = pgTable(
  "recurring_shares",
  (pg) => ({
    id: pg.serial().primaryKey(),
    ruleId: pg
      .integer("rule_id")
      .notNull()
      .references(() => recurringRulesTable.id, { onDelete: "cascade" }),
    ownerId: pg
      .integer("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    personId: pg
      .integer("person_id")
      .notNull()
      .references(() => peopleTable.id, { onDelete: "cascade" }),
    /** The tagged person's account (people.linked_user_id when shared). */
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    /** Their share per occurrence, smallest INR unit. */
    amount: pg.bigint({ mode: "number" }).notNull(),
    status: recurringShareStatusEnum("status").notNull().default("pending"),
    /** Their own rule, once accepted. */
    copyRuleId: pg
      .integer("copy_rule_id")
      .references(() => recurringRulesTable.id, { onDelete: "set null" }),
    decidedAt: pg.timestamp("decided_at", { withTimezone: true }),
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
    uniqueIndex("recurring_shares_rule_person_uq").on(t.ruleId, t.personId),
    index("recurring_shares_owner_idx").on(t.ownerId),
    index("recurring_shares_person_idx").on(t.personId),
    index("recurring_shares_user_idx").on(t.userId),
    uniqueIndex("recurring_shares_copy_uq")
      .on(t.copyRuleId)
      .where(sql`${t.copyRuleId} is not null`),
  ],
);
export type SelectRecurringShare = typeof recurringSharesTable.$inferSelect;
