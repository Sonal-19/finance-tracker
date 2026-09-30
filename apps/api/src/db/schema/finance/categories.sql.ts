import { pgTable, unique } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";
import { txnTypeEnum } from "./enums.sql";

export const categoriesTable = pgTable(
  "categories",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: pg.text().notNull(),
    type: txnTypeEnum("type").notNull(),
    /** lucide icon name, e.g. "shopping-cart" */
    icon: pg.text().notNull().default("circle"),
    color: pg.text().notNull().default("#64748b"),
    isDefault: pg.boolean("is_default").notNull().default(false),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [unique("categories_user_type_name").on(t.userId, t.type, t.name)],
);

export type InsertCategory = typeof categoriesTable.$inferInsert;
export type SelectCategory = typeof categoriesTable.$inferSelect;
