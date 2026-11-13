import { index, pgEnum, pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "./users.sql";

/** What an admin did to an account, shown on the admin Activity page. */
export const adminActionTypes = [
  "create_user",
  "revoke_session",
  "revoke_all_sessions",
  "change_role",
  "suspend",
  "reactivate",
  "reset_password",
  "edit_user",
  "delete_user",
  "change_permissions",
  "transfer_master",
] as const;
export type AdminActionType = (typeof adminActionTypes)[number];
export const adminActionTypeEnum = pgEnum(
  "admin_action_type",
  adminActionTypes,
);

export const adminActionsTable = pgTable(
  "admin_actions",
  (pg) => ({
    id: pg.serial("id").primaryKey(),
    /** null once that admin deletes their account */
    adminId: pg.integer("admin_id").references(() => usersTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** null once the target deletes their account */
    targetUserId: pg.integer("target_user_id").references(() => usersTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    action: adminActionTypeEnum("action").notNull(),
    /** Small context, e.g. `{ device }` or `{ from, to }`; never amounts. */
    details: pg.jsonb("details").$type<Record<string, string | number>>(),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    index("admin_actions_admin_idx").on(t.adminId),
    index("admin_actions_target_idx").on(t.targetUserId),
    index("admin_actions_created_idx").on(t.createdAt),
  ],
);
