const CACHE = "mali-receipt-v2";
const ASSETS = ["./","./index.html","./style.css","./app.js","./products.json","./manifest.json","./icon-192.png","./icon-512.png","https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"];

self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));

async function networkFirst(request, fallback) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (fallback && await cache.match(fallback)) || Response.error();
  }
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate") event.respondWith(networkFirst(event.request, "./index.html"));
  else if (url.pathname.endsWith("/products.json")) event.respondWith(networkFirst(event.request));
  else event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok || response.type === "opaque") caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  })));
});
