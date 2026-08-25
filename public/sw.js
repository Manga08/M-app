const CACHE = "moneva-shell-v5";
const OCR_CACHE = "moneva-ocr-v1";
const STATIC = ["/offline", "/pwa/moneva/icon-192.png", "/pwa/moneva/icon-512.png", "/pwa/moneva/manifest-dark.webmanifest", "/brand-icons.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== OCR_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    return;
  }
  if (url.pathname.startsWith("/ocr/tesseract/7.0.0/")) {
    event.respondWith(caches.open(OCR_CACHE).then((cache) => cache.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    }))));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa/") || url.pathname.startsWith("/moneva-icon-") || url.pathname === "/moneva-maskable-512.png" || url.pathname === "/brand-icons.svg") {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)); return response; })));
  }
});
