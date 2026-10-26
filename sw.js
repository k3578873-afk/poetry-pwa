const CACHE_NAME = 'poetry-pwa-v7';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html'
];

const isAppAsset = (url) => {
  const pathname = url.pathname.replace(/\/+$/, '');
  return APP_SHELL.some(asset => {
    const assetPath = asset.replace(/\/+$/, '');
    return pathname === assetPath || pathname.endsWith(assetPath);
  });
};

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    for (const asset of APP_SHELL) {
      try {
        const response = await fetch(asset, { cache: 'reload' });
        if (response.ok) {
          await cache.put(asset, response.clone());
        }
      } catch (_) {
        // keep install resilient if a resource is temporarily unavailable
      }
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests: try the network first, fallback to cache/offline page.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/index.html', response.clone());
        }
        return response;
      } catch (_) {
        const cached = await caches.match('/index.html');
        if (cached) return cached;

        const offline = await caches.match('/offline.html');
        if (offline) return offline;

        return new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // App shell/static assets: cache-first with network refresh.
  if (isAppAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      try {
        const response = await fetch(request, { cache: 'reload' });
        if (response.ok) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        if (cached) return cached;
        return new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
  }
});
