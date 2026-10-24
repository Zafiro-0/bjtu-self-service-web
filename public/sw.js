const cacheName = "bjtu-self-service-v2";
const shell = ["/", "/manifest.webmanifest", "/icon-192.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== cacheName).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) caches.open(cacheName).then(cache => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request).then(response => response || caches.match("/"))));
});
