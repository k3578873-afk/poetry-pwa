const APP_SCOPE = self.registration ? self.registration.scope : self.location.origin + '/';
const APP_BASE = new URL(APP_SCOPE).pathname.replace(/\/$/, '') || '/';
const APP_SHELL = ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'offline.html'];
const CACHE_NAME = 'poetry-pwa-v8';

const assetUrl = (path) => new URL(path, APP_SCOPE).toString();
const isSameApp = (url) => {
  try {
    const requestUrl = new URL(url);
    return requestUrl.origin === self.location.origin && requestUrl.pathname.startsWith(APP_BASE);
  } catch {
    return false;
  }
};

const isAppShellAsset = (url) => {
  try {
    const requestUrl = new URL(url);
    const normalized = requestUrl.pathname.replace(/\/$/, '');
    return APP_SHELL.some(asset => {
      const assetPath = new URL(asset, APP_SCOPE).pathname.replace(/\/$/, '');
      return normalized === assetPath;
    });
  } catch {
    return false;
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const asset of APP_SHELL) {
      try {
        const response = await fetch(assetUrl(asset), { cache: 'reload' });
        if (response.ok) {
          await cache.put(assetUrl(asset), response.clone());
        }
      } catch (_) {
        // Keep install resilient if a resource is temporarily unavailable.
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!request || request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(assetUrl('index.html'), response.clone());
        }
        return response;
      } catch (_) {
        const cachedPage = await caches.match(assetUrl('index.html'));
        if (cachedPage) return cachedPage;

        const offlinePage = await caches.match(assetUrl('offline.html'));
        if (offlinePage) return offlinePage;

        return new Response('Offline', {
          status: 503,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        });
      }
    })());
    return;
  }

  if (isAppShellAsset(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      try {
        const response = await fetch(request, { cache: 'reload' });
        if (response && response.ok) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        if (cached) return cached;
        const offlinePage = await caches.match(assetUrl('offline.html'));
        if (offlinePage) return offlinePage;
        return new Response('Offline', {
          status: 503,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        });
      }
    })());
    return;
  }

  if (isSameApp(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response && response.ok) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        if (cached) return cached;
        throw _;
      }
    })());
  }
});
