import { pgEnum, pgTable, primaryKey } from "drizzle-orm/pg-core";

/** `admin` unlocks the system-config page (see `protectedAdmin`). Promote
 * a user with `bun run --cwd apps/api db:make-admin <email>`. */
export const userRoles = ["user", "admin"] as const;
export type UserRole = (typeof userRoles)[number];
export const userRoleEnum = pgEnum("user_role", userRoles);

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
  /** Book a share of splits others tag this user on as an expense by default. */
  addTaggedExpenses: pg.boolean("add_tagged_expenses").notNull().default(false),
  passwordHash: pg.text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("user"),
  /** Overall monthly spending budget in paise; null = not set. */
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
  (t) => [primaryKey({ columns: [t.userId, t.blockedUserId] })],
);
