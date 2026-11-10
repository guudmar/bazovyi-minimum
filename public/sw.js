// Offline shell. The demo keeps its data on the device, so once the files of the app are cached
// it opens and works without a connection. The page comes from the network when there is one (so updates arrive)
// and from the cache when there is none; hashed assets never change and are served from the cache.
const VERSION = 'bm-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

// the page tells the worker which files it has just loaded, so the first visit is enough to work offline later
self.addEventListener('message', (event) => {
  const urls = event.data && event.data.cache;
  if (!Array.isArray(urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(urls.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res.ok) await cache.put(url, res);
      } catch { /* offline right now: nothing to add */ }
    }));
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(VERSION);
        await cache.put('./', res.clone());
        return res;
      } catch {
        return (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(VERSION);
      await cache.put(req, res.clone());
    }
    return res;
  })());
});
