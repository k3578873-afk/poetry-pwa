const CACHE_NAME = 'moja-poeziya-v4';
const APP_ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Missing optional icons should not prevent the new worker from installing.
    await Promise.all(APP_ASSETS.map(async asset => {
      try { const response = await fetch(asset, { cache: 'reload' }); if (response.ok) await cache.put(asset, response); }
      catch (_) { /* keep installation resilient when an asset is temporarily unavailable */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Prefer the current published app; fall back to cached content offline.
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && (request.destination === 'document' || APP_ASSETS.includes(url.pathname.slice(self.location.pathname.lastIndexOf('/') + 1)))) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (_) {
      const cached = await caches.match(request);
      if (cached) return cached;
      throw _;
    }
  })());
});
