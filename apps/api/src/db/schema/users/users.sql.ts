import { pgEnum, pgTable } from "drizzle-orm/pg-core";

/** `admin` unlocks the system-config page (see `protectedAdmin`). Promote
 * a user with `bun run --cwd apps/api db:make-admin <email>`. */
export const userRoles = ["user", "admin"] as const;
export type UserRole = (typeof userRoles)[number];
export const userRoleEnum = pgEnum("user_role", userRoles);

export const usersTable = pgTable("users", (pg) => ({
  id: pg.serial().primaryKey(),
  name: pg.text().notNull(),
  email: pg.text().notNull().unique(),
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
