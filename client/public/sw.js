const CACHE = "ktga-offline-v1";
const offline = new URL("offline.html", self.registration.scope).href;
const resources = [offline, "pwa/icon-180.png", "pwa/icon-192.png", "pwa/icon-512.png", "pwa/icon-maskable-512.png"]
  .map((path) => new URL(path, self.registration.scope).href);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(resources)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("ktga-offline-") && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Only document failures use a static fallback; accounts, APIs and game traffic never enter this cache.
  if (request.method !== "GET" || request.mode !== "navigate" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).catch(async () => (await caches.match(offline)) || Response.error()));
});
