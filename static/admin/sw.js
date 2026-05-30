const CACHE = "wouldkeep-admin-v3";
const ASSETS = [
  "/admin/manifest.json",
  "/admin/icon-192.png",
  "/admin/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  // Only cache same-origin requests for admin
  if (!e.request.url.includes("/admin/")) return;

  // For API calls (GitHub), go network-first
  if (e.request.url.includes("api.github.com")) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // For HTML, always network (never cache — always get latest deploy)
  if (e.request.url.endsWith('.html') || e.request.url.endsWith('/admin/') || e.request.url.endsWith('/admin')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // For other static assets, cache-first
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return resp;
      })
    )
  );
});
