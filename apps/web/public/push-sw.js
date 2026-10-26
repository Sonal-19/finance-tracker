/* Web Push for reminders, loaded into the generated service worker with
 * workbox `importScripts` (vite.config.ts). The API sends data only
 * ({ title, body, tag, url }); this draws it, as in task-uncle's sw.ts. */

const windows = () =>
  self.clients.matchAll({ type: "window", includeUncontrolled: true });

self.addEventListener("push", (event) => {
  let p = null;
  try {
    p = event.data ? event.data.json() : null;
  } catch {
    return;
  }
  if (!p || !p.title) return;
  event.waitUntil(
    (async () => {
      // Open tabs refresh their bell.
      for (const c of await windows()) c.postMessage({ type: "push-received" });
      await self.registration.showNotification(p.title, {
        body: p.body,
        tag: p.tag,
        icon: "/pwa-192.png",
        badge: "/pwa-192.png",
        renotify: true,
        data: { url: typeof p.url === "string" ? p.url : "/reminders" },
      });
    })(),
  );
});

/** A tap opens the app on the page the reminder is about. */
self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  const raw = (n.data && n.data.url) || "/reminders";
  // Same-origin paths only.
  const url = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/reminders";
  n.close();
  event.waitUntil(
    (async () => {
      const win = (await windows())[0];
      if (win) {
        await win.focus();
        await win.navigate(url).catch(() => {});
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
