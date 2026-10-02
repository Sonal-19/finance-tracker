import { pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.sql";
import type { SystemConfig } from "./system-config.sql";

/** Audit trail for system_config: the singleton row is otherwise
 * overwritten with no record of who changed what. */
export const systemConfigHistoryTable = pgTable(
  "system_config_history",
  (pg) => ({
    id: pg.serial("id").primaryKey(),
    /** null once the admin who made the change deletes their account */
    modifiedBy: pg.integer("modified_by").references(() => usersTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** full before/after snapshot of the entire config */
    details: pg
      .jsonb("details")
      .$type<{ before: SystemConfig; after: SystemConfig }>()
      .notNull(),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
);
