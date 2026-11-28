/**
 * CorpSec Guard Mobile Portal Dedicated Service Worker
 *
 * Security & Performance Design:
 * - Scoped strictly to /portal (never conflicts with Admin ERP SW at /).
 * - Pre-caches ONLY Guard Portal app shell & versioned assets (zero Admin/Payroll/AI/CallCenter/Logo downloads).
 * - Cache-First for versioned static assets (?v=...) -> instant mobile launch without repeated downloads.
 * - Stale-While-Revalidate for /portal shell -> fast startup with automatic background freshness.
 * - STRICT NO-CACHE for /api/* (login, logout, attendance, dashboard, leave, payslips) -> zero shared guard data leakage.
 */

const GUARD_SW_VERSION = '20261128_v1';
const GUARD_SHELL_CACHE = `corpsec-guard-shell-${GUARD_SW_VERSION}`;

const GUARD_APP_SHELL = [
  '/portal',
  '/portal-manifest.json',
  `/static/css/portal.css?v=${GUARD_SW_VERSION}`,
  `/static/js/portal.js?v=${GUARD_SW_VERSION}`,
];

const GUARD_STATIC_ASSETS = [
  '/static/css/portal.css',
  '/static/js/portal.js',
  '/portal-manifest.json',
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
});

async function cacheFirstVersionedAsset(request) {
  const cache = await caches.open(GUARD_SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const networkResp = await fetch(request);
  if (networkResp && networkResp.ok && networkResp.type === 'basic') {
    await cache.put(request, networkResp.clone());
  }
  return networkResp;
}

async function staleWhileRevalidateShell(request) {
  const cache = await caches.open(GUARD_SHELL_CACHE);
  const url = new URL(request.url);
  const cacheKey = url.pathname === '/portal.html' ? '/portal' : url.pathname;
  const cached = await cache.match(cacheKey);

  const networkFetch = fetch(request)
    .then((networkResp) => {
      if (networkResp && networkResp.ok && networkResp.type === 'basic') {
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
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Guard Portal Offline</title><style>body{font-family:system-ui,sans-serif;background:#EBF1F7;color:#0F172A;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}.card{background:#fff;border-radius:18px;padding:24px;max-width:360px;text-align:center;box-shadow:0 8px 24px rgba(15,23,42,.08)}button{margin-top:14px;background:#7C3AED;color:#fff;border:0;border-radius:9999px;padding:12px 20px;font-weight:700;font-size:15px}</style></head><body><div class="card"><h2>You Are Offline</h2><p>Unable to connect to CorpSec servers. Check your mobile data or Wi-Fi connection and try again.</p><button onclick="location.reload()">Retry Connection</button></div></body></html>',
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

  // SECURITY: Never cache authenticated API calls, tokens, attendance, or user data
  if (url.pathname.startsWith('/api/')) return;

  // Serve versioned Guard Portal assets cache-first for fast repeated startup
  if (GUARD_STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirstVersionedAsset(event.request));
    return;
  }

  // Serve Guard Portal shell stale-while-revalidate for instant launch
  if (url.pathname === '/portal' || url.pathname === '/portal.html') {
    event.respondWith(staleWhileRevalidateShell(event.request));
  }
});
