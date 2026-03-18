/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

// Workbox precaching (injected by vite-plugin-pwa)
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// --- Offline Fallback ---

const OFFLINE_URL = "/offline.html";

// Cache the offline page on install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("offline-v1").then((cache) => cache.add(OFFLINE_URL)),
  );
});

// Serve offline page for failed navigation requests
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open("offline-v1");
      const cached = await cache.match(OFFLINE_URL);
      return cached || new Response("Offline", { status: 503 });
    }),
  );
});

// --- Push Notifications ---

self.addEventListener("push", (event) => {
  let data = { title: "Notification", body: "", data: {} as Record<string, string> };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      tag: data.data?.conversationId || "default",
      data: data.data ?? {},
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = (event.notification.data?.url as string) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (new URL(client.url).pathname === url && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});

self.addEventListener("pushsubscriptionchange", ((event: Event) => {
  const pushEvent = event as ExtendableEvent & {
    oldSubscription?: PushSubscription;
  };

  pushEvent.waitUntil(
    (async () => {
      const oldSubscription = pushEvent.oldSubscription;
      if (!oldSubscription?.options) return;

      const newSubscription =
        await self.registration.pushManager.subscribe(oldSubscription.options);

      await fetch("/rpc/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: newSubscription.endpoint,
          keys: {
            p256dh: btoa(
              String.fromCharCode(
                ...new Uint8Array(newSubscription.getKey("p256dh")!),
              ),
            ),
            auth: btoa(
              String.fromCharCode(
                ...new Uint8Array(newSubscription.getKey("auth")!),
              ),
            ),
          },
        }),
      });
    })(),
  );
}) as EventListener);
