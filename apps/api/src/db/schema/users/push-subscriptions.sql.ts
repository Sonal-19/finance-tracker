import { index, pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "./users.sql";

/** A browser that receives Web Push reminders. Tied to the login session it
 * was registered from: logging out removes it, and a 404/410 from the push
 * service (unsubscribed, app uninstalled) deletes it. */
export const pushSubscriptionsTable = pgTable(
  "push_subscriptions",
  (pg) => ({
    id: pg.serial().primaryKey(),
    userId: pg
      .integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    /** The session token it was registered with (dropped on logout). */
    sessionToken: pg.text("session_token"),
    endpoint: pg.text().notNull().unique(),
    p256dh: pg.text().notNull(),
    auth: pg.text().notNull(),
    userAgent: pg.text("user_agent"),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** Last push the service accepted for it. */
    lastSuccessAt: pg.timestamp("last_success_at", { withTimezone: true }),
  }),
  (t) => [
    index("push_subscriptions_user_idx").on(t.userId),
    index("push_subscriptions_session_idx").on(t.sessionToken),
  ],
);
