import { queryClient as qc } from "@/integrations/tanstack-query/root-provider";
import { api, call } from "@/lib/api";

/**
 * Web Push for this browser (VAPID, no Firebase), as in task-uncle. Once
 * subscribed, the API's scheduler sends reminders even when the app is
 * closed; the service worker (`public/push-sw.js`) draws them. Subscribe
 * from a click, re-register on every logged-in load (a new login is a new
 * session), forget on logout.
 */

export const PUSH_KEY = ["push-config"] as const;
export type PushConfig = { publicKey: string | null; devices: number };

export type PushState =
  /** This browser can't do push (old browser, iPhone outside the installed
   * app, plain http, or no service worker, e.g. the dev server). */
  | "unsupported"
  /** The server has no VAPID keys. */
  | "unconfigured"
  | "blocked"
  | "off"
  | "on";

export const pushSupported = () =>
  typeof window !== "undefined" &&
  window.isSecureContext &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const config = () =>
  qc.fetchQuery({
    queryKey: PUSH_KEY,
    queryFn: (): Promise<PushConfig> => call(api.push.config.get()),
    staleTime: 60_000,
  });

/** The service worker, if one is (or gets) registered within a few seconds. */
async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 5_000)),
  ]);
}

const b64ToBytes = (b64: string) => {
  const s = atob(
    (b64 + "=".repeat((4 - (b64.length % 4)) % 4))
      .replace(/-/g, "+")
      .replace(/_/g, "/"),
  );
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

const sameKey = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const [reg, cfg] = await Promise.all([
    registration(),
    config().catch(() => null),
  ]);
  if (!reg) return "unsupported";
  if (cfg && !cfg.publicKey) return "unconfigured";
  const sub = await reg.pushManager.getSubscription();
  return Notification.permission === "granted" && sub ? "on" : "off";
}

/** Subscribes this browser and registers it with the API. Permission must
 * already be granted (ask from a click first). */
async function subscribe(): Promise<PushState> {
  const reg = await registration();
  if (!reg) return "unsupported";
  const { publicKey } = await config();
  if (!publicKey) return "unconfigured";
  const key = b64ToBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // Keys changed on the server: the old subscription can't be used.
  const current = sub?.options.applicationServerKey;
  if (sub && current && !sameKey(new Uint8Array(current), key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });
  const json = sub.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  const res = await call(
    api.push.devices.post({ endpoint: json.endpoint, keys: json.keys }),
  );
  qc.setQueryData<PushConfig>(PUSH_KEY, { publicKey, devices: res.devices });
  return "on";
}

/** From a click: asks for permission, then subscribes. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const perm =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (perm === "denied") return "blocked";
  if (perm !== "granted") return "off";
  return subscribe();
}

/** Turns push off for this browser (the inbox still fills). */
export async function disablePush() {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (!sub) return;
  await call(api.push.devices.remove.post({ endpoint: sub.endpoint })).catch(
    () => {},
  );
  await sub.unsubscribe();
  await qc.invalidateQueries({ queryKey: PUSH_KEY });
}

let syncedFor: number | null = null;

/** On every logged-in load. Never prompts: a browser that already allows
 * notifications is (re)registered to this session. */
export async function syncPush(userId: number) {
  if (syncedFor === userId || !pushSupported()) return;
  if (Notification.permission !== "granted") return;
  syncedFor = userId;
  try {
    await subscribe();
  } catch (err) {
    syncedFor = null;
    console.warn("[Push] sync failed:", err);
  }
}

/** Logout: this browser stops receiving the account's reminders (the API
 * also drops it with the session). */
export async function resetPush() {
  syncedFor = null;
  try {
    // Never wait for a worker here: logout must be instant.
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch {}
}
