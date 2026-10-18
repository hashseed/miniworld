// Service worker (spec milestone 1, section 10.9). Content-hashed files are
// served cache-first and kept; the manifest and the page are network-first
// with the cached copy as offline fallback. Data chunks are evicted least
// recently used when the cache exceeds its budget; the app shell, the
// language indexes and the history lens grids are never evicted.

const CACHE = 'miniworld-v1';
const META = '/__miniworld-cache-meta';
const MOBILE = /Mobi|Android/i.test(self.navigator.userAgent);
const BUDGET = (MOBILE ? 100 : 200) * 1024 * 1024;
const HASHED = /\.[0-9a-f]{16}\.|\/assets\/.+-[A-Za-z0-9_-]{8,}\./;

/** url → { bytes, used }, persisted in the cache itself. */
let meta;
let dirty = 0;

async function loadMeta(cache) {
  if (meta) return meta;
  const res = await cache.match(META);
  meta = res ? await res.json() : {};
  return meta;
}

async function saveMeta(cache) {
  dirty = 0;
  await cache.put(
    META,
    new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }),
  );
}

async function protectedUrls(cache) {
  // The indexes named by the cached manifest are part of the shell.
  const keep = new Set();
  const res = await cache.match(new URL('data/manifest.json', self.registration.scope).href);
  if (res) {
    try {
      const m = await res.json();
      for (const file of Object.values(m.index ?? {}))
        keep.add(new URL(`data/${file}`, self.registration.scope).href);
      if (m.lens?.file) keep.add(new URL(`data/${m.lens.file}`, self.registration.scope).href);
    } catch {
      // A broken manifest copy only means nothing extra is protected.
    }
  }
  return keep;
}

async function evict(cache) {
  const m = await loadMeta(cache);
  let total = 0;
  for (const v of Object.values(m)) total += v.bytes;
  if (total <= BUDGET) return;
  const keep = await protectedUrls(cache);
  const candidates = Object.entries(m)
    .filter(([url]) => url.includes('/data/') && !keep.has(url))
    .sort((a, b) => a[1].used - b[1].used);
  for (const [url, v] of candidates) {
    if (total <= BUDGET * 0.9) break;
    await cache.delete(url);
    delete m[url];
    total -= v.bytes;
  }
  await saveMeta(cache);
}

async function touch(cache, url, bytes) {
  const m = await loadMeta(cache);
  const entry = m[url] ?? { bytes: bytes ?? 0, used: 0 };
  if (bytes !== undefined) entry.bytes = bytes;
  // Only an ordering is needed; a counter avoids wall-clock time.
  entry.used = (m.__clock?.used ?? 0) + 1;
  m.__clock = { bytes: 0, used: entry.used };
  m[url] = entry;
  if (++dirty > 20) await saveMeta(cache);
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) {
    void touch(cache, request.url);
    return hit;
  }
  const res = await fetch(request);
  if (res.ok) {
    const copy = res.clone();
    const body = await copy.arrayBuffer();
    await cache.put(request, new Response(body, { headers: res.headers, status: res.status }));
    await touch(cache, request.url, body.byteLength);
    void evict(cache);
  }
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(HASHED.test(url.pathname) ? cacheFirst(req) : networkFirst(req));
});
