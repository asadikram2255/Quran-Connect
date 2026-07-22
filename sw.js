// Service Worker — cache-first for all static data files
//
// Cache version is derived from data/meta/manifest.json's `version` field so it
// invalidates automatically whenever the pipeline rebuilds the data.

// The browser terminates and re-evaluates this worker constantly, but `install`
// fires only once per version — so the cache name must NOT be a plain variable
// assigned during install, or every restart would fall back to a name that
// matches nothing and re-download the whole corpus. Instead it is resolved
// lazily (and memoised per worker lifetime) from three sources, in order:
//   1. manifest.json over the network — authoritative
//   2. an existing quran-data-v* cache — keeps us correct while offline
//   3. FALLBACK_VERSION
const FALLBACK_VERSION = 2;
const CACHE_PREFIX = "quran-data-v";

let _cacheNamePromise = null;

async function resolveCacheName() {
  try {
    const r = await fetch("data/meta/manifest.json", { cache: "no-cache" });
    if (r.ok) {
      const meta = await r.json();
      if (meta && meta.version) return CACHE_PREFIX + meta.version;
    }
  } catch (_) { /* offline — fall through to the cache scan */ }

  try {
    const existing = (await caches.keys()).filter(k => k.startsWith(CACHE_PREFIX));
    if (existing.length) {
      // Highest version wins if several linger from an interrupted activate.
      existing.sort((a, b) =>
        parseInt(b.slice(CACHE_PREFIX.length), 10) - parseInt(a.slice(CACHE_PREFIX.length), 10));
      return existing[0];
    }
  } catch (_) { /* fall through */ }

  return CACHE_PREFIX + FALLBACK_VERSION;
}

function cacheName() {
  if (!_cacheNamePromise) _cacheNamePromise = resolveCacheName();
  return _cacheNamePromise;
}

// Critical files to precache on install so first page load after SW registration is instant
const PRECACHE_URLS = [
  "data/meta/manifest.json",
  "data/meta/shard_maps_bundle.json",
];

// Install: fetch manifest to get data version, then precache essential files
self.addEventListener("install", event => {
  event.waitUntil(
    cacheName()
      .then(name => caches.open(name))
      .then(cache =>
        Promise.all(
          PRECACHE_URLS.map(url =>
            fetch(url, { cache: "no-cache" })
              .then(r => { if (r.ok) return cache.put(new Request(url), r); })
              .catch(() => {})
          )
        )
      )
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

// Activate: delete any old-version caches
self.addEventListener("activate", event => {
  event.waitUntil(
    cacheName()
      .then(name => caches.keys().then(keys =>
        // Matches on "quran-data" rather than CACHE_PREFIX so this also reaps
        // the legacy un-versioned "quran-data-2" cache that older workers wrote
        // into on every restart. Scoped so unrelated caches are left alone.
        Promise.all(keys
          .filter(k => k.startsWith("quran-data") && k !== name)
          .map(k => caches.delete(k)))
      ))
      .catch(() => {})
      .then(() => self.clients.claim())
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
    cacheName().then(name => caches.open(name)).then(async cache => {
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
