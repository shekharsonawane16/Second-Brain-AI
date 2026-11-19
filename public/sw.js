/* TaskFlow service worker — app shell + offline fallback.
   Deliberately never caches Supabase API traffic or auth. */
const VERSION = "taskflow-v5";
const PRECACHE = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, Google, analytics
  if (url.pathname.startsWith("/auth/")) return;

  // Navigations: network first, fall back to an offline page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          return cached || caches.match("/offline.html");
        })
    );
    return;
  }

  // Static assets: cache first, refresh in background.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(css|js|png|jpg|jpeg|svg|webp|woff2?|ico)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});


// -- Web Push ------------------------------------------------
self.addEventListener("push", (event) => {
  let data = { title: "Second Brain AI", body: "You have tasks waiting.", url: "/my-day" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/favicon-32.png",
      tag: data.tag || "taskflow-daily",
      renotify: true,
      data: { url: data.url || "/my-day" },
      vibrate: [90, 40, 90],
      actions: [{ action: "open", title: "Open Second Brain AI" }]
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/my-day";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
