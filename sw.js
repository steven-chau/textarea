/* Same-origin app shell cache. Never caches note text or third-party content. */
const CACHE = "textarea-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./theme.js",
  "./app.js",
  "./js/store.js",
  "./js/share.js",
  "./js/markdown.js",
  "./favicon.svg",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    (async function () {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(function (key) {
            return key !== CACHE;
          })
          .map(function (key) {
            return caches.delete(key);
          })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async function () {
      try {
        const response = await fetch(request);
        if (response && response.ok && response.type === "basic") {
          try {
            const cache = await caches.open(CACHE);
            await cache.put(request, response.clone());
          } catch (error) {
            /* A full cache must not break the response. */
          }
        }
        return response;
      } catch (error) {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;

        if (request.mode === "navigate") {
          const fallback = await cache.match(
            new URL("./index.html", self.registration.scope).href
          );
          if (fallback) return fallback;
        }

        return Response.error();
      }
    })()
  );
});
