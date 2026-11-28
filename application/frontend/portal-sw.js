const CACHE_NAME = 'corpsec-auto-update-v43';
const GUARD_CACHE_PREFIX = 'corpsec-guard-';
const APP_SHELL = [
  '/',
  '/version.json',
  '/manifest.json',
  '/portal-sw.js',
  '/static/css/styles.css?v=20261128_v2',
  '/static/js/app.js?v=20261128_v3',
  '/static/js/silent-updater.js?v=20261128_v2',
  '/static/js/call-center.js?v=20261128_v3',
  '/static/css/call-center.css?v=20261128_v2',
  '/static/js/ai-assistant.js?v=20261128_v3',
  '/static/css/ai-assistant.css?v=20261128_v2',
  '/static/images/corpsec_logo_badge.png',
  '/static/images/corpsec_pwa_192.png',
  '/static/images/corpsec_pwa_512.png',
  '/static/images/favicon.ico'
];

function isPdfRequest(url) {
  const path = url.pathname.toLowerCase();
  return path.endsWith('/pdf') || path.endsWith('.pdf') || path.includes('.pdf');
}

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isGuardPortalRequest(url) {
  return (
    url.pathname === '/portal' ||
    url.pathname === '/portal/' ||
    url.pathname === '/portal.html' ||
    url.pathname === '/portal-manifest.json' ||
    url.pathname === '/guard-sw.js'
  );
}

function isAppShellRequest(url) {
  return (
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/version.json' ||
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
  // Activate immediately without waiting for existing tabs to close
  self.skipWaiting();
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        APP_SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined))
      );
    } catch (e) {}
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME && !key.startsWith(GUARD_CACHE_PREFIX))
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

// Network-First for Admin HTML navigation: Always get latest version from server; fallback to cache only offline
async function networkFirstDocument(request, pathname) {
  const cacheKey = '/';
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (!isUnsafeToCache(response) && isHtmlResponse(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(cacheKey, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(cacheKey);
    if (cached && !isUnsafeToCache(cached)) {
      return cached;
    }
    throw error;
  }
}

// Stale-While-Revalidate / Cache-First for versioned static assets (avoids slow cold starts on mobile)
async function cacheFirstOrRevalidateAsset(request) {
  const url = new URL(request.url);
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached && url.searchParams.has('v')) {
    return cached;
  }
  const networkPromise = fetch(request).then((response) => {
    if (!isUnsafeToCache(response)) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  }).catch(() => null);

  if (cached) return cached;
  const netResp = await networkPromise;
  if (netResp) return netResp;
  throw new Error('Offline asset unavailable');
}

self.addEventListener('message', (event) => {
  if (event.data && (event.data.action === 'SKIP_WAITING' || event.data.action === 'PURGE_ALL_AND_CLAIM')) {
    self.skipWaiting();
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(GUARD_CACHE_PREFIX))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })());
  }
  if (event.data && event.data.action === 'CLEAR_OLD_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && !key.startsWith(GUARD_CACHE_PREFIX))
          .map((k) => caches.delete(k))
      ))
    );
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept Guard Portal routes (owned by /guard-sw.js on scope /portal)
  if (isGuardPortalRequest(url)) return;

  // Never intercept API or PDF payslips — those must always hit the backend
  if (isApiRequest(url) || isPdfRequest(url)) return;

  if (!isAppShellRequest(url)) return;

  const isDocument =
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html';

  if (isDocument) {
    event.respondWith(networkFirstDocument(request, url.pathname));
    return;
  }

  // Cache-first for versioned static files / stale-while-revalidate for unversioned assets
  event.respondWith(cacheFirstOrRevalidateAsset(request));
});
