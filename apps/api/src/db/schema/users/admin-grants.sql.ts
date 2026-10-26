import { index, pgEnum, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users.sql";

/** What a non-master admin may do, granted one by one by the master admin.
 * The master has all of them; any admin sees the overview. Roles and grants
 * themselves are master-only and aren't in this list. */
export const adminPermissions = [
  "users.view",
  "users.create",
  "users.edit",
  "users.delete",
  "users.suspend",
  "users.password",
  "sessions.view",
  "sessions.revoke",
  "activity.view",
  "system_config.edit",
] as const;
export type AdminPermission = (typeof adminPermissions)[number];
export const adminPermissionEnum = pgEnum("admin_permission", adminPermissions);

export const adminGrantsTable = pgTable(
  "admin_grants",
  (pg) => ({
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    permission: adminPermissionEnum("permission").notNull(),
    /** null once the master who granted it deletes their account */
    grantedBy: pg
      .integer("granted_by")
      .references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    primaryKey({ columns: [t.userId, t.permission] }),
    index("admin_grants_granted_by_idx").on(t.grantedBy),
  ],
);
