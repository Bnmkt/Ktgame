importScripts("resource-cache-policy.js");
const CACHE = "ktga-offline-v2";
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
  if (request.method === "GET" && request.mode !== "navigate" && ktgaResourcePolicy.allowed(request.url, self.location.origin)) {
    event.respondWith((async () => {
      const cache = await caches.open(ktgaResourcePolicy.CACHE).catch(() => null);
      const hit = await cache?.match(request.url, { ignoreSearch:true });
      if (hit) return hit;
      return fetch(request);
    })());
    return;
  }
  // Only document failures use a static fallback; accounts, APIs and game traffic never enter this cache.
  if (request.method !== "GET" || request.mode !== "navigate" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).catch(async () => (await caches.match(offline)) || Response.error()));
});
