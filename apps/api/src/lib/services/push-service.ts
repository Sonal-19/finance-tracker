import { eq, inArray } from "drizzle-orm";
import webpush, { WebPushError } from "web-push";
import { db } from "$/db";
import { pushSubscriptionsTable } from "$/db/schema";
import { VAPID } from "$/env";

const P = pushSubscriptionsTable;

/** What the service worker (`public/push-sw.js`) draws. */
export type PushPayload = {
  title: string;
  body: string;
  /** Same tag = replaces the earlier notification on the device. */
  tag: string;
  /** Opened on tap. */
  url: string;
};

/** A reminder older than this is dropped by the push service rather than
 * delivered late to a device that was offline (it's still in the inbox). */
const TTL_SECONDS = 24 * 60 * 60;
/** Parallel sends per batch. */
const CONCURRENCY = 50;

/**
 * Web Push with VAPID (no Firebase), as in task-uncle: the browser's own
 * push service (FCM in Chrome, Mozilla's, Apple's) holds the message while
 * the device is offline and hands it to our service worker, which draws it.
 */
class PushService {
  readonly enabled = !!(VAPID.publicKey && VAPID.privateKey);

  constructor() {
    if (this.enabled)
      webpush.setVapidDetails(VAPID.subject, VAPID.publicKey, VAPID.privateKey);
    else console.warn("[Push] VAPID keys missing: Web Push is off");
  }

  get publicKey() {
    return this.enabled ? VAPID.publicKey : null;
  }

  /** Sends to every browser of a user; dead subscriptions are deleted. */
  async sendToUser(userId: number, payloads: PushPayload[]) {
    if (!this.enabled || !payloads.length) return { sent: 0, devices: 0 };
    const subs = await db.select().from(P).where(eq(P.userId, userId));
    const dead: number[] = [];
    const sent: number[] = [];
    const jobs = subs.flatMap((s) => payloads.map((p) => ({ s, p })));
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      await Promise.all(
        jobs.slice(i, i + CONCURRENCY).map(async ({ s, p }) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: s.endpoint,
                keys: { p256dh: s.p256dh, auth: s.auth },
              },
              JSON.stringify(p),
              { TTL: TTL_SECONDS, urgency: "high", topic: topicOf(p.tag) },
            );
            sent.push(s.id);
          } catch (err) {
            if (
              err instanceof WebPushError &&
              (err.statusCode === 404 || err.statusCode === 410)
            )
              dead.push(s.id);
            else
              console.error(
                `[Push] send to subscription ${s.id} failed:`,
                err instanceof Error ? err.message : err,
              );
          }
        }),
      );
    }
    if (dead.length)
      await db.delete(P).where(inArray(P.id, [...new Set(dead)]));
    if (sent.length)
      await db
        .update(P)
        .set({ lastSuccessAt: new Date() })
        .where(inArray(P.id, [...new Set(sent)]));
    return { sent: sent.length, devices: subs.length - new Set(dead).size };
  }
}

/** Push "topic": a newer reminder with the same tag replaces one still
 * waiting at the push service (max 32 URL-safe chars). */
const topicOf = (tag: string) =>
  tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "reminder";

export const pushService = new PushService();
