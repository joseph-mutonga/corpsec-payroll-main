const CACHE_NAME = 'corpsec-auto-update-v38';
const APP_SHELL = [
  '/',
  '/portal',
  '/version.json',
  '/manifest.json',
  '/portal-sw.js',
  '/static/css/styles.css',
  '/static/js/app.js',
  '/static/css/portal.css',
  '/static/js/portal.js',
  '/static/js/silent-updater.js',
  '/static/js/call-center.js',
  '/static/css/call-center.css',
  '/static/js/ai-assistant.js',
  '/static/css/ai-assistant.css',
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
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/portal' ||
    url.pathname === '/portal/' ||
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
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

// Network-First for HTML navigation: Always get latest version from server; fallback to cache only offline
async function networkFirstDocument(request, pathname) {
  const cacheKey = pathname.startsWith('/portal') ? '/portal' : '/';
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

// Network-First for JS, CSS, and static assets: Always fetch newest bundle from server
async function networkFirstAsset(request) {
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (!isUnsafeToCache(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached && !isUnsafeToCache(cached)) {
      return cached;
    }
    throw error;
  }
}

self.addEventListener('message', (event) => {
  if (event.data && (event.data.action === 'SKIP_WAITING' || event.data.action === 'PURGE_ALL_AND_CLAIM')) {
    self.skipWaiting();
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })());
  }
  if (event.data && event.data.action === 'CLEAR_OLD_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((k) => caches.delete(k))
      ))
    );
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API or PDF payslips — those must always hit the backend
  if (isApiRequest(url) || isPdfRequest(url)) return;

  if (!isAppShellRequest(url)) return;

  const isDocument =
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/portal' ||
    url.pathname === '/portal/';

  if (isDocument) {
    event.respondWith(networkFirstDocument(request, url.pathname));
    return;
  }

  // Network-first for all scripts, CSS, and static files
  event.respondWith(networkFirstAsset(request));
});
