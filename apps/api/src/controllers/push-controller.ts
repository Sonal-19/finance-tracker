import { and, count, eq } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import { pushSubscriptionsTable } from "$/db/schema";
import { pushService } from "$/lib/services/push-service";
import { deliver } from "$/lib/services/reminder-service";
import { fail, ok } from "$/lib/utils";
import { protectedUser } from "$/pre-processor";

const P = pushSubscriptionsTable;

const deviceCount = async (userId: number) =>
  (await db.select({ n: count() }).from(P).where(eq(P.userId, userId)))[0]?.n ??
  0;

/** Web Push devices (browsers) of the logged-in user. */
export const pushController = new Elysia({
  name: "push_controller",
  prefix: "/push",
})
  .use(protectedUser)
  /** The VAPID public key (null = push is off on this server), and how many
   * of the user's browsers get notifications. */
  .get("/config", async ({ user }) =>
    ok({
      publicKey: pushService.publicKey,
      devices: await deviceCount(user.id),
    }),
  )
  /** Registers (or moves to this account and session) a browser. Called on
   * every app start once permission is granted: subscriptions rotate and a
   * new login is a new session. */
  .post(
    "/devices",
    async ({ user, token, body, headers, status }) => {
      if (!pushService.enabled)
        return status(503, fail("Notifications aren't set up on this server"));
      const values = {
        userId: user.id,
        sessionToken: token,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: headers["user-agent"]?.slice(0, 300) ?? null,
      };
      await db
        .insert(P)
        .values(values)
        .onConflictDoUpdate({ target: P.endpoint, set: values });
      return ok(
        { devices: await deviceCount(user.id) },
        "Notifications are on for this device",
      );
    },
    {
      body: t.Object({
        endpoint: t.String({ format: "uri", maxLength: 2048 }),
        keys: t.Object({
          p256dh: t.String({ minLength: 20, maxLength: 200 }),
          auth: t.String({ minLength: 8, maxLength: 100 }),
        }),
      }),
    },
  )
  .post(
    "/devices/remove",
    async ({ user, body }) => {
      await db
        .delete(P)
        .where(and(eq(P.userId, user.id), eq(P.endpoint, body.endpoint)));
      return ok(
        { devices: await deviceCount(user.id) },
        "Notifications are off for this device",
      );
    },
    { body: t.Object({ endpoint: t.String({ maxLength: 2048 }) }) },
  )
  /** A test notification to the inbox and every browser with push on. */
  .post("/test", async ({ user }) => {
    await deliver({
      userId: user.id,
      kind: "test",
      url: "/reminders",
      dedupeKey: `test:${Date.now()}`,
      title: "🔔 Test from Finance Tracker",
      body: "Reminders reach this device even when the app is closed.",
    });
    const devices = await deviceCount(user.id);
    return ok(
      { devices },
      devices
        ? `Test sent to ${devices} device${devices > 1 ? "s" : ""}`
        : "Test added to your notifications (no device has push on)",
    );
  });
