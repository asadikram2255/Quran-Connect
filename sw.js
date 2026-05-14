// Service Worker — cache-first for all static data files
// Bump SW_VERSION whenever data files change to invalidate the cache.
const SW_VERSION = "1";
const CACHE_NAME = `quran-data-${SW_VERSION}`;

// Install: no pre-caching needed — files are cached on first access
self.addEventListener("install", () => self.skipWaiting());

// Activate: delete any old-version caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for data/ JSON files, network-pass-through for everything else
self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Only intercept same-origin requests that touch the data directory
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.includes("/data/")) return;
  // Only cache JSON files (not HTML, CSS, JS which have their own versioning)
  if (!url.pathname.endsWith(".json") && !url.pathname.includes(".json?")) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      // Strip query strings for cache key consistency
      const cacheKey = new Request(url.origin + url.pathname);
      const cached = await cache.match(cacheKey);
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok) {
        cache.put(cacheKey, response.clone());
      }
      return response;
    }).catch(() => fetch(request))
  );
});
