/**
 * ============================================================================
 * CorpSec Enterprise - Automatic Silent Background Update Engine
 * ============================================================================
 * Automatically detects new published releases, downloads updated bundles
 * silently in the background, updates service workers and CacheStorage,
 * and seamlessly installs the latest version without requiring end users
 * to manually re-download or reinstall desktop launchers or apps.
 * ============================================================================
 */

(function (window, document) {
  'use strict';

  const STORAGE_KEY_RELEASE_ID = 'corpsec_installed_release_id';
  const STORAGE_KEY_VERSION = 'corpsec_installed_version';
  const STORAGE_KEY_LAST_CHECK = 'corpsec_last_update_check';
  const STORAGE_KEY_UPDATE_PENDING = 'corpsec_pending_update_reload';

  const CHECK_INTERVAL_MS = 45000; // Poll server every 45 seconds
  const VERSION_ENDPOINT = '/api/v1/desktop/version';

  let isUpdating = false;
  let updatePollTimer = null;
  let pendingReloadTimeout = null;

  /**
   * Safe fetch with cache-busting to bypass aggressive browser caching.
   */
  async function fetchVersionManifest() {
    const url = `${VERSION_ENDPOINT}?_cb=${Date.now()}`;
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} checking version`);
    }
    return await res.json();
  }

  /**
   * Pre-fetches an asset in the background using cache: 'reload'
   * and optionally puts it into CacheStorage.
   */
  async function prefetchAsset(assetUrl, releaseId) {
    try {
      const cacheBustedUrl = `${assetUrl}${assetUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(releaseId)}`;
      const res = await fetch(cacheBustedUrl, { cache: 'reload' });
      if (res.ok && 'caches' in window) {
        try {
          const cache = await caches.open(`corpsec-shell-${releaseId}`);
          await cache.put(cacheBustedUrl, res.clone());
        } catch (e) {
          // Cache storage error non-fatal
        }
      }
    } catch (err) {
      console.warn(`[SilentUpdater] Could not pre-fetch ${assetUrl}:`, err);
    }
  }

  /**
   * Triggers an update check on registered service workers.
   */
  async function updateServiceWorkers() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.update().catch(() => {});
        if (reg.waiting) {
          reg.waiting.postMessage({ action: 'SKIP_WAITING' });
        }
        if (reg.installing) {
          reg.installing.postMessage({ action: 'SKIP_WAITING' });
        }
      }
    } catch (err) {
      console.warn('[SilentUpdater] ServiceWorker update error:', err);
    }
  }

  /**
   * Removes stale caches belonging to previous releases.
   */
  async function pruneOldCaches(currentReleaseId) {
    if (!('caches' in window)) return;
    try {
      const keys = await caches.keys();
      for (const key of keys) {
        if (key.startsWith('corpsec-') && !key.includes(currentReleaseId)) {
          await caches.delete(key).catch(() => {});
        }
      }
    } catch (e) {}
  }

  /**
   * Determines whether the user is actively working (typing in form or active modal).
   */
  function isUserActivelyEngaged() {
    const activeEl = document.activeElement;
    if (activeEl) {
      const tag = activeEl.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || activeEl.isContentEditable) {
        // User has focus inside an input field
        return true;
      }
    }
    // Check if an interactive modal is currently open
    const openModals = document.querySelectorAll('.modal-overlay[style*="display: flex"], .modal-overlay[style*="display: block"]');
    if (openModals.length > 0) {
      return true;
    }
    return false;
  }

  /**
   * Renders a discreet, sleek floating notification showing the update status.
   */
  function showUpdateNotification(version, releaseId, autoReload = true) {
    let banner = document.getElementById('corpsec-silent-update-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'corpsec-silent-update-banner';
      banner.style.position = 'fixed';
      banner.style.bottom = '20px';
      banner.style.right = '20px';
      banner.style.zIndex = '999999';
      banner.style.background = 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)';
      banner.style.color = '#FFFFFF';
      banner.style.padding = '12px 18px';
      banner.style.borderRadius = '12px';
      banner.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)';
      banner.style.display = 'flex';
      banner.style.alignItems = 'center';
      banner.style.gap = '14px';
      banner.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      banner.style.fontSize = '13px';
      banner.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
      banner.style.transform = 'translateY(100px)';
      banner.style.opacity = '0';
      document.body.appendChild(banner);
    }

    banner.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:32px; height:32px; border-radius:8px; background:rgba(16, 185, 129, 0.15); color:#10B981; display:flex; align-items:center; justify-content:center; font-size:16px;">
          ✨
        </div>
        <div>
          <div style="font-weight:700; color:#FFFFFF; display:flex; align-items:center; gap:6px;">
            <span>CorpSec Updated Silently</span>
            <span style="background:#10B981; color:#064E3B; font-size:10px; font-weight:800; padding:1px 6px; border-radius:4px;">v${escapeText(version)}</span>
          </div>
          <div style="font-size:11px; color:#94A3B8; margin-top:2px;">
            New features and fixes are ready. Seamlessly applying...
          </div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button id="corpsec-btn-apply-update" style="background:#2563EB; hover:background:#1D4ED8; color:#FFFFFF; border:none; border-radius:6px; padding:6px 12px; font-size:12px; font-weight:700; cursor:pointer;">
          Apply Now
        </button>
      </div>
    `;

    // Slide in
    requestAnimationFrame(() => {
      banner.style.transform = 'translateY(0)';
      banner.style.opacity = '1';
    });

    const applyBtn = document.getElementById('corpsec-btn-apply-update');
    if (applyBtn) {
      applyBtn.onclick = () => {
        applyPendingUpdate();
      };
    }

    if (autoReload) {
      // Auto-apply after 2 seconds if user is idle
      if (pendingReloadTimeout) clearTimeout(pendingReloadTimeout);
      pendingReloadTimeout = setTimeout(() => {
        if (!isUserActivelyEngaged()) {
          applyPendingUpdate();
        } else {
          // Defer reload until user finishes typing or clicks outside
          window.addEventListener('blur', applyPendingUpdate, { once: true });
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
              applyPendingUpdate();
            }
          }, { once: true });
        }
      }, 2200);
    }
  }

  function escapeText(str) {
    return String(str || '').replace(/[&<>"']/g, '');
  }

  /**
   * Applies the downloaded update by reloading with clean cache.
   */
  function applyPendingUpdate() {
    sessionStorage.setItem('corpsec_just_updated', 'true');
    // Reload bypassing cache
    window.location.reload();
  }

  /**
   * Core execution pipeline: Downloads assets in background and installs.
   */
  async function performSilentBackgroundUpdate(manifest) {
    if (isUpdating) return;
    isUpdating = true;

    const newReleaseId = manifest.release_id;
    const newVersion = manifest.version || '2.4.0';

    console.log(`[CorpSec Silent Updater] 🚀 New release detected (${newReleaseId} - v${newVersion}). Downloading update in background...`);

    try {
      // 1. Download updated asset manifests and scripts in background
      const assets = Array.isArray(manifest.assets) ? manifest.assets : [
        '/static/js/app.js',
        '/static/css/styles.css',
        '/static/js/portal.js',
        '/static/css/portal.css',
        '/static/js/silent-updater.js',
        '/manifest.json',
        '/portal-sw.js'
      ];

      // Download all assets in parallel
      await Promise.allSettled(assets.map(url => prefetchAsset(url, newReleaseId)));

      // 2. Pre-fetch entry HTML files
      await Promise.allSettled([
        fetch(`/?_v=${newReleaseId}`, { cache: 'reload' }).catch(() => {}),
        fetch(`/portal?_v=${newReleaseId}`, { cache: 'reload' }).catch(() => {})
      ]);

      // 3. Update Service Workers
      await updateServiceWorkers();

      // 4. Prune obsolete caches
      await pruneOldCaches(newReleaseId);

      // 5. Commit newly installed version to local state
      localStorage.setItem(STORAGE_KEY_RELEASE_ID, newReleaseId);
      localStorage.setItem(STORAGE_KEY_VERSION, newVersion);
      localStorage.setItem(STORAGE_KEY_LAST_CHECK, String(Date.now()));

      console.log(`[CorpSec Silent Updater] ✅ Background download & installation complete! Applied v${newVersion} (${newReleaseId}).`);

      // 6. Notify user and seamlessly apply
      showUpdateNotification(newVersion, newReleaseId, true);

    } catch (err) {
      console.error('[CorpSec Silent Updater] Background update failed:', err);
    } finally {
      isUpdating = false;
    }
  }

  /**
   * Checks the server for a newer release than what is currently running on this device.
   */
  async function checkForUpdates(isManual = false) {
    if (isUpdating) return;

    try {
      const manifest = await fetchVersionManifest();
      if (!manifest || !manifest.release_id) return;

      const currentReleaseId = localStorage.getItem(STORAGE_KEY_RELEASE_ID);
      const currentVersion = localStorage.getItem(STORAGE_KEY_VERSION);

      // First run on this browser / device
      if (!currentReleaseId) {
        localStorage.setItem(STORAGE_KEY_RELEASE_ID, manifest.release_id);
        localStorage.setItem(STORAGE_KEY_VERSION, manifest.version || '2.4.0');
        localStorage.setItem(STORAGE_KEY_LAST_CHECK, String(Date.now()));
        console.log(`[CorpSec Silent Updater] Device registered to release: ${manifest.release_id} (v${manifest.version})`);
        return;
      }

      // If server release differs from locally installed release -> Trigger background update!
      if (currentReleaseId !== manifest.release_id) {
        await performSilentBackgroundUpdate(manifest);
      } else if (isManual) {
        if (typeof showToast === 'function') {
          showToast(`CorpSec is up to date (v${manifest.version})`, 'info');
        } else {
          console.log(`[CorpSec Silent Updater] Device is on latest release (${manifest.release_id})`);
        }
      }
    } catch (err) {
      // Offline or network error: silent fallback to existing cached application
      if (isManual) {
        console.warn('[CorpSec Silent Updater] Offline check error:', err);
      }
    }
  }

  /**
   * Initializes the standing background update scheduler and listeners.
   */
  function initSilentUpdater() {
    // Initial silent check 2.5 seconds after launch to ensure initial page boot is smooth
    setTimeout(() => {
      checkForUpdates(false);
    }, 2500);

    // Continuous background timer
    if (updatePollTimer) clearInterval(updatePollTimer);
    updatePollTimer = setInterval(() => {
      checkForUpdates(false);
    }, CHECK_INTERVAL_MS);

    // Re-check whenever user returns to the app tab/window
    window.addEventListener('focus', () => checkForUpdates(false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates(false);
      }
    });

    // Re-check when device reconnects to network
    window.addEventListener('online', () => checkForUpdates(false));

    // Show quick welcome badge if just updated
    if (sessionStorage.getItem('corpsec_just_updated') === 'true') {
      sessionStorage.removeItem('corpsec_just_updated');
      setTimeout(() => {
        const curVer = localStorage.getItem(STORAGE_KEY_VERSION) || '2.4.0';
        if (typeof showToast === 'function') {
          showToast(`⚡ Running latest version: v${curVer}`, 'success');
        }
      }, 800);
    }
  }

  // Public API
  window.CorpSecUpdater = {
    checkForUpdates: () => checkForUpdates(true),
    getCurrentVersion: () => localStorage.getItem(STORAGE_KEY_VERSION) || '2.4.0',
    getCurrentReleaseId: () => localStorage.getItem(STORAGE_KEY_RELEASE_ID) || 'initial',
    applyPendingUpdate: applyPendingUpdate
  };

  // Start on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSilentUpdater);
  } else {
    initSilentUpdater();
  }

})(window, document);

