const CACHE_NAME = 'corpsec-guard-portal-v4';
const APP_SHELL = [
  '/portal',
  '/manifest.json',
  '/portal-sw.js',
  '/static/css/portal.css',
  '/static/js/portal.js',
  '/static/images/corpsec_logo_badge.png',
  '/static/images/corpsec_pwa_192.png',
  '/static/images/corpsec_pwa_512.png',
  '/static/images/corpsec_logo_full.jpg',
  '/static/images/favicon.ico'
];

function isPdfRequest(url) {
  const path = url.pathname.toLowerCase();
  return path.endsWith('/pdf') || path.endsWith('.pdf') || path.includes('.pdf');
}

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isAppShellRequest(url) {
  return (
    url.pathname === '/portal' ||
    url.pathname === '/portal/' ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/portal-sw.js' ||
    url.pathname.startsWith('/static/')
  );
}

function isUnsafeToCache(response) {
  if (!response || !response.ok) return true;
  const type = (response.headers.get('content-type') || '').toLowerCase();
  const disposition = (response.headers.get('content-disposition') || '').toLowerCase();
  return (
    type.includes('application/pdf') ||
    type.includes('application/octet-stream') ||
    disposition.includes('attachment')
  );
}

function isHtmlResponse(response) {
  const type = (response.headers.get('content-type') || '').toLowerCase();
  return type.includes('text/html');
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(
      APP_SHELL.map((url) => cache.add(url).catch(() => undefined))
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

async function networkFirstPortal(request) {
  try {
    const response = await fetch(request);
    if (!isUnsafeToCache(response) && isHtmlResponse(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put('/portal', response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match('/portal');
    if (cached && !isUnsafeToCache(cached) && isHtmlResponse(cached)) {
      return cached;
    }
    throw error;
  }
}

async function cacheFirstShell(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached && !isUnsafeToCache(cached)) {
    return cached;
  }

  const response = await fetch(request);
  if (!isUnsafeToCache(response)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstShell(request) {
  try {
    const response = await fetch(request);
    if (!isUnsafeToCache(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached && !isUnsafeToCache(cached)) {
      return cached;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept payslips/API — those must not be treated as the PWA document.
  if (isApiRequest(url) || isPdfRequest(url)) return;

  if (!isAppShellRequest(url)) return;

  const isPortalDocument =
    request.mode === 'navigate' ||
    url.pathname === '/portal' ||
    url.pathname === '/portal/';

  if (isPortalDocument) {
    event.respondWith(networkFirstPortal(request));
    return;
  }

  const isLiveAsset =
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/portal-sw.js';

  if (isLiveAsset) {
    event.respondWith(networkFirstShell(request));
    return;
  }

  event.respondWith(cacheFirstShell(request));
});
