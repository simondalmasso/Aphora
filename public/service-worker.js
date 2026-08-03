const CACHE_VERSION = 'sos-sf-v1-20260802b';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const SHELL = ['/', '/lite', '/offline.html', '/manifest.webmanifest', '/icons/icon.svg', '/lite.css'];

async function precacheCompleteShell() {
  const cache = await caches.open(STATIC_CACHE);
  await cache.addAll(SHELL);
  const documentResponse = await cache.match('/');
  if (!documentResponse) throw new Error('SHELL_DOCUMENT_MISSING');
  const html = await documentResponse.text();
  const buildAssets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map((match) => match[1]);
  if (buildAssets.length === 0) throw new Error('SHELL_BUILD_ASSETS_MISSING');
  await cache.addAll([...new Set(buildAssets)]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheCompleteShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await caches.match(fallback));
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, DATA_CACHE, '/offline.html'));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, STATIC_CACHE, '/offline.html'));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  })));
});
