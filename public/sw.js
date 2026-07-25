/**
 * Verity service worker — public/sw.js
 *
 * Plain JS. Service workers are not bundled by Next.js here; this file is
 * served as-is from /public and registered by lib/modes/sw_register.ts.
 *
 * Caching matrix (docs/lanes/lane-d-integrator.md §4):
 *   - Network-first: HTML navigations, /api/**  (fall back to cache only
 *     for navigations — the offline shell. /api/** gets no cache fallback
 *     AND is never written to the cache at all.)
 *   - Cache-first:   same-origin /_next/static/**, /icons/**, favicon, fonts
 *   - PASS-THROUGH:  everything else — non-GET, Range requests, cross-origin,
 *     unrecognised paths. When in doubt this worker does nothing, which is
 *     always the safe failure mode.
 *   - NEVER CACHED:  any request whose URL carries a `mode` search param —
 *     and any *response* that came back from a `mode` URL (e.g. a redirect
 *     from /timeline to /timeline?mode=live). `?mode=live|fixtures|replay`
 *     selects which behaviour renders; a cached response from one mode
 *     replayed under another is a silent, undiagnosable failure at hour 22
 *     of a live demo. The bypass is enforced in three places: on entry to
 *     the fetch handler, before every cache read, and before every cache
 *     write. No cache key in this worker can contain `mode=`.
 *
 * Kill switch: a request URL with `nosw=1`, or a postMessage of shape
 * {type: 'NOSW'}, latches this worker into permanent pass-through mode,
 * purges its caches and unregisters. The latch matters: `unregister()`
 * does not stop *this* worker from controlling already-loaded clients, so
 * without it the worker would keep serving cached assets to the page that
 * just asked it to go away. The registration helper
 * (lib/modes/sw_register.ts) is responsible for the resulting reload.
 */

// Bump this literal (verity-static-v1 -> v2 -> ...) whenever the caching
// strategy changes; `activate` below purges every other verity-static-*
// cache so stale versions never linger on a device.
const CACHE_PREFIX = 'verity-static-';
const CACHE_NAME = 'verity-static-v1';

const STATIC_PATH_PATTERNS = [
  /^\/_next\/static\//,
  /^\/icons\//,
  /^\/favicon\.ico$/,
  /\.(?:woff2?|ttf|otf|eot)$/,
];

/**
 * Latched by the kill switch. Once true this worker never reads from or
 * writes to a cache and never calls respondWith again, for the rest of its
 * lifetime — see the kill-switch note in the header comment.
 */
let bypassAll = false;

/** True if `url` carries a `mode` search param — never cache these. */
function hasModeParam(url) {
  return url.searchParams.has('mode');
}

/**
 * Same check against a raw URL string, for values that are not already
 * parsed (request.url, response.url). Fails *closed*: an unparseable URL is
 * treated as mode-carrying, i.e. not cacheable.
 */
function hrefHasModeParam(href) {
  if (!href) {
    return false;
  }
  try {
    return hasModeParam(new URL(href, self.location.href));
  } catch {
    return true;
  }
}

/** True if `url` requests the kill switch. */
function hasNoSwParam(url) {
  return url.searchParams.get('nosw') === '1';
}

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isStaticAsset(url) {
  return STATIC_PATH_PATTERNS.some((pattern) => pattern.test(url.pathname));
}

/**
 * Whether this request/response pair may be written to the cache.
 * Deliberately strict — every clause is a way the cache could start lying:
 *
 *  - status !== 200: excludes 3xx, 4xx, 5xx and (critically) 206 Partial
 *    Content, which `cache.put` rejects outright with a TypeError.
 *  - opaque/error response types: a cross-origin no-cors body we cannot
 *    inspect, or a network-error placeholder.
 *  - non-GET / Range: `cache.put` rejects both.
 *  - mode param on the request URL, or on the response URL after a redirect:
 *    the mode bypass, enforced at the write boundary as well as on entry.
 *  - redirected at all: the body belongs to a different URL than the cache
 *    key it would be stored under.
 */
function isCacheableResponse(request, response) {
  if (bypassAll) {
    return false;
  }
  if (!response || response.status !== 200) {
    return false;
  }
  if (
    response.type === 'opaque' ||
    response.type === 'opaqueredirect' ||
    response.type === 'error'
  ) {
    return false;
  }
  if (request.method !== 'GET') {
    return false;
  }
  if (request.headers && request.headers.has('range')) {
    return false;
  }
  if (response.redirected) {
    return false;
  }
  if (hrefHasModeParam(request.url) || hrefHasModeParam(response.url)) {
    return false;
  }
  return true;
}

/**
 * Clone-then-store. The clone happens synchronously, before the response is
 * handed back to the page — a body can only be read once, so cloning after
 * the caller has started consuming it would throw. The write itself is
 * handed to waitUntil so the worker is not killed mid-write, and its
 * rejection is swallowed: a failed cache write must never fail the request.
 */
function cacheResponse(event, request, response) {
  if (!isCacheableResponse(request, response)) {
    return;
  }
  const copy = response.clone();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, copy);
    })().catch(() => undefined)
  );
}

/** Cache read with the same mode bypass applied. */
async function matchCache(request) {
  if (bypassAll || hrefHasModeParam(request.url)) {
    return undefined;
  }
  const cache = await caches.open(CACHE_NAME);
  return cache.match(request);
}

async function purgeCaches(keepCurrent) {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter(
        (name) =>
          name.startsWith(CACHE_PREFIX) && !(keepCurrent && name === CACHE_NAME)
      )
      .map((name) => caches.delete(name))
  );
}

/**
 * Kill switch. Latch pass-through first (synchronously, so any fetch event
 * dispatched while the async work below is in flight is already ignored),
 * then drop every cache this worker owns, then unregister.
 */
async function disableServiceWorker() {
  bypassAll = true;
  await purgeCaches(false);
  if (self.registration) {
    await self.registration.unregister();
  }
}

/**
 * Deliberate: skipWaiting + clients.claim. This is a demo appliance, not a
 * long-lived app with open documents to protect — an update must take effect
 * on the first visit after a deploy, not the second. The cost (a controlled
 * page can swap to a new worker mid-session) is acceptable because nothing
 * here caches app JS or HTML beyond the offline shell.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await purgeCaches(true);
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'NOSW') {
    bypassAll = true;
    event.waitUntil(disableServiceWorker());
  }
});

self.addEventListener('fetch', (event) => {
  if (bypassAll) {
    return;
  }

  const request = event.request;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Kill switch: latch, pass through untouched, unregister.
  if (hasNoSwParam(url)) {
    bypassAll = true;
    event.waitUntil(disableServiceWorker());
    return;
  }

  // Never touch the cache for anything mode-scoped, either direction.
  if (hasModeParam(url)) {
    return;
  }

  // cache.put rejects non-GET and Range requests; don't intercept them.
  if (request.method !== 'GET') {
    return;
  }
  if (request.headers && request.headers.has('range')) {
    return;
  }

  // Cross-origin (analytics, CDN fonts) is the browser's business.
  if (url.origin !== self.location.origin) {
    return;
  }

  const isNavigation =
    request.mode === 'navigate' || request.destination === 'document';

  if (isNavigation || isApiRequest(url)) {
    // allowCache=false for /api/**: no fallback read AND no write.
    event.respondWith(networkFirst(event, isNavigation));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event));
  }
});

/**
 * Network-first: try the network, and only for navigations both store the
 * result and fall back to it (the offline shell). /api/** requests that fail
 * simply fail — an API response served from a stale cache is exactly the
 * undiagnosable-failure risk this worker exists to avoid.
 */
async function networkFirst(event, allowCache) {
  const request = event.request;
  try {
    const response = await fetch(request);
    if (allowCache) {
      cacheResponse(event, request, response);
    }
    return response;
  } catch (err) {
    if (allowCache) {
      const cached = await matchCache(request);
      if (cached) {
        return cached;
      }
    }
    throw err;
  }
}

/** Cache-first: serve from cache when present, otherwise fetch and store. */
async function cacheFirst(event) {
  const request = event.request;
  const cached = await matchCache(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  cacheResponse(event, request, response);
  return response;
}
