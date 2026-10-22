import { index, pgEnum, pgTable, primaryKey } from "drizzle-orm/pg-core";

/** `admin` unlocks the system-config page (see `protectedAdmin`). Promote
 * a user with `bun run --cwd apps/api db:make-admin <email>`. */
export const userRoles = ["user", "admin"] as const;
export type UserRole = (typeof userRoles)[number];
export const userRoleEnum = pgEnum("user_role", userRoles);

/** What happens when someone tags this user on a split: `manual` = it waits
 * under "Shared with me", `auto` = their share is booked as an expense. */
export const taggedExpenseModes = ["manual", "auto"] as const;
export type TaggedExpenseMode = (typeof taggedExpenseModes)[number];
export const taggedExpenseModeEnum = pgEnum(
  "tagged_expense_mode",
  taggedExpenseModes,
);

export const usersTable = pgTable("users", (pg) => ({
  id: pg.serial().primaryKey(),
  name: pg.text().notNull(),
  email: pg.text().notNull().unique(),
  /** Lowercase `[a-z0-9_]{3,20}`; the handle others tag on splits. Kept in
   * memory by `usernameService` for fast availability checks. */
  username: pg.text().notNull().unique(),
  usernameChangedAt: pg.timestamp("username_changed_at", {
    withTimezone: true,
  }),
  taggedExpenses: taggedExpenseModeEnum("tagged_expenses")
    .notNull()
    .default("manual"),
  passwordHash: pg.text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("user"),
  /** Overall monthly spending budget; null = not set. */
  monthlyBudget: pg.bigint("monthly_budget", { mode: "number" }),
  createdAt: pg
    .timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: pg
    .timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
}));

export type InsertUser = typeof usersTable.$inferInsert;
export type SelectUser = typeof usersTable.$inferSelect;

/** `userId` won't let `blockedUserId` tag them on splits. */
export const userBlocksTable = pgTable(
  "user_blocks",
  (pg) => ({
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    blockedUserId: pg
      .integer("blocked_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    primaryKey({ columns: [t.userId, t.blockedUserId] }),
    index("user_blocks_blocked_idx").on(t.blockedUserId),
  ],
);
