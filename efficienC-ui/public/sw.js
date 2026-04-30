// EfficienC Service Worker — handles system notifications

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Receive notification request from the page
self.addEventListener("message", (event) => {
  if (event.data?.type !== "SHOW_NOTIFICATION") return;

  const { title, body } = event.data;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon.png",
      badge: "/icon.png",
      vibrate: [400, 200, 400],
      requireInteraction: true,
      tag: "efficienc-reminder",
      renotify: true,
      timestamp: Date.now(),
      silent: false,
    })
  );
});

// Clicking the notification focuses the app tab
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/");
    })
  );
});
