/* anotherme web push service worker.
 *
 * Best-effort web/PWA push delivery + tap routing. Served as a static file from
 * the Expo web `public/` directory and registered by webPush.web.ts.
 *
 * Contract with the app (see ForegroundNotifier.web.tsx / PushRegistrar.tsx):
 *   - on push:                 postMessage {type:"data-changed"} to refresh lists
 *   - on notificationclick:    focus/open a client and postMessage
 *                              {type:"notification-navigate", url}
 *   - on pushsubscriptionchange: re-subscribe and postMessage
 *                              {type:"push-subscription-changed", subscription}
 *
 * NOTE: real background push (when no tab is open) is only reliable on platforms
 * with a registered, served service worker; the native Android/iOS path (FCM /
 * APNs) is the production-grade solution. This SW is the web fallback.
 */

self.addEventListener("install", () => {
  // Activate immediately so a freshly registered SW controls the page without a
  // reload — important for the very first push subscription.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePush(event) {
  if (!event.data) return {};
  try {
    return event.data.json() || {};
  } catch {
    try {
      return { body: event.data.text() };
    } catch {
      return {};
    }
  }
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clients) {
    client.postMessage(message);
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePush(event);
  const title = payload.title || "anotherme";
  const url = typeof payload.url === "string" ? payload.url : "/";
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const options = {
    body: payload.body || "",
    tag: payload.tag,
    // renotify so a fresh call push re-alerts even if a tag-matched one exists.
    renotify: !!payload.tag,
    data: { url, ...data },
  };
  event.waitUntil(
    (async () => {
      // Wake open tabs so in-app lists/badges refresh alongside the OS banner.
      await broadcast({ type: "data-changed" });
      await self.registration.showNotification(title, options);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = typeof data.url === "string" ? data.url : "/";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an existing tab and route it in-app (no reload / new window).
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          client.postMessage({ type: "notification-navigate", url });
          return;
        }
      }
      // No tab open — open one at the target URL.
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldSub = event.oldSubscription || null;
        const appServerKey =
          (oldSub && oldSub.options && oldSub.options.applicationServerKey) || undefined;
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        });
        await broadcast({
          type: "push-subscription-changed",
          subscription: JSON.stringify(sub),
        });
      } catch {
        // best-effort — the app will re-subscribe on next load via PushRegistrar.
      }
    })(),
  );
});
