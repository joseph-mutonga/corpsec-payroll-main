/**
 * CorpSec Guard Mobile Portal Dedicated Service Worker
 *
 * - Scoped strictly to /portal (never conflicts with Admin ERP SW at /).
 * - Pre-caches ONLY Guard Portal shell, versioned assets, and splash/app icons.
 * - Static assets: Cache-First for versioned (?v=...) assets.
 * - Shell navigation (/portal): Stale-While-Revalidate + offline fallback page.
 * - API security: Strict bypass for /api/* (never caches auth/OTP/payroll/personal data).
 */

const GUARD_SW_VERSION = '__ASSET_VERSION__';
const GUARD_SHELL_CACHE = `corpsec-guard-shell-${GUARD_SW_VERSION}`;

const GUARD_APP_SHELL = [
  '/portal',
  '/portal-manifest.json',
  `/static/css/portal.css?v=${GUARD_SW_VERSION}`,
  `/static/js/portal.js?v=${GUARD_SW_VERSION}`,
  `/static/images/guard_pwa_192.png?v=${GUARD_SW_VERSION}`,
  `/static/images/guard_apple_touch_icon.png?v=${GUARD_SW_VERSION}`,
];

const GUARD_STATIC_ASSETS = [
  '/static/css/portal.css',
  '/static/js/portal.js',
  '/portal-manifest.json',
  '/static/images/guard_pwa_192.png',
  '/static/images/guard_pwa_512.png',
  '/static/images/guard_pwa_192_maskable.png',
  '/static/images/guard_pwa_512_maskable.png',
  '/static/images/guard_apple_touch_icon.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(GUARD_SHELL_CACHE).then(async (cache) => {
      await Promise.allSettled(
        GUARD_APP_SHELL.map((url) =>
          fetch(url, { cache: 'reload' }).then((res) => {
            if (res && res.ok) {
              return cache.put(url, res);
            }
          }).catch(() => {})
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('corpsec-guard-') && key !== GUARD_SHELL_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
      const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      clients.forEach((client) => {
        client.postMessage({ type: 'GUARD_SW_UPDATED', version: GUARD_SW_VERSION });
      });
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.action === 'TRIGGER_OUTBOX_SYNC') {
    event.waitUntil(notifyGuardClientsToFlushOutbox());
  }
});

/**
 * Background Sync relay ('corpsec-guard-outbox-sync'):
 * Note: Because JWT auth tokens are never stored inside the Service Worker or CacheStorage,
 * Background Sync wakes/notifies any open Guard Portal window client to flush its per-guard
 * IndexedDB outbox. If the app was closed (or on iOS Safari where Background Sync is unsupported),
 * queued items sync automatically as soon as the guard opens the app or reconnects while it is open.
 */
async function notifyGuardClientsToFlushOutbox() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  clients.forEach((client) => {
    client.postMessage({
      type: 'GUARD_SW_TRIGGER_SYNC',
      tag: 'corpsec-guard-outbox-sync',
    });
  });
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'corpsec-guard-outbox-sync') {
    event.waitUntil(notifyGuardClientsToFlushOutbox());
  }
});

function isUnsafeToCache(response) {
  if (!response || !response.ok || response.type !== 'basic') return true;
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

function isPdfRequest(url) {
  const path = url.pathname.toLowerCase();
  return path.endsWith('/pdf') || path.endsWith('.pdf') || path.includes('.pdf');
}

async function cacheFirstStaticAsset(request) {
  const cache = await caches.open(GUARD_SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const networkResp = await fetch(request);
  if (!isUnsafeToCache(networkResp)) {
    await cache.put(request, networkResp.clone());
  }
  return networkResp;
}

async function staleWhileRevalidateShell(request) {
  const cache = await caches.open(GUARD_SHELL_CACHE);
  const url = new URL(request.url);
  const cacheKey = url.pathname === '/portal.html' ? '/portal' : url.pathname;
  const cached = await cache.match(cacheKey);

  const networkFetch = fetch(request, { cache: 'no-cache' })
    .then((networkResp) => {
      if (!isUnsafeToCache(networkResp) && isHtmlResponse(networkResp)) {
        cache.put(cacheKey, networkResp.clone()).catch(() => {});
      }
      return networkResp;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const networkResp = await networkFetch;
  if (networkResp) {
    return networkResp;
  }

  return new Response(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#000000"><title>Guard Portal Offline</title><style>body{font-family:system-ui,sans-serif;background:#000000;color:#F8FAFC;display:flex;align-items:center;justify-content:center;min-height:100dvh;margin:0;padding:16px}.card{background:#0F172A;border:1px solid #1E293B;border-radius:18px;padding:24px;max-width:360px;text-align:center}button{margin-top:14px;background:#F67426;color:#fff;border:0;border-radius:9999px;padding:12px 20px;min-height:44px;font-weight:700;font-size:16px;width:100%}</style></head><body><div class="card"><h2>You Are Offline</h2><p>Unable to reach CorpSec servers. Check your mobile data or Wi-Fi connection and retry.</p><button onclick="location.reload()">Retry Connection</button></div></body></html>',
    {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // SECURITY: Never cache auth, OTP, payroll, attendance, PDFs, or personal API data
  if (url.pathname.startsWith('/api/') || isPdfRequest(url)) return;

  if (GUARD_STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirstStaticAsset(event.request));
    return;
  }

  if (url.pathname === '/portal' || url.pathname === '/portal.html') {
    event.respondWith(staleWhileRevalidateShell(event.request));
  }
});
