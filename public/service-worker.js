const CACHE_VERSION = 'sos-sf-public-safety-015-20260805a';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PUBLIC_DATA_CACHE = `${CACHE_VERSION}-public-data`;
const SHELL = ['/', '/lite', '/offline.html', '/manifest.webmanifest', '/icons/icon.svg', '/lite.css', '/essential-contacts.json', '/offline-guidance.json'];
const PUBLIC_API_ALLOWLIST = new Set(['/api/snapshot', '/api/sources', '/api/messages', '/api/essential-contacts']);

function mayStore(response) {
  if (!response.ok) return false;
  const directive = (response.headers.get('Cache-Control') || '').toLowerCase();
  return !directive.includes('private') && !directive.includes('no-store');
}

async function precacheCompleteShell() {
  const cache = await caches.open(STATIC_CACHE);
  await cache.addAll(SHELL);
  const documentResponse = await cache.match('/', { ignoreVary: true });
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
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE && key !== PUBLIC_DATA_CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

function offlineJson(message) {
  return new Response(JSON.stringify({ ok: false, data: { error: { code: 'OFFLINE', message } } }), {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}

async function publicApiNetworkFirst(request) {
  const cache = await caches.open(PUBLIC_DATA_CACHE);
  try {
    const response = await fetch(request);
    if (mayStore(response)) await cache.put(request, response.clone());
    else await cache.delete(request);
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreVary: false });
    return cached || offlineJson('Sin conexión y sin una lectura pública previa guardada.');
  }
}

async function privateApiNetworkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return offlineJson('Las funciones privadas no están disponibles sin conexión.');
  }
}

async function navigationNetworkFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (mayStore(response)) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request, { ignoreVary: true }))
      || (await cache.match('/', { ignoreVary: true }))
      || (await cache.match('/offline.html', { ignoreVary: true }))
      || new Response('Sin conexión. No se puede confirmar la situación ni la ausencia de alertas.', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(PUBLIC_API_ALLOWLIST.has(url.pathname) ? publicApiNetworkFirst(request) : privateApiNetworkOnly(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(navigationNetworkFirst(request));
    return;
  }
  event.respondWith(caches.match(request, { ignoreVary: true }).then(async (cached) => {
    if (cached) return cached;
    const response = await fetch(request);
    if (mayStore(response)) void caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  }));
});
