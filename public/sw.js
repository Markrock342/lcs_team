/* Limit Code Studio — Service Worker (production only) */
const IS_LOCAL =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1";

// บน localhost: ลบตัวเองทันที — ห้าม cache ใน dev
if (IS_LOCAL) {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => self.registration.unregister())
    );
  });
} else {
  const CACHE = "lcs-v2";
  const PRECACHE = ["/manifest.json", "/icon.svg"];

  self.addEventListener("install", (event) => {
    event.waitUntil(
      caches
        .open(CACHE)
        .then((cache) => cache.addAll(PRECACHE))
        .then(() => self.skipWaiting())
    );
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
        )
        .then(() => self.clients.claim())
    );
  });

  self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;
    const url = new URL(event.request.url);

    // อย่า intercept assets ของ Next.js
    if (
      url.pathname.startsWith("/_next/") ||
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/auth/") ||
      event.request.destination === "script" ||
      event.request.destination === "style"
    ) {
      return;
    }

    // เฉพาะ navigation (เปิดหน้าเว็บ) เท่านั้น
    if (event.request.mode !== "navigate") return;

    event.respondWith(
      fetch(event.request).catch(() => caches.match("/dashboard"))
    );
  });

  self.addEventListener("push", (event) => {
    let data = {
      title: "Limit Code",
      body: "มีการแจ้งเตือนใหม่",
      link: "/notifications",
    };
    try {
      if (event.data) data = { ...data, ...event.data.json() };
    } catch {
      // use defaults
    }

    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icon.svg",
        badge: "/icon.svg",
        data: { link: data.link },
        vibrate: [200, 100, 200],
      })
    );
  });

  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const link = event.notification.data?.link || "/notifications";
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.postMessage({ link });
            return client.focus();
          }
        }
        return self.clients.openWindow(link);
      })
    );
  });
}
