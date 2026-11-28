/* CorpSec Guard Mobile Portal JavaScript Module */

const API_BASE = '/api/v1';
const INSTALL_DISMISSED_KEY = 'corpsec_guard_install_dismissed_v2';
let deferredInstallPrompt = null;
let dashboardInFlight = null;

// Token & Session Storage Helpers
function getToken() {
  return sessionStorage.getItem('guard_auth_token') || localStorage.getItem('guard_auth_token');
}

function setToken(token, userDetails) {
  sessionStorage.setItem('guard_auth_token', token);
  localStorage.setItem('guard_auth_token', token);
  if (userDetails) {
    sessionStorage.setItem('guard_user', JSON.stringify(userDetails));
    localStorage.setItem('guard_user', JSON.stringify(userDetails));
  }
}

function dismissGuardSplash() {
  if (window.__guardSplashSafetyTimer) {
    clearTimeout(window.__guardSplashSafetyTimer);
    window.__guardSplashSafetyTimer = null;
  }
  try {
    sessionStorage.setItem('guard_splash_seen', '1');
  } catch (e) {}
  const splash = document.getElementById('guard-launch-splash');
  if (!splash || splash.classList.contains('is-hidden')) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    splash.classList.add('is-hidden');
    return;
  }
  splash.classList.add('is-fading');
  setTimeout(() => {
    splash.classList.add('is-hidden');
  }, 240);
}

function getCachedShiftSnapshot(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(`guard_home_shift_v1_${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveCachedShiftSnapshot(userId, data) {
  if (!userId || !data || !data.today_shift) return;
  try {
    if (data.server_time) {
      recordMeasuredClockSkew(userId, data.server_time);
    }
    // Cache ONLY non-sensitive shift schedule display & site geofence radius (never payslip amounts or credentials)
    const minimal = {
      guard_id: data.guard_id || null,
      employee_number: data.employee_number || '--',
      full_name: data.full_name || '',
      is_today_off: !!data.is_today_off,
      last_updated_iso: new Date().toISOString(),
      today_shift: {
        site_id: data.today_shift.site_id || null,
        site_name: data.today_shift.site_name || '',
        shift_id: data.today_shift.shift_id || null,
        shift_name: data.today_shift.shift_name || '',
        start_time: data.today_shift.start_time || '',
        end_time: data.today_shift.end_time || '',
        is_scheduled: data.today_shift.is_scheduled,
        is_clocked_in: !!data.today_shift.is_clocked_in,
        site_latitude: data.today_shift.site_latitude ?? null,
        site_longitude: data.today_shift.site_longitude ?? null,
        geofence_radius: data.today_shift.geofence_radius || 200,
      },
    };
    localStorage.setItem(`guard_home_shift_v1_${userId}`, JSON.stringify(minimal));
  } catch (e) {}
}

function recordMeasuredClockSkew(userId, serverTimeIso) {
  if (!userId || !serverTimeIso) return;
  try {
    const serverMs = new Date(serverTimeIso).getTime();
    if (!Number.isNaN(serverMs)) {
      const skewMs = Date.now() - serverMs;
      localStorage.setItem(`guard_clock_skew_ms_${userId}`, String(Math.round(skewMs)));
    }
  } catch (e) {}
}

function getMeasuredClockSkew(userId) {
  if (!userId) return 0;
  try {
    const raw = localStorage.getItem(`guard_clock_skew_ms_${userId}`);
    const parsed = raw !== null ? parseInt(raw, 10) : 0;
    return Number.isNaN(parsed) ? 0 : parsed;
  } catch (e) {
    return 0;
  }
}

function formatLastUpdatedLabel(isoStr) {
  if (!isoStr) return '';
  try {
    const dt = new Date(isoStr);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}

function clearToken() {
  sessionStorage.removeItem('guard_auth_token');
  sessionStorage.removeItem('guard_user');
  localStorage.removeItem('guard_auth_token');
  localStorage.removeItem('guard_user');
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('guard_home_shift_v1_') || k.startsWith('guard_clock_skew_ms_'))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
}

function getStoredUser() {
  const data = sessionStorage.getItem('guard_user') || localStorage.getItem('guard_user');
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch (e) {
    clearToken();
    return null;
  }
}

function updateOfflineBanner(customText = null) {
  const banner = document.getElementById('portal-offline-banner');
  const storedUser = getStoredUser();
  const snap = storedUser ? getCachedShiftSnapshot(storedUser.user_id) : null;
  const lastUpd = snap && snap.last_updated_iso ? formatLastUpdatedLabel(snap.last_updated_iso) : '';

  if (banner) {
    if (!navigator.onLine) {
      const suffix = lastUpd ? ` (Offline — last updated ${lastUpd})` : '';
      banner.textContent = customText || `You are offline.${suffix} Clock-in, clock-out & incident reports will be saved on this phone and synced automatically when online.`;
      banner.hidden = false;
    } else if (customText) {
      banner.textContent = customText;
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  }
  updateSyncStatusBarUi();
}

// REST API Fetch Wrapper
async function apiFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  options.cache = options.cache || 'no-store';
  const token = getToken();
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }
  if (!options.headers['Content-Type'] && options.body && typeof options.body === 'string') {
    options.headers['Content-Type'] = 'application/json';
  }

  let res;
  const abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = abortCtrl ? setTimeout(() => abortCtrl.abort(), 8000) : null;
  if (abortCtrl && !options.signal) {
    options.signal = abortCtrl.signal;
  }
  try {
    res = await fetch(`${API_BASE}${endpoint}`, options);
  } catch (networkErr) {
    updateOfflineBanner('Connection error: Unable to reach CorpSec server. Check your internet and try again.');
    const banner = document.getElementById('portal-offline-banner');
    if (banner) banner.hidden = false;
    throw new Error('Network error: Unable to connect to server.');
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (navigator.onLine) {
    updateOfflineBanner();
  }

  if (res.status === 401) {
    clearToken();
    resetPortalDomState();
    showLoginView('Session expired. Please sign in again.');
    throw new Error('Unauthorized');
  }

  if (res.status === 403 && res.headers.get('X-Password-Change-Required') === 'true') {
    const user = getStoredUser() || {};
    user.must_change_password = true;
    const tok = getToken();
    if (tok) setToken(tok, user);
    showForcePasswordView('Please set a personal password before using the Guard Portal.');
    throw new Error('Password change required');
  }

  return res;
}

function registerPortalServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'GUARD_SW_TRIGGER_SYNC') {
      flushGuardOutbox('sw-background-sync');
    }
  });

  const startReg = () => {
    navigator.serviceWorker.register('/guard-sw.js', { scope: '/portal', updateViaCache: 'none' })
      .then((reg) => {
        if (reg && reg.update) {
          // Non-blocking background SW check; does not delay login or dashboard use
          setTimeout(() => reg.update().catch(() => {}), 4000);
        }
      })
      .catch((err) => {
        console.warn('Guard SW registration note:', err);
      });
  };

  if (document.readyState === 'complete') {
    setTimeout(startReg, 50);
  } else {
    window.addEventListener('load', () => setTimeout(startReg, 50), { once: true });
  }
}

async function requestBackgroundSyncRegistration() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg && 'sync' in reg) {
      await reg.sync.register('corpsec-guard-outbox-sync');
    }
  } catch (e) {
    // iOS Safari & desktop browsers without BackgroundSync use online / visibilitychange fallbacks
  }
}

function isPortalStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches
    || window.navigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function hideInstallBanner(rememberChoice = false) {
  const banner = document.getElementById('install-app-banner');
  if (banner) banner.hidden = true;
  if (rememberChoice) localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
}

function showInstallBanner() {
  if (isPortalStandalone()) return;
  if (localStorage.getItem(INSTALL_DISMISSED_KEY)) return;
  const banner = document.getElementById('install-app-banner');
  if (banner) banner.hidden = false;
}

function showManualInstallHelp() {
  if (isIosDevice()) {
    alert('To install CorpSec Guard: tap the Share button, then tap “Add to Home Screen”.');
    return;
  }
  alert('To install CorpSec Guard: tap the Chrome menu (⋮) and choose “Install app” or “Add to Home screen”.');
}

window.triggerPortalPwaInstall = async function () {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    hideInstallBanner(true);
    if (outcome === 'accepted') {
      alert('🎉 CorpSec Guard App installed successfully!');
    }
  } else if (isPortalStandalone()) {
    alert('✅ CorpSec Guard App is already installed and running on your device!');
  } else {
    showManualInstallHelp();
  }
};

function setupInstallPrompt() {
  const installButton = document.getElementById('install-app-button');
  const dismissButton = document.getElementById('dismiss-install-button');

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hideInstallBanner(true);
  });

  installButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      if (choice.outcome === 'accepted') hideInstallBanner(true);
      return;
    }

    showManualInstallHelp();
  });

  dismissButton?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    hideInstallBanner(true);
  });

  showInstallBanner();
}

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  updateOfflineBanner();
  window.addEventListener('online', () => {
    updateOfflineBanner();
    flushGuardOutbox('online-event');
  });
  window.addEventListener('offline', () => {
    updateOfflineBanner();
    renderOutboxQueueUi();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      updateOfflineBanner();
      if (navigator.onLine) {
        flushGuardOutbox('visibilitychange');
      }
    }
  });

  registerPortalServiceWorker();
  setupInstallPrompt();

  const token = getToken();
  const user = getStoredUser();
  if (token) {
    if (user && user.must_change_password) {
      showForcePasswordView();
    } else {
      showPortalView();
      switchPortalTab('home');
      renderOutboxQueueUi();
      if (navigator.onLine) {
        setTimeout(() => flushGuardOutbox('app-open'), 400);
      }
    }
  } else {
    showLoginView();
  }
});

function setLoginAlert(message, type = 'danger') {
  const alertEl = document.getElementById('portal-login-alert');
  if (!alertEl) return;
  if (!message) {
    alertEl.style.display = 'none';
    alertEl.textContent = '';
    return;
  }
  alertEl.className = `alert-banner ${type === 'success' ? 'alert-success' : 'alert-danger'}`;
  alertEl.textContent = message;
  alertEl.style.display = 'flex';
}

function setForcePwdAlert(message, type = 'danger') {
  const alertEl = document.getElementById('portal-force-pwd-alert');
  if (!alertEl) return;
  if (!message) {
    alertEl.style.display = 'none';
    alertEl.textContent = '';
    return;
  }
  alertEl.className = `alert-banner ${type === 'success' ? 'alert-success' : 'alert-danger'}`;
  alertEl.textContent = message;
  alertEl.style.display = 'flex';
}

function resetPortalDomState() {
  currentShiftId = null;
  currentShiftSite = null;
  isCurrentSuperGuard = false;
  superGuardSiteId = null;
  superGuardSiteName = null;
  dashboardInFlight = null;

  const textResets = {
    'header-guard-name': 'GUARD PORTAL',
    'dash-emp-num': '--',
    'dash-site-name': 'Loading...',
    'dash-shift-name': '--',
    'dash-clock-status': 'Loading...',
    'dash-pay-amount': '--',
    'dash-pay-period': '',
  };
  Object.entries(textResets).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = val;
      if (el.dataset && 'hydrated' in el.dataset) {
        el.dataset.hydrated = 'false';
      }
    }
  });

  ['leave-history-list', 'incidents-history-list', 'payslips-list-container', 'offday-history-list'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
}

// View Toggle Helpers
function showLoginView(alertMessage = null, alertType = 'danger') {
  document.body.classList.remove('portal-logged-in');
  const header = document.getElementById('portal-header');
  const nav = document.getElementById('portal-bottom-nav');
  const main = document.getElementById('portal-main');
  const loginSec = document.getElementById('portal-login-section');
  const forceSec = document.getElementById('portal-force-password-section');

  if (header) header.style.display = 'none';
  if (nav) nav.style.display = 'none';
  if (main) main.style.display = 'none';
  if (forceSec) forceSec.style.display = 'none';
  if (loginSec) loginSec.style.display = 'flex';

  const pwInput = document.getElementById('login-password');
  if (pwInput) pwInput.value = '';
  setLoginAlert(alertMessage, alertType);
  dismissGuardSplash();
}

function showForcePasswordView(alertMessage = null) {
  document.body.classList.remove('portal-logged-in');
  const header = document.getElementById('portal-header');
  const nav = document.getElementById('portal-bottom-nav');
  const main = document.getElementById('portal-main');
  const loginSec = document.getElementById('portal-login-section');
  const forceSec = document.getElementById('portal-force-password-section');

  if (header) header.style.display = 'none';
  if (nav) nav.style.display = 'none';
  if (main) main.style.display = 'none';
  if (loginSec) loginSec.style.display = 'none';
  if (forceSec) forceSec.style.display = 'flex';

  ['force-current-password', 'force-new-password', 'force-confirm-password'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  setForcePwdAlert(alertMessage, 'danger');
  dismissGuardSplash();
}

function showPortalView() {
  const loginSec = document.getElementById('portal-login-section');
  const forceSec = document.getElementById('portal-force-password-section');
  if (loginSec) loginSec.style.display = 'none';
  if (forceSec) forceSec.style.display = 'none';

  document.body.classList.add('portal-logged-in');
  document.getElementById('portal-header').style.display = 'flex';
  document.getElementById('portal-bottom-nav').style.display = 'flex';
  document.getElementById('portal-main').style.display = 'block';

  const user = getStoredUser();
  if (user) {
    const displayName = user.full_name || (user.email ? user.email.split('@')[0].replace('.', ' ') : 'GUARD PORTAL');
    document.getElementById('header-guard-name').innerText = displayName.toUpperCase();
  }
  // Dismiss cold-start splash immediately once the portal shell is visible (zero network wait)
  dismissGuardSplash();
}

window.togglePortalPassword = function (inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const hidden = input.type === 'password';
  input.type = hidden ? 'text' : 'password';
  if (btnEl) btnEl.textContent = hidden ? 'Hide' : 'Show';
};

window.togglePortalForgotBox = function () {
  const box = document.getElementById('portal-forgot-box');
  if (!box) return;
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
};

window.handlePortalForgotPassword = async function () {
  const input = document.getElementById('portal-forgot-input');
  const btn = document.getElementById('btn-portal-forgot');
  const ident = (input ? input.value : '').trim();
  if (!ident) {
    setLoginAlert('Enter your registered phone number or Guard ID first.', 'danger');
    return;
  }
  if (!navigator.onLine) {
    setLoginAlert('You appear offline. Reconnect to internet to request a password reset.', 'danger');
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending...';
  }
  try {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ident }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoginAlert(data.detail || 'Could not reset password via email. Please contact HR or Admin to reset your password to your phone number.', 'danger');
      return;
    }
    setLoginAlert(data.message || 'Password reset email dispatched.', 'success');
  } catch (e) {
    setLoginAlert('Connection error while contacting server. Check your mobile data and try again.', 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Send Reset Email';
    }
  }
};

window.handlePortalLogin = async function (event) {
  if (event) event.preventDefault();
  setLoginAlert(null);

  const phoneInput = document.getElementById('login-phone');
  const pwInput = document.getElementById('login-password');
  const btn = document.getElementById('btn-portal-login');

  const ident = (phoneInput ? phoneInput.value : '').trim();
  const password = pwInput ? pwInput.value : '';

  if (!ident || !password) {
    setLoginAlert('Please enter your phone number and password.', 'danger');
    return;
  }

  if (!navigator.onLine) {
    setLoginAlert('You are currently offline. Connect to mobile data or Wi-Fi to sign in.', 'danger');
    updateOfflineBanner();
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Signing in...';
  }

  try {
    const res = await fetch(`${API_BASE}/auth/login/guard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guard_id: ident,
        phone: ident,
        password: password,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoginAlert(data.detail || 'Incorrect phone number or password.', 'danger');
      return;
    }

    if (!data.access_token) {
      setLoginAlert(data.message || 'Unable to complete sign-in.', 'danger');
      return;
    }

    clearToken();
    resetPortalDomState();
    setToken(data.access_token, data);

    if (data.must_change_password) {
      showForcePasswordView();
    } else {
      showPortalView();
      switchPortalTab('home');
      renderOutboxQueueUi();
      if (navigator.onLine) {
        setTimeout(() => flushGuardOutbox('post-login'), 300);
      }
    }
  } catch (err) {
    setLoginAlert('Unable to connect to CorpSec server. Check your internet connection and retry.', 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  }
};

window.handleForcePasswordChange = async function (event) {
  if (event) event.preventDefault();
  setForcePwdAlert(null);

  const curInput = document.getElementById('force-current-password');
  const newInput = document.getElementById('force-new-password');
  const confInput = document.getElementById('force-confirm-password');
  const btn = document.getElementById('btn-force-pwd-submit');

  const currentPassword = curInput ? curInput.value : '';
  const newPassword = newInput ? newInput.value : '';
  const confirmPassword = confInput ? confInput.value : '';

  if (newPassword.length < 6) {
    setForcePwdAlert('New password must be at least 6 characters long.', 'danger');
    return;
  }
  if (newPassword !== confirmPassword) {
    setForcePwdAlert('New password and confirmation do not match.', 'danger');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving new password...';
  }

  try {
    const res = await apiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setForcePwdAlert(data.detail || 'Could not update password. Please verify your current password.', 'danger');
      return;
    }

    const user = getStoredUser() || {};
    user.must_change_password = false;
    const tok = getToken();
    if (tok) setToken(tok, user);

    showPortalView();
    switchPortalTab('home');
  } catch (err) {
    if (err.message !== 'Unauthorized') {
      setForcePwdAlert(err.message || 'Network error updating password. Please try again.', 'danger');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save New Password & Continue';
    }
  }
};

async function logoutGuard() {
  try {
    const unsyncedCount = await getUnsyncedCountForCurrentGuard();
    if (unsyncedCount > 0) {
      const proceed = confirm(
        `⚠️ You have ${unsyncedCount} unsynced offline item(s) saved on this phone that have not yet been sent to the server.\n\nIf you sign out now, these items will remain safely in your private queue on this device and will sync the next time you sign back in.\n\nDo you still want to sign out?`
      );
      if (!proceed) return;
    }
  } catch (e) {}

  const token = getToken();
  if (token && navigator.onLine) {
    fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    }).catch(() => {});
  }
  clearToken();
  resetPortalDomState();
  showLoginView('Signed out successfully.', 'success');
}

window.addEventListener('popstate', () => {
  if (!getToken()) {
    showLoginView('Logged out successfully.', 'success');
  }
});

/// Tab Switching Handler
function switchPortalTab(tabName) {
  if (!getToken()) {
    showLoginView('Session expired. Please log in again.');
    return;
  }
  const storedUser = getStoredUser();
  if (storedUser && storedUser.must_change_password) {
    showForcePasswordView();
    return;
  }
  const tabs = ['home', 'leave', 'incidents', 'super-guard', 'profile', 'anonymous'];
  tabs.forEach(tab => {
    const sec = document.getElementById(`section-${tab}`);
    const nav = document.getElementById(`nav-tab-${tab}`);
    if (sec) sec.style.display = tab === tabName ? 'block' : 'none';
    if (nav) {
      if (tab === tabName) nav.classList.add('active');
      else nav.classList.remove('active');
    }
  });

  if (tabName === 'home') loadDashboard();
  else if (tabName === 'leave') {
    loadLeaveRequests();
    loadOffDayAllowance();
    loadMyOffDayRequests();
  }
  else if (tabName === 'incidents') loadIncidents();
  else if (tabName === 'super-guard') loadSuperGuardPortal();
  else if (tabName === 'profile') loadProfile();
}

// -------------------------------------------------------------
// 1. HOME SCREEN & DASHBOARD
// -------------------------------------------------------------
let currentShiftId = null;
let currentShiftSite = null;
let isCurrentSuperGuard = false;
let superGuardSiteId = null;
let superGuardSiteName = null;

async function loadDashboard() {
  if (dashboardInFlight) {
    return dashboardInFlight;
  }

  const clockStatus = document.getElementById('dash-clock-status');
  const clockBtn = document.getElementById('btn-clock-action');
  const storedUser = getStoredUser();
  const cachedSnap = storedUser ? getCachedShiftSnapshot(storedUser.user_id) : null;
  if (cachedSnap) {
    const empEl = document.getElementById('dash-emp-num');
    const siteEl = document.getElementById('dash-site-name');
    const shiftEl = document.getElementById('dash-shift-name');
    if (empEl && empEl.dataset.hydrated !== 'live') {
      empEl.innerText = cachedSnap.employee_number || '--';
      empEl.dataset.hydrated = 'cache';
    }
    if (siteEl && cachedSnap.today_shift && siteEl.dataset.hydrated !== 'live') {
      siteEl.innerText = cachedSnap.today_shift.site_name || 'Assigned Site';
      siteEl.dataset.hydrated = 'cache';
    }
    if (shiftEl && cachedSnap.today_shift && shiftEl.dataset.hydrated !== 'live') {
      const sh = cachedSnap.today_shift;
      const tr = (sh.start_time && sh.end_time && sh.start_time !== '--:--') ? ` (${sh.start_time} - ${sh.end_time})` : '';
      shiftEl.innerText = `${sh.shift_name || 'Shift'}${tr}`;
      shiftEl.dataset.hydrated = 'cache';
    }
    if (!currentShiftSite && cachedSnap.today_shift) {
      currentShiftId = cachedSnap.today_shift.shift_id || null;
      currentShiftSite = {
        site_id: cachedSnap.today_shift.site_id,
        site_name: cachedSnap.today_shift.site_name,
        latitude: cachedSnap.today_shift.site_latitude,
        longitude: cachedSnap.today_shift.site_longitude,
        radius: cachedSnap.today_shift.geofence_radius || 200,
      };
    }
    if (!navigator.onLine && clockBtn) {
      clockBtn.disabled = false;
      applyCachedClockButtonState(cachedSnap.today_shift.is_clocked_in);
    }
  }
  dismissGuardSplash();
  updateOfflineBanner();
  renderOutboxQueueUi();
  if (!navigator.onLine) {
    if (clockStatus && clockStatus.dataset.hydrated !== 'live') {
      const updLabel = cachedSnap && cachedSnap.last_updated_iso ? formatLastUpdatedLabel(cachedSnap.last_updated_iso) : '';
      clockStatus.className = 'status-badge warning';
      clockStatus.innerText = updLabel ? `📴 Offline — last updated ${updLabel}` : '📴 Offline Mode';
    }
    if (clockBtn && clockBtn.disabled) {
      clockBtn.disabled = false;
      applyCachedClockButtonState(cachedSnap && cachedSnap.today_shift ? cachedSnap.today_shift.is_clocked_in : false);
    }
    return;
  }
  if (clockStatus && clockStatus.dataset.hydrated !== 'live') {
    clockStatus.innerText = '⏳ Refreshing shift...';
  }
  if (clockBtn && !currentShiftId) {
    clockBtn.disabled = true;
  }

  dashboardInFlight = (async () => {
  try {
    const res = await apiFetch('/guard-portal/dashboard');
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      if (clockStatus) {
        clockStatus.className = 'status-badge danger';
        clockStatus.innerText = '⚠️ Error Loading Dashboard';
      }
      console.error('Dashboard load failed:', errData);
      dismissGuardSplash();
      return;
    }

    const data = await res.json();
    if (storedUser && storedUser.user_id) {
      saveCachedShiftSnapshot(storedUser.user_id, data);
    }
    dismissGuardSplash();
    
    // Header & User badge
    if (data.full_name) {
      document.getElementById('header-guard-name').innerText = data.full_name.toUpperCase();
    }
    const empNumEl = document.getElementById('dash-emp-num');
    if (empNumEl) {
      empNumEl.innerText = data.employee_number || '--';
      empNumEl.dataset.hydrated = 'live';
    }
    const siteNameEl = document.getElementById('dash-site-name');
    const shiftNameEl = document.getElementById('dash-shift-name');
    if (siteNameEl) siteNameEl.dataset.hydrated = 'live';
    if (shiftNameEl) shiftNameEl.dataset.hydrated = 'live';
    if (clockStatus) clockStatus.dataset.hydrated = 'live';
    
    const shift = data.today_shift || {};
    
    // Store shift ID for clock in
    currentShiftId = shift.shift_id || null;
    latestPayrollRecordId = data.latest_payroll_record_id || null;

    // Clock In/Out button state
    const clockBtn = document.getElementById('btn-clock-action');
    const clockStatus = document.getElementById('dash-clock-status');

    if (clockBtn) clockBtn.disabled = false;

    if (shift.is_scheduled === false) {
      document.getElementById('dash-site-name').innerText = shift.site_name || 'No shift scheduled today';
      document.getElementById('dash-shift-name').innerText = 'Day Off';
      
      if (shift.is_clocked_in) {
        clockStatus.className = 'status-badge active';
        clockStatus.innerText = '🟢 Clocked In (Unrostered)';
        clockBtn.className = 'btn-clock clock-out';
        clockBtn.innerHTML = '🛑 Clock Out Now';
        clockBtn.onclick = handleClockOut;
      } else {
        clockStatus.className = 'status-badge inactive';
        if (data.is_today_off) {
          clockStatus.style.background = '#ECFDF5';
          clockStatus.style.color = '#065F46';
          clockStatus.style.border = '1px solid #A7F3D0';
          clockStatus.innerText = '🏖️ TODAY IS YOUR SCHEDULED OFF DAY';
          clockBtn.className = 'btn-clock';
          clockBtn.style.background = '#059669';
          clockBtn.style.color = '#FFFFFF';
          clockBtn.innerHTML = '🏖️ Scheduled Off Duty (Mandatory Rest Day)';
          clockBtn.onclick = () => {
            alert('🏖️ You are scheduled for a mandatory rest day today by your Field Supervisor.\n\nIf you were called in for an emergency unrostered shift, you may clock in.');
            handleClockIn(null);
          };
        } else {
          clockStatus.innerText = '⚪ Day Off (No Shift Scheduled)';
          clockBtn.className = 'btn-clock clock-in';
          clockBtn.style.background = '';
          clockBtn.style.color = '';
          clockBtn.innerHTML = '▶ Clock In (Unrostered)';
          clockBtn.onclick = () => handleClockIn(null);
        }
      }
    } else {
      document.getElementById('dash-site-name').innerText = shift.site_name || 'Assigned Site';
      const timeRange = (shift.start_time && shift.end_time && shift.start_time !== '--:--')
        ? ` (${shift.start_time} - ${shift.end_time})`
        : '';
      document.getElementById('dash-shift-name').innerText = `${shift.shift_name || 'No Shift Assigned'}${timeRange}`;

      if (shift.is_clocked_in) {
        clockStatus.className = 'status-badge active';
        clockStatus.innerText = '🟢 Clocked In (On Duty)';
        clockBtn.className = 'btn-clock clock-out';
        clockBtn.innerHTML = '🛑 Clock Out Now';
        clockBtn.onclick = handleClockOut;
      } else {
        clockStatus.className = 'status-badge warning';
        clockStatus.innerText = '🟡 Not Clocked In';
        clockBtn.className = 'btn-clock clock-in';
        clockBtn.innerHTML = '▶ Clock In Now';
        clockBtn.onclick = () => handleClockIn(currentShiftId);
      }
    }

    // Super Guard & Geofence Details
    isCurrentSuperGuard = !!data.is_super_guard;
    superGuardSiteId = data.super_guard_site_id || (shift.site_id || null);
    superGuardSiteName = data.super_guard_site_name || (shift.site_name || 'Assigned Site');

    // Store site geofence info
    currentShiftSite = {
      site_id: shift.site_id,
      site_name: shift.site_name,
      latitude: shift.site_latitude,
      longitude: shift.site_longitude,
      radius: shift.geofence_radius || 200
    };

    // Update Geofence status banner
    const geoStatusEl = document.getElementById('geo-perimeter-status');
    const geoHeadEl = document.getElementById('geo-perimeter-heading');
    if (geoStatusEl) {
      if (shift.site_name) {
        if (geoHeadEl) geoHeadEl.innerText = `Site Geofence: ${shift.site_name} (200m Radius)`;
        geoStatusEl.innerHTML = `GPS coordinates required on clock-in. You must be physically within 200m of <strong>${shift.site_name}</strong> to sign in.`;
      } else {
        if (geoHeadEl) geoHeadEl.innerText = 'Site Geofence Radius Verification';
        geoStatusEl.innerText = 'Guards must be within 200m of the site coordinates to clock in. GPS location is acquired automatically on tap.';
      }
    }

    // Toggle Super Guard bottom nav and home banner
    const sgNavTab = document.getElementById('nav-tab-super-guard');
    const sgNoticeCard = document.getElementById('super-guard-notice-card');
    const sgQaTile = document.getElementById('qa-super-guard-tile');
    const sgBannerSite = document.getElementById('sg-dash-banner-site');

    if (isCurrentSuperGuard) {
      if (sgNavTab) sgNavTab.style.display = 'flex';
      if (sgNoticeCard) {
        sgNoticeCard.style.display = 'block';
        if (sgBannerSite) sgBannerSite.innerText = `🛡️ Stationed at: ${superGuardSiteName}`;
      }
      if (sgQaTile) sgQaTile.style.display = 'flex';
    } else {
      if (sgNavTab) sgNavTab.style.display = 'none';
      if (sgNoticeCard) sgNoticeCard.style.display = 'none';
      if (sgQaTile) sgQaTile.style.display = 'none';
    }

    // Render Scheduled Off Days in Dashboard
    renderScheduledOffDays(data);

  } catch (err) {
    if (err.message === 'Unauthorized' || err.message === 'Password change required') return;
    console.error('Dashboard load error:', err);
    const clockStatus = document.getElementById('dash-clock-status');
    if (clockStatus) {
      clockStatus.className = 'status-badge danger';
      clockStatus.innerText = navigator.onLine ? '⚠️ Unable to load shift details' : '⚠️ Offline — Reconnect to load';
    }
  } finally {
    dashboardInFlight = null;
  }
  })();

  return dashboardInFlight;
}

function applyCachedClockButtonState(isClockedIn) {
  const clockBtn = document.getElementById('btn-clock-action');
  const clockStatus = document.getElementById('dash-clock-status');
  if (!clockBtn) return;
  clockBtn.disabled = false;
  if (isClockedIn) {
    clockBtn.className = 'btn-clock clock-out';
    clockBtn.innerHTML = '🛑 Clock Out Now';
    clockBtn.onclick = handleClockOut;
    if (clockStatus) {
      clockStatus.className = 'status-badge active';
      clockStatus.innerText = navigator.onLine ? '🟢 Clocked In (On Duty)' : '🟢 Clocked In (Offline Ready)';
    }
  } else {
    clockBtn.className = 'btn-clock clock-in';
    clockBtn.innerHTML = '▶ Clock In Now';
    clockBtn.onclick = () => handleClockIn(currentShiftId);
  }
}

function acquireGpsPositionWithFallback(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({ code: 0, message: 'Geolocation not supported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy || 0),
      }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
    );
  });
}

async function handleClockIn(shiftId) {
  const clockBtn = document.getElementById('btn-clock-action');
  const originalText = clockBtn ? clockBtn.innerHTML : '▶ Clock In Now';

  if (!navigator.geolocation && navigator.onLine) {
    alert('📍 Geolocation is not supported by your device browser.\n\nGuards without GPS-capable smartphones must be signed in by the Site Super Guard.');
    return;
  }

  if (clockBtn) {
    clockBtn.disabled = true;
    clockBtn.innerHTML = '📡 Acquiring GPS Location...';
  }

  let gps = { latitude: null, longitude: null, accuracy: null };
  try {
    gps = await acquireGpsPositionWithFallback(10000);
  } catch (err) {
    if (navigator.onLine) {
      if (clockBtn) {
        clockBtn.disabled = false;
        clockBtn.innerHTML = originalText;
      }
      let explanation = 'Could not acquire GPS position.';
      if (err.code === 1) explanation = 'GPS location permission was denied. Please allow location access in your browser settings to verify you are within 200m of the site.';
      else if (err.code === 2) explanation = 'GPS position unavailable. Please ensure your device location/GPS is switched ON.';
      else if (err.code === 3) explanation = 'GPS request timed out. Please try again with clear sky or Wi-Fi visibility.';
      alert(`📍 GPS Verification Required:\n\n${explanation}\n\nGuards stationed at this site without a smartphone can be clocked in directly by their Site Super Guard.`);
      return;
    }
    // When offline, still allow queuing clock-in even if GPS timed out — server will flag for supervisor review
  }

  const storedUser = getStoredUser() || {};
  const userId = storedUser.user_id;
  const clientUuid = generateClientUuid();
  const deviceTimestamp = new Date().toISOString();
  const clockSkewMs = getMeasuredClockSkew(userId);

  const payload = {
    shift_id: shiftId || currentShiftId || null,
    latitude: gps.latitude,
    longitude: gps.longitude,
    client_uuid: clientUuid,
    device_timestamp: deviceTimestamp,
    clock_skew_ms: clockSkewMs,
    submitted_offline: !navigator.onLine,
  };

  if (navigator.onLine) {
    try {
      if (clockBtn) clockBtn.innerHTML = '⏳ Verifying Site Geofence...';
      const res = await apiFetch('/attendance/clock-in', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status >= 500) {
          throw new Error('Server 5xx error');
        }
        const errMsg = data.detail || 'Clock-in rejected';
        alert(`❌ Clock-In Failed:\n\n${errMsg}`);
        if (clockBtn) {
          clockBtn.disabled = false;
          clockBtn.innerHTML = originalText;
        }
        return;
      }
      alert(`✅ Clocked In Successfully!\n\nDevice GPS verified (Accuracy: ±${gps.accuracy || 0}m). Have a safe shift!`);
      loadDashboard();
      return;
    } catch (netErr) {
      if (netErr.message === 'Unauthorized' || netErr.message === 'Password change required') {
        if (clockBtn) {
          clockBtn.disabled = false;
          clockBtn.innerHTML = originalText;
        }
        return;
      }
      // Network or 5xx failure while attempting clock-in -> fall through to offline outbox queue
      payload.submitted_offline = true;
    }
  }

  // Queue in IndexedDB Outbox
  const queued = await enqueueGuardOutboxItem({
    client_uuid: clientUuid,
    action_type: 'CLOCK_IN',
    label: `Duty Clock-In (${currentShiftSite && currentShiftSite.site_name ? currentShiftSite.site_name : 'Assigned Site'})`,
    payload: payload,
    gps: gps,
    device_timestamp: deviceTimestamp,
    clock_skew_ms: clockSkewMs,
  });

  if (queued) {
    updateCachedClockState(userId, true);
    applyCachedClockButtonState(true);
    showSyncNoticeBanner('💾 Clock-In saved on this phone, not yet sent. Will sync automatically when connection returns.', 'info');
  } else if (clockBtn) {
    clockBtn.disabled = false;
    clockBtn.innerHTML = originalText;
  }
}

async function handleClockOut() {
  const clockBtn = document.getElementById('btn-clock-action');
  const originalText = clockBtn ? clockBtn.innerHTML : '🛑 Clock Out Now';
  if (clockBtn) {
    clockBtn.disabled = true;
    clockBtn.innerHTML = '⏳ Recording Clock-Out...';
  }

  const storedUser = getStoredUser() || {};
  const userId = storedUser.user_id;
  const clientUuid = generateClientUuid();
  const deviceTimestamp = new Date().toISOString();
  const clockSkewMs = getMeasuredClockSkew(userId);

  // Check if there is a queued CLOCK_IN in the outbox for this guard
  const parentClockIn = await findLatestQueuedClockInForCurrentGuard();

  const payload = {
    client_uuid: clientUuid,
    parent_clock_in_uuid: parentClockIn ? parentClockIn.client_uuid : null,
    orphaned_clock_in_reason: (parentClockIn && parentClockIn.status === 'failed') ? (parentClockIn.last_error || 'Preceding offline clock-in failed') : null,
    device_timestamp: deviceTimestamp,
    clock_skew_ms: clockSkewMs,
    submitted_offline: !navigator.onLine || !!parentClockIn,
  };

  // If online AND there is no unsynced parent clock-in ahead of us in the queue, send directly
  if (navigator.onLine && !parentClockIn) {
    try {
      const res = await apiFetch('/attendance/clock-out', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status >= 500) {
          throw new Error('Server 5xx error');
        }
        alert(data.detail || 'Clock-out failed');
        if (clockBtn) {
          clockBtn.disabled = false;
          clockBtn.innerHTML = originalText;
        }
        return;
      }
      alert(`✅ Clocked out successfully! (Hours: ${data.regular_hours} hrs, OT: ${data.overtime_hours} hrs)`);
      loadDashboard();
      return;
    } catch (netErr) {
      if (netErr.message === 'Unauthorized' || netErr.message === 'Password change required') {
        if (clockBtn) {
          clockBtn.disabled = false;
          clockBtn.innerHTML = originalText;
        }
        return;
      }
      payload.submitted_offline = true;
    }
  }

  const queued = await enqueueGuardOutboxItem({
    client_uuid: clientUuid,
    action_type: 'CLOCK_OUT',
    label: `Duty Clock-Out (${currentShiftSite && currentShiftSite.site_name ? currentShiftSite.site_name : 'Assigned Site'})`,
    payload: payload,
    parent_client_uuid: parentClockIn ? parentClockIn.client_uuid : null,
    device_timestamp: deviceTimestamp,
    clock_skew_ms: clockSkewMs,
  });

  if (queued) {
    updateCachedClockState(userId, false);
    applyCachedClockButtonState(false);
    showSyncNoticeBanner('💾 Clock-Out saved on this phone, not yet sent. Will sync in order after any pending items.', 'info');
    if (navigator.onLine) {
      flushGuardOutbox('clock-out-queued');
    }
  } else if (clockBtn) {
    clockBtn.disabled = false;
    clockBtn.innerHTML = originalText;
  }
}

// -------------------------------------------------------------
// 2. LEAVE REQUESTS SCREEN
// -------------------------------------------------------------
async function handleLeaveSubmit(event) {
  event.preventDefault();
  const alertEl = document.getElementById('leave-alert-banner');
  const successEl = document.getElementById('leave-success-banner');
  if (alertEl) alertEl.style.display = 'none';
  if (successEl) successEl.style.display = 'none';

  const leaveType = document.getElementById('leave-type').value;
  const startDate = document.getElementById('leave-start-date').value;
  const endDate = document.getElementById('leave-end-date').value;
  const reason = document.getElementById('leave-reason').value.trim();

  // Validation: Missing fields
  if (!startDate || !endDate) {
    showLeaveError('Please select both start and end dates.');
    return;
  }

  // Validation: End date before start date
  if (new Date(endDate) < new Date(startDate)) {
    showLeaveError('End date cannot be before start date.');
    return;
  }

  // Validation: Missing or too short reason
  if (!reason || reason.length < 3) {
    showLeaveError('Please provide a reason for your leave request (at least 3 characters).');
    return;
  }

  if (!navigator.onLine) {
    showLeaveError('Leave requests require an active internet connection so your allowance and schedule can be validated live.');
    return;
  }

  try {
    const res = await apiFetch('/guard-portal/leave', {
      method: 'POST',
      body: JSON.stringify({
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: reason
      })
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = typeof data.detail === 'string' ? data.detail : (Array.isArray(data.detail) ? data.detail[0].msg : 'Failed to submit leave request.');
      showLeaveError(msg);
      return;
    }

    if (successEl) {
      successEl.innerHTML = `✅ <strong>Leave request submitted!</strong> Status is <strong>PENDING</strong> manager approval.`;
      successEl.style.display = 'block';
    }
    document.getElementById('leave-form').reset();
    loadLeaveRequests();

  } catch (err) {
    showLeaveError('Network error or server unreachable.');
  }
}

function showLeaveError(msg) {
  const alertEl = document.getElementById('leave-alert-banner');
  if (alertEl) {
    alertEl.innerHTML = `⚠️ <strong>Validation Error:</strong> ${msg}`;
    alertEl.style.display = 'block';
  } else {
    alert(msg);
  }
}

async function loadLeaveRequests() {
  const container = document.getElementById('leave-history-list');
  container.innerHTML = '<div style="text-align:center; padding:16px; color:#64748B;">Loading leave history...</div>';

  try {
    const res = await apiFetch('/guard-portal/leave');
    if (!res.ok) return;

    const requests = await res.json();
    if (!requests || requests.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🏖️</div>
          <div style="font-weight:700; color:#1E293B; margin-bottom:4px;">No leave requests yet</div>
          <div style="font-size:12px; color:#64748B;">You have not submitted any leave applications. Use the form above to apply for leave.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = requests.map(item => `
      <div class="history-item">
        <div class="history-header">
          <span class="history-title">${item.leave_type} Leave (${item.duration_days || 1} day${(item.duration_days || 1) > 1 ? 's' : ''})</span>
          <span class="status-badge ${item.status ? item.status.toLowerCase() : 'pending'}">${item.status || 'PENDING'}</span>
        </div>
        <div class="history-date">📅 ${item.start_date} to ${item.end_date}</div>
        <div class="history-desc">${item.reason || 'No reason provided'}</div>
      </div>
    `).join('');

  } catch (err) {
    container.innerHTML = '<div style="color:#EF4444; padding:16px;">Failed to load leave history.</div>';
  }
}

// -------------------------------------------------------------
// 3. INCIDENT REPORTING SCREEN (WITH OFFLINE QUEUE & PHOTO COMPRESSION)
// -------------------------------------------------------------
async function handleIncidentSubmit(event) {
  event.preventDefault();
  const alertEl = document.getElementById('incident-alert-banner');
  const successEl = document.getElementById('incident-success-banner');
  if (alertEl) alertEl.style.display = 'none';
  if (successEl) successEl.style.display = 'none';

  const incidentType = document.getElementById('incident-type').value;
  const description = document.getElementById('incident-desc').value.trim();
  const photoInput = document.getElementById('incident-photo');
  const rawPhotoFile = (photoInput && photoInput.files && photoInput.files[0]) ? photoInput.files[0] : null;

  // Validation: Short description check
  if (!description || description.length < 5) {
    showIncidentError('Incident description must be at least 5 characters long.');
    return;
  }

  let compressedPhotoBlob = null;
  let compressedPhotoName = null;
  if (rawPhotoFile) {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes((rawPhotoFile.type || '').toLowerCase())) {
      showIncidentError('Unsupported photo type. Please attach a JPEG, PNG, or WebP photo.');
      return;
    }
    try {
      compressedPhotoBlob = await compressIncidentPhoto(rawPhotoFile);
      compressedPhotoName = 'incident_photo.jpg';
      if (compressedPhotoBlob.size > 5 * 1024 * 1024) {
        showIncidentError('Photo is still larger than the 5 MB limit after compression. Please choose a smaller photo.');
        return;
      }
    } catch (compErr) {
      showIncidentError(compErr.message || 'Could not process attached photo.');
      return;
    }
  }

  const storedUser = getStoredUser() || {};
  const userId = storedUser.user_id;
  const clientUuid = generateClientUuid();
  const deviceTimestamp = new Date().toISOString();
  const clockSkewMs = getMeasuredClockSkew(userId);

  const payload = {
    incident_type: incidentType,
    description: description,
    client_uuid: clientUuid,
    device_timestamp: deviceTimestamp,
    clock_skew_ms: clockSkewMs,
    submitted_offline: !navigator.onLine,
  };

  if (navigator.onLine) {
    try {
      const res = await apiFetch('/guard-portal/incidents', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status >= 500) {
          throw new Error('Server 5xx error');
        }
        const msg = typeof data.detail === 'string' ? data.detail : (Array.isArray(data.detail) ? data.detail[0].msg : 'Failed to submit incident report.');
        showIncidentError(msg);
        return;
      }

      let photoNote = '';
      if (compressedPhotoBlob && data.id) {
        try {
          await uploadCompressedIncidentPhoto(data.id, compressedPhotoBlob, compressedPhotoName);
          photoNote = ' (with compressed photo)';
        } catch (photoErr) {
          photoNote = ` (text saved; photo upload warning: ${photoErr.message})`;
        }
      }

      if (successEl) {
        successEl.style.display = 'block';
        successEl.innerHTML = `✅ <strong>Incident Reported Successfully${photoNote}!</strong><br>Reference Number: <span style="font-family:monospace; font-size:16px; font-weight:800;">${data.reference_number || 'INC-0001'}</span>`;
      }

      document.getElementById('incident-form').reset();
      clearIncidentPhotoPreview();
      loadIncidents();
      return;
    } catch (netErr) {
      if (netErr.message === 'Unauthorized' || netErr.message === 'Password change required') return;
      payload.submitted_offline = true;
    }
  }

  // Save incident (and compressed photo blob) to IndexedDB outbox
  const queued = await enqueueGuardOutboxItem({
    client_uuid: clientUuid,
    action_type: 'INCIDENT_REPORT',
    label: `Incident Report: ${incidentType}${compressedPhotoBlob ? ' + Photo' : ''}`,
    payload: payload,
    photo_blob: compressedPhotoBlob,
    photo_name: compressedPhotoName,
    photo_status: compressedPhotoBlob ? 'pending' : 'none',
    device_timestamp: deviceTimestamp,
    clock_skew_ms: clockSkewMs,
  });

  if (queued) {
    if (successEl) {
      successEl.style.display = 'block';
      successEl.innerHTML = `💾 <strong>Saved on this phone, not yet sent!</strong><br>Your <strong>${incidentType}</strong> report${compressedPhotoBlob ? ' and compressed photo' : ''} will be uploaded automatically when your connection returns.`;
    }
    document.getElementById('incident-form').reset();
    clearIncidentPhotoPreview();
    showSyncNoticeBanner('💾 Incident report saved on this phone, not yet sent.', 'info');
  }
}

function showIncidentError(msg) {
  const alertEl = document.getElementById('incident-alert-banner');
  if (alertEl) {
    alertEl.innerHTML = `⚠️ <strong>Validation Error:</strong> ${msg}`;
    alertEl.style.display = 'block';
  } else {
    alert(msg);
  }
}

async function loadIncidents() {
  const container = document.getElementById('incident-history-list');
  container.innerHTML = '<div style="text-align:center; padding:16px; color:#64748B;">Loading reported incidents...</div>';

  try {
    const res = await apiFetch('/guard-portal/incidents');
    if (!res.ok) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div style="font-weight:700; color:#1E293B; margin-bottom:4px;">No incident reports submitted yet</div>
          <div style="font-size:12px; color:#64748B;">Use the form above to log any security breaches, damage, or site incidents.</div>
        </div>
      `;
      return;
    }

    let incidents = await res.json();
    if (!Array.isArray(incidents)) incidents = [incidents];

    if (!incidents || incidents.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div style="font-weight:700; color:#1E293B; margin-bottom:4px;">No incident reports submitted yet</div>
          <div style="font-size:12px; color:#64748B;">Use the form above to log any security breaches, damage, or site incidents.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = incidents.map(item => `
      <div class="history-item">
        <div class="history-header">
          <span class="history-title">${item.reference_number || 'INC-0000'} — ${item.incident_type}</span>
          <span class="status-badge ${item.status === 'RESOLVED' ? 'approved' : 'open'}">${item.status || 'OPEN'}</span>
        </div>
        <div class="history-date">🕒 Reported: ${item.incident_date || ''} ${item.incident_time || ''}</div>
        <div class="history-desc">${item.description}</div>
      </div>
    `).join('');

  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div style="font-weight:700; color:#1E293B; margin-bottom:4px;">No incident reports submitted yet</div>
        <div style="font-size:12px; color:#64748B;">Use the form above to log any security breaches, damage, or site incidents.</div>
      </div>
    `;
  }
}

// -------------------------------------------------------------
// 4. SUPER GUARD SITE ATTENDANCE REGISTER
// -------------------------------------------------------------
async function loadSuperGuardPortal() {
  const container = document.getElementById('sg-guards-list');
  const countLabel = document.getElementById('sg-guards-count-label');
  const siteTitle = document.getElementById('sg-portal-site-name');

  if (siteTitle) {
    siteTitle.innerText = superGuardSiteName || 'Assigned Site';
  }

  if (container) {
    container.innerHTML = '<div style="text-align:center; padding:18px; color:#64748B;">Fetching stationed guards duty register...</div>';
  }

  try {
    const res = await apiFetch('/attendance/super-guard/guards');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (container) {
        container.innerHTML = `<div style="padding:16px; color:#EF4444; background:#FEF2F2; border-radius:8px;">⚠️ ${err.detail || 'Failed to load guards register. You must be an authorized Super Guard for this site.'}</div>`;
      }
      return;
    }

    const data = await res.json();
    const guards = data.stationed_guards || data.guards || [];

    if (siteTitle && data.site_name) {
      siteTitle.innerText = data.site_name;
    }

    if (countLabel) {
      const onDuty = guards.filter(g => g.is_clocked_in).length;
      countLabel.innerText = `${guards.length} Stationed Guards (${onDuty} currently on duty)`;
    }

    if (!guards || guards.length === 0) {
      if (container) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🛡️</div>
            <div style="font-weight:700; color:#1E293B; margin-bottom:4px;">No other guards stationed here today</div>
            <div style="font-size:12px; color:#64748B;">All guards rostered to ${data.site_name || 'this site'} will appear here.</div>
          </div>
        `;
      }
      return;
    }

    if (container) {
      container.innerHTML = guards.map(g => {
        const statusBadge = g.is_clocked_in
          ? `<span class="status-badge active" style="font-size:11px;">🟢 ON DUTY (${g.clock_in_time ? g.clock_in_time.substring(11, 16) : ''})</span>`
          : `<span class="status-badge warning" style="font-size:11px;">🟡 NOT CLOCKED IN</span>`;

        const actionButton = g.is_clocked_in
          ? `<button class="btn-submit" style="width:auto; padding:6px 12px; font-size:12px; background:#DC2626;" onclick="superGuardClockOut(${g.guard_id}, '${escapeQuote(g.full_name)}')">🛑 Sign Out</button>`
          : `<button class="btn-submit" style="width:auto; padding:6px 12px; font-size:12px; background:#059669;" onclick="superGuardClockIn(${g.guard_id}, '${escapeQuote(g.full_name)}')">⏱️ Sign In (No Phone)</button>`;

        return `
          <div class="history-item" style="padding:14px; background:#FFFFFF; border:1px solid #E2E8F0; border-radius:10px; margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
              <div>
                <div style="font-weight:700; font-size:14px; color:#0F172A;">${g.full_name}</div>
                <div style="font-size:12px; color:#64748B;">Emp ID: <span style="font-family:monospace; font-weight:700; color:#3B5EDB;">${g.employee_number}</span> | 📞 ${g.phone_number || 'No Phone'}</div>
              </div>
              ${statusBadge}
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #F1F5F9; padding-top:8px; margin-top:6px;">
              <div style="font-size:11px; color:#64748B;">Shift: <strong>${g.shift_name || 'Unassigned'}</strong></div>
              <div>${actionButton}</div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    if (container) {
      container.innerHTML = `<div style="padding:16px; color:#EF4444;">Network error: ${err.message}</div>`;
    }
  }
}

function escapeQuote(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'");
}

async function superGuardClockIn(guardId, guardName) {
  if (!navigator.onLine) {
    alert('⚠️ Super Guard mandate actions on behalf of other guards require an active internet connection.');
    return;
  }
  const confirmMsg = `Authorize on-site duty clock-in for guard:

${guardName}

This confirms the guard is physically present on-site without a smartphone. Proceed?`;
  if (!confirm(confirmMsg)) return;

  try {
    const res = await apiFetch(`/attendance/super-guard/guards/${guardId}/clock-in`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) {
      alert(`⚠️ Could not clock in guard: ${data.detail || 'Request failed'}`);
      return;
    }
    alert(`✅ Guard ${guardName} successfully signed in on duty at ${data.clock_in_time || 'now'}!`);
    loadSuperGuardPortal();
  } catch (err) {
    alert('Clock-in error: ' + err.message);
  }
}

async function superGuardClockOut(guardId, guardName) {
  if (!navigator.onLine) {
    alert('⚠️ Super Guard mandate actions on behalf of other guards require an active internet connection.');
    return;
  }
  const confirmMsg = `Sign out guard ${guardName} from site duty?`;
  if (!confirm(confirmMsg)) return;

  try {
    const res = await apiFetch(`/attendance/super-guard/guards/${guardId}/clock-out`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) {
      alert(`⚠️ Could not clock out guard: ${data.detail || 'Request failed'}`);
      return;
    }
    alert(`✅ Guard ${guardName} signed out successfully! (Hours: ${data.regular_hours || 0} hrs, OT: ${data.overtime_hours || 0} hrs)`);
    loadSuperGuardPortal();
  } catch (err) {
    alert('Clock-out error: ' + err.message);
  }
}

// -------------------------------------------------------------
// 5. PROFILE SCREEN
// -------------------------------------------------------------
async function loadProfile() {
  try {
    const res = await apiFetch('/guard-portal/dashboard');
    if (!res.ok) return;

    const data = await res.json();
    document.getElementById('prof-full-name').innerText = data.full_name || '—';
    document.getElementById('prof-emp-num').innerText = data.employee_number || '—';
    document.getElementById('prof-site').innerText = data.today_shift ? (data.today_shift.site_name || 'Unassigned') : 'Unassigned';
    document.getElementById('prof-shift').innerText = data.today_shift ? (data.today_shift.shift_name || 'Unassigned') : 'Unassigned';

    // Also get current user info for email
    const meRes = await apiFetch('/auth/me');
    if (meRes.ok) {
      const me = await meRes.json();
      document.getElementById('prof-email').innerText = me.email || '—';
      document.getElementById('prof-phone').innerText = me.phone || '—';
    }

  } catch (err) {
    console.error('Profile load error:', err);
  }
}

// -------------------------------------------------------------
// 6. OFF DAYS MANAGEMENT FOR GUARDS
// -------------------------------------------------------------
function renderScheduledOffDays(data) {
  const listEl = document.getElementById('dash-off-days-list');
  const countBadge = document.getElementById('dash-off-days-count-badge');
  const monthText = document.getElementById('dash-off-days-month-text');
  const footerEl = document.getElementById('dash-off-days-footer');
  const supNameEl = document.getElementById('dash-off-days-sup-name');
  const notesEl = document.getElementById('dash-off-days-notes-text');
  const leaveListEl = document.getElementById('leave-scheduled-off-days-list');
  const leaveCountBadge = document.getElementById('leave-off-days-count-badge');

  if (!listEl) return;

  const count = data.off_days_count || 0;
  const monthName = data.off_days_month_name || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  if (monthText) monthText.innerText = monthName;

  if (countBadge) {
    countBadge.innerText = `${count} of 4 Days Scheduled`;
    if (count >= 4) {
      countBadge.style.background = '#ECFDF5';
      countBadge.style.color = '#065F46';
      countBadge.style.border = '1px solid #A7F3D0';
    } else if (count > 0) {
      countBadge.style.background = '#EEF2FF';
      countBadge.style.color = '#4338CA';
      countBadge.style.border = '1px solid #C7D2FE';
    } else {
      countBadge.style.background = '#FFFBEB';
      countBadge.style.color = '#B45309';
      countBadge.style.border = '1px solid #FDE68A';
    }
  }

  if (leaveCountBadge) {
    leaveCountBadge.innerText = `${count} of 4 Days Scheduled (${monthName})`;
  }

  const details = data.scheduled_off_days_details || [];
  if (!details || details.length === 0) {
    const emptyHtml = `
      <div style="background:#F8FAFC; border:1px dashed #CBD5E1; border-radius:10px; padding:16px; text-align:center;">
        <div style="font-size:24px; margin-bottom:4px;">🏖️</div>
        <div style="font-weight:600; font-size:13px; color:#475569;">No Off Days Scheduled Yet</div>
        <div style="font-size:11px; color:#94A3B8; margin-top:4px;">
          Your Field Supervisor will assign your 4 required monthly off days for ${monthName}.
        </div>
      </div>
    `;
    listEl.innerHTML = emptyHtml;
    if (leaveListEl) leaveListEl.innerHTML = emptyHtml;
    if (footerEl) footerEl.style.display = 'none';
    return;
  }

  const renderPills = () => details.map((item, idx) => {
    let badgeHtml = '';
    let cardBorder = 'border:1px solid #E2E8F0;';
    let cardBg = 'background:#FFFFFF;';

    if (item.status === 'TODAY') {
      badgeHtml = `<span class="status-badge" style="background:#10B981; color:#FFFFFF; font-weight:700; font-size:11px; padding:4px 8px; border-radius:6px; box-shadow:0 1px 3px rgba(16,185,129,0.3);">🏖️ TODAY • Off Duty</span>`;
      cardBorder = 'border:2px solid #10B981;';
      cardBg = 'background:#F0FDF4;';
    } else if (item.status === 'COMPLETED') {
      badgeHtml = `<span class="status-badge" style="background:#F1F5F9; color:#64748B; font-weight:600; font-size:11px; padding:4px 8px; border-radius:6px;">✓ Completed</span>`;
      cardBg = 'background:#F8FAFC;';
    } else {
      badgeHtml = `<span class="status-badge" style="background:#EEF2FF; color:#4338CA; font-weight:700; font-size:11px; padding:4px 8px; border-radius:6px; border:1px solid #C7D2FE;">⏳ Upcoming</span>`;
      cardBg = 'background:#FFFFFF;';
    }

    return `
      <div style="${cardBg} ${cardBorder} border-radius:10px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; transition: all 0.2s ease;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:28px; height:28px; border-radius:50%; background:#EEF2FF; color:#4338CA; font-weight:700; font-size:12px; display:flex; align-items:center; justify-content:center;">
            ${idx + 1}
          </div>
          <div>
            <div style="font-weight:700; font-size:13px; color:#1E293B;">
              ${item.formatted_date || item.off_date}
            </div>
            <div style="font-size:11px; color:#64748B;">
              ${item.notes || 'Mandatory Scheduled Rest Day'}
            </div>
          </div>
        </div>
        <div>
          ${badgeHtml}
        </div>
      </div>
    `;
  }).join('');

  listEl.innerHTML = renderPills();
  if (leaveListEl) leaveListEl.innerHTML = renderPills();

  if (data.off_days_supervisor_name || data.off_days_notes) {
    if (footerEl) {
      footerEl.style.display = 'block';
      if (supNameEl) {
        supNameEl.innerText = data.off_days_supervisor_name ? `Assigned by Field Supervisor: ${data.off_days_supervisor_name}` : 'Field Supervisor Assigned';
      }
      if (notesEl) {
        notesEl.innerText = data.off_days_notes ? `Note: "${data.off_days_notes}"` : '';
        notesEl.style.display = data.off_days_notes ? 'block' : 'none';
      }
    }
  } else if (footerEl) {
    footerEl.style.display = 'none';
  }
}

async function loadOffDayAllowance() {
  const labelEl = document.getElementById('off-day-allowance-label');
  const badgeEl = document.getElementById('off-day-remaining-badge');
  if (!labelEl) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  try {
    // 1. Fetch supervisor-scheduled off days for the leave tab
    try {
      const schedRes = await apiFetch(`/guard-portal/off-days?year=${year}&month=${month}`);
      if (schedRes.ok) {
        const schedData = await schedRes.json();
        const leaveListEl = document.getElementById('leave-scheduled-off-days-list');
        const leaveBadge = document.getElementById('leave-off-days-count-badge');
        if (leaveBadge) {
          leaveBadge.innerText = `${schedData.total_off_days || 0} of 4 Days Scheduled`;
        }
        if (leaveListEl) {
          const offDates = schedData.off_dates || [];
          if (offDates.length === 0) {
            leaveListEl.innerHTML = `
              <div style="background:#F8FAFC; border:1px dashed #CBD5E1; border-radius:10px; padding:16px; text-align:center;">
                <div style="font-size:24px; margin-bottom:4px;">🏖️</div>
                <div style="font-weight:600; font-size:13px; color:#475569;">No Off Days Scheduled Yet</div>
                <div style="font-size:11px; color:#94A3B8; margin-top:4px;">
                  Your Field Supervisor has not yet assigned your 4 required monthly off days for this month.
                </div>
              </div>
            `;
          } else {
            const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            leaveListEl.innerHTML = offDates.map((dStr, idx) => {
              const dObj = new Date(dStr + 'T00:00:00');
              const fmt = dObj.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
              let bHtml = '';
              let cBorder = 'border:1px solid #E2E8F0;';
              let cBg = 'background:#FFFFFF;';
              if (dStr === todayStr) {
                bHtml = '<span class="status-badge" style="background:#10B981; color:#fff; font-weight:700;">🏖️ TODAY • Off Duty</span>';
                cBorder = 'border:2px solid #10B981;';
                cBg = 'background:#F0FDF4;';
              } else if (dStr < todayStr) {
                bHtml = '<span class="status-badge" style="background:#F1F5F9; color:#64748B;">✓ Completed</span>';
                cBg = 'background:#F8FAFC;';
              } else {
                bHtml = '<span class="status-badge" style="background:#EEF2FF; color:#4338CA; font-weight:700; border:1px solid #C7D2FE;">⏳ Upcoming</span>';
              }
              return `
                <div style="${cBg} ${cBorder} border-radius:10px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
                  <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:28px; height:28px; border-radius:50%; background:#EEF2FF; color:#4338CA; font-weight:700; font-size:12px; display:flex; align-items:center; justify-content:center;">
                      ${idx + 1}
                    </div>
                    <div>
                      <div style="font-weight:700; font-size:13px; color:#1E293B;">${fmt}</div>
                      <div style="font-size:11px; color:#64748B;">${schedData.notes || 'Mandatory Scheduled Rest Day'}</div>
                    </div>
                  </div>
                  <div>${bHtml}</div>
                </div>
              `;
            }).join('');
          }
        }
      }
    } catch (e) {
      console.warn('Could not load supervisor off-days for leave tab:', e);
    }

    const res = await apiFetch(`/off-days/allowances?year=${year}&month=${month}`);
    if (!res.ok) return;
    const allowances = await res.json();
    const myAllow = allowances.length > 0 ? allowances[0] : null;

    const totalAllowed = myAllow ? myAllow.days_allowed : 0;

    const reqRes = await apiFetch('/off-days/requests');
    let usedCount = 0;
    if (reqRes.ok) {
      const myReqs = await reqRes.json();
      myReqs.forEach(r => {
        if (r.status !== 'REJECTED') {
          usedCount += r.days_count;
        }
      });
    }

    const remaining = Math.max(0, totalAllowed - usedCount);
    const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    labelEl.innerText = `${totalAllowed} Days Allowed (${monthName})`;
    if (badgeEl) {
      badgeEl.innerText = `Remaining: ${remaining} of ${totalAllowed} days`;
    }
  } catch (err) {
    console.error('loadOffDayAllowance error:', err);
  }
}

async function handleOffDaySubmit(event) {
  event.preventDefault();
  const alertEl = document.getElementById('off-day-alert-banner');
  const successEl = document.getElementById('off-day-success-banner');
  if (alertEl) alertEl.style.display = 'none';
  if (successEl) successEl.style.display = 'none';

  const startDate = document.getElementById('off-day-start-date').value;
  const endDate = document.getElementById('off-day-end-date').value;

  if (!startDate || !endDate) {
    if (alertEl) {
      alertEl.innerText = '⚠️ Please select start and end dates.';
      alertEl.style.display = 'block';
    }
    return;
  }

  if (new Date(endDate) < new Date(startDate)) {
    if (alertEl) {
      alertEl.innerText = '⚠️ End date cannot be before start date.';
      alertEl.style.display = 'block';
    }
    return;
  }

  if (!navigator.onLine) {
    if (alertEl) {
      alertEl.innerText = '⚠️ Off-day requests require an active internet connection for allowance validation.';
      alertEl.style.display = 'block';
    }
    return;
  }

  try {
    const res = await apiFetch('/off-days/requests', {
      method: 'POST',
      body: JSON.stringify({ start_date: startDate, end_date: endDate })
    });

    const data = await res.json();
    if (!res.ok) {
      if (alertEl) {
        alertEl.innerText = `⚠️ ${data.detail || 'Failed to submit off-day request'}`;
        alertEl.style.display = 'block';
      }
      return;
    }

    if (successEl) {
      successEl.innerHTML = `✅ <strong>Off-day request submitted!</strong> Status: <strong>PENDING_REVIEW</strong>.`;
      successEl.style.display = 'block';
    }
    document.getElementById('off-day-form').reset();
    loadOffDayAllowance();
    loadMyOffDayRequests();
  } catch (err) {
    if (alertEl) {
      alertEl.innerText = '⚠️ Network error or server unreachable.';
      alertEl.style.display = 'block';
    }
  }
}

async function loadMyOffDayRequests() {
  const container = document.getElementById('off-day-history-list');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center; padding:12px; color:#64748B;">Loading off-day requests...</div>';

  try {
    const res = await apiFetch('/off-days/requests');
    if (!res.ok) return;

    const reqs = await res.json();
    if (!reqs || reqs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🗓️</div>
          <div style="font-weight:700; color:#1E293B; margin-bottom:4px;">No off-day requests</div>
          <div style="font-size:12px; color:#64748B;">Use the form above to select your off days.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = reqs.map(item => `
      <div class="history-item">
        <div class="history-header">
          <span class="history-title">Off Days (${item.days_count} day${item.days_count > 1 ? 's' : ''})</span>
          <span class="status-badge ${item.status ? item.status.toLowerCase() : 'pending'}">${item.status}</span>
        </div>
        <div class="history-date">📅 ${item.start_date} to ${item.end_date}</div>
        ${item.rejection_reason ? `<div class="history-desc" style="color:#EF4444;">Reason: ${item.rejection_reason}</div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    console.error('loadMyOffDayRequests error:', err);
  }
}

window.loadOffDayAllowance = loadOffDayAllowance;
window.handleOffDaySubmit = handleOffDaySubmit;
window.loadMyOffDayRequests = loadMyOffDayRequests;




// -------------------------------------------------------------
// ANONYMOUS GUARD REPORTING PIPELINE
// -------------------------------------------------------------
function updateAnonCharCounter(textarea) {
  const counter = document.getElementById('anon-char-count');
  if (counter) {
    const len = (textarea.value || '').length;
    counter.innerText = `${len} / 5000`;
  }
}

async function submitAnonymousTip(e) {
  if (e) e.preventDefault();
  const msgInput = document.getElementById('anon-tip-message');
  const alertEl = document.getElementById('anon-tip-alert');
  const btn = document.getElementById('btn-submit-anon-tip');
  const btnText = document.getElementById('btn-anon-text');
  const btnSpinner = document.getElementById('btn-anon-spinner');

  if (!msgInput) return;
  const rawMsg = (msgInput.value || '').trim();
  if (rawMsg.length < 5) {
    if (alertEl) {
      alertEl.style.display = 'block';
      alertEl.style.background = '#FEE2E2';
      alertEl.style.color = '#991B1B';
      alertEl.innerText = '⚠️ Please enter at least 5 characters for your report.';
    }
    return;
  }

  if (!navigator.onLine) {
    if (alertEl) {
      alertEl.style.display = 'block';
      alertEl.style.background = '#FEF3C7';
      alertEl.style.color = '#92400E';
      alertEl.innerText = '🔒 For your privacy, anonymous reports are never stored offline on your phone. Please reconnect to mobile data or Wi-Fi to transmit directly.';
    }
    return;
  }

  if (btn) btn.disabled = true;
  if (btnText) btnText.style.display = 'none';
  if (btnSpinner) btnSpinner.style.display = 'inline';
  if (alertEl) alertEl.style.display = 'none';

  try {
    const res = await apiFetch('/anonymous-reporting/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: rawMsg })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || 'Failed to submit report.');
    }
    msgInput.value = '';
    const counter = document.getElementById('anon-char-count');
    if (counter) counter.innerText = '0 / 5000';

    if (alertEl) {
      alertEl.style.display = 'block';
      alertEl.style.background = '#DEF7EC';
      alertEl.style.color = '#03543F';
      alertEl.innerHTML = '✅ <strong>Report Transmitted:</strong> ' + (data.message || 'Your anonymous report has been securely delivered to System Administration with zero identifying logs.');
    }
  } catch (err) {
    if (alertEl) {
      alertEl.style.display = 'block';
      alertEl.style.background = '#FEE2E2';
      alertEl.style.color = '#991B1B';
      alertEl.innerText = '❌ Error: ' + (err.message || 'Transmission failed.');
    }
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.style.display = 'inline';
    if (btnSpinner) btnSpinner.style.display = 'none';
  }
}

window.updateAnonCharCounter = updateAnonCharCounter;
window.submitAnonymousTip = submitAnonymousTip;

// =============================================================
// 7. PHASE 1 OFFLINE OUTBOX ENGINE (IndexedDB + FIFO Sync + Photo Compression)
// =============================================================
const OUTBOX_DB_NAME = 'corpsec_guard_outbox_v1';
const OUTBOX_STORE_NAME = 'outbox';
const MAX_OUTBOX_ITEMS_PER_GUARD = 50;
let outboxSyncInFlight = false;
let outboxBackoffTimer = null;

function generateClientUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getCurrentGuardOwnerKey() {
  const user = getStoredUser();
  if (!user) return null;
  if (user.guard_id) return `guard_${user.guard_id}`;
  if (user.user_id) return `user_${user.user_id}`;
  if (user.email) return `email_${user.email}`;
  return null;
}

function updateCachedClockState(userId, isClockedIn) {
  if (!userId) return;
  try {
    const snap = getCachedShiftSnapshot(userId);
    if (snap && snap.today_shift) {
      snap.today_shift.is_clocked_in = !!isClockedIn;
      localStorage.setItem(`guard_home_shift_v1_${userId}`, JSON.stringify(snap));
    }
  } catch (e) {}
}

function openGuardOutboxDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser'));
      return;
    }
    const req = indexedDB.open(OUTBOX_DB_NAME, 1);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE_NAME)) {
        const store = db.createObjectStore(OUTBOX_STORE_NAME, { keyPath: 'client_uuid' });
        store.createIndex('by_owner_key', 'owner_key', { unique: false });
        store.createIndex('by_created_at', 'created_at_ms', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open offline outbox database'));
  });
}

async function getGuardOutboxItems() {
  const ownerKey = getCurrentGuardOwnerKey();
  if (!ownerKey) return [];
  try {
    const db = await openGuardOutboxDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE_NAME, 'readonly');
      const store = tx.objectStore(OUTBOX_STORE_NAME);
      const index = store.index('by_owner_key');
      const req = index.getAll(IDBKeyRange.only(ownerKey));
      req.onsuccess = () => {
        const items = Array.isArray(req.result) ? req.result : [];
        items.sort((a, b) => (a.created_at_ms || 0) - (b.created_at_ms || 0));
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('getGuardOutboxItems warning:', e);
    return [];
  }
}

async function getUnsyncedCountForCurrentGuard() {
  const items = await getGuardOutboxItems();
  return items.filter((i) => i.status !== 'synced').length;
}

async function findLatestQueuedClockInForCurrentGuard() {
  const items = await getGuardOutboxItems();
  const clockIns = items.filter((i) => i.action_type === 'CLOCK_IN' && i.status !== 'synced');
  return clockIns.length > 0 ? clockIns[clockIns.length - 1] : null;
}

async function enqueueGuardOutboxItem(itemSpec) {
  const ownerKey = getCurrentGuardOwnerKey();
  const user = getStoredUser() || {};
  if (!ownerKey) {
    alert('Please sign in first before performing this action.');
    return false;
  }

  try {
    const existingItems = await getGuardOutboxItems();
    const unsynced = existingItems.filter((i) => i.status !== 'synced');
    if (unsynced.length >= MAX_OUTBOX_ITEMS_PER_GUARD) {
      alert(`⚠️ Offline Queue Full (${MAX_OUTBOX_ITEMS_PER_GUARD} items):\n\nYour phone has reached the maximum number of unsynced offline actions. Please connect to mobile data or Wi-Fi to sync existing items first.`);
      return false;
    }

    const record = {
      client_uuid: itemSpec.client_uuid || generateClientUuid(),
      owner_key: ownerKey,
      guard_id: user.guard_id || null,
      user_id: user.user_id || null,
      action_type: itemSpec.action_type,
      label: itemSpec.label || itemSpec.action_type,
      payload: itemSpec.payload || {},
      gps: itemSpec.gps || null,
      photo_blob: itemSpec.photo_blob || null,
      photo_name: itemSpec.photo_name || null,
      photo_status: itemSpec.photo_status || 'none',
      remote_incident_id: null,
      parent_client_uuid: itemSpec.parent_client_uuid || null,
      device_timestamp: itemSpec.device_timestamp || new Date().toISOString(),
      clock_skew_ms: itemSpec.clock_skew_ms || 0,
      status: 'pending', // pending | sending | failed | synced
      permanent_failure: false,
      retry_count: 0,
      next_retry_at: 0,
      last_error: null,
      created_at_ms: Date.now(),
    };

    const db = await openGuardOutboxDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE_NAME, 'readwrite');
      tx.objectStore(OUTBOX_STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    await renderOutboxQueueUi();
    requestBackgroundSyncRegistration();
    return true;
  } catch (err) {
    const isQuota = err && (err.name === 'QuotaExceededError' || String(err.message || '').toLowerCase().includes('quota'));
    if (isQuota) {
      alert('⚠️ Device Storage Full (IndexedDB Quota Exceeded):\n\nYour phone does not have enough free browser storage to save this item offline. Please free up storage or connect to the internet to sync pending items.');
    } else {
      alert('⚠️ Could not save action to offline outbox: ' + (err.message || 'Storage error'));
    }
    return false;
  }
}

async function putGuardOutboxRecord(record) {
  const db = await openGuardOutboxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE_NAME, 'readwrite');
    tx.objectStore(OUTBOX_STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteGuardOutboxRecord(clientUuid) {
  const db = await openGuardOutboxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE_NAME, 'readwrite');
    tx.objectStore(OUTBOX_STORE_NAME).delete(clientUuid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function compressIncidentPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read selected photo file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Selected file is not a valid image.'));
      img.onload = () => {
        const maxDim = 1280;
        let width = img.width || 800;
        let height = img.height || 600;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Photo compression failed on this device.'));
              return;
            }
            resolve(blob);
          },
          'image/jpeg',
          0.74
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadCompressedIncidentPhoto(incidentId, photoBlob, photoName = 'incident_photo.jpg') {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', photoBlob, photoName);

  const res = await fetch(`${API_BASE}/guard-portal/incidents/${incidentId}/photo`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (res.status === 409) {
    // Photo already uploaded on an earlier attempt — treat as idempotent success
    return true;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.detail || `Photo upload failed (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  return true;
}

async function flushGuardOutbox(triggerSource = 'manual') {
  if (outboxSyncInFlight || !navigator.onLine) {
    await renderOutboxQueueUi();
    return;
  }
  const token = getToken();
  const ownerKey = getCurrentGuardOwnerKey();
  if (!token || !ownerKey) return;

  const items = await getGuardOutboxItems();
  const actionable = items.filter((i) => i.status === 'pending' || (i.status === 'failed' && !i.permanent_failure));
  if (actionable.length === 0) {
    await renderOutboxQueueUi();
    return;
  }

  outboxSyncInFlight = true;
  if (outboxBackoffTimer) {
    clearTimeout(outboxBackoffTimer);
    outboxBackoffTimer = null;
  }

  let syncedAny = false;
  let encounteredTempFailure = false;
  let nextBackoffDelayMs = 2000;

  try {
    for (const item of actionable) {
      if (!navigator.onLine) break;

      // If this is a CLOCK_OUT whose parent CLOCK_IN failed permanently, mark orphaned reason explicitly
      if (item.action_type === 'CLOCK_OUT' && item.parent_client_uuid) {
        const latestItems = await getGuardOutboxItems();
        const parentItem = latestItems.find((x) => x.client_uuid === item.parent_client_uuid);
        if (parentItem && parentItem.status === 'failed' && parentItem.permanent_failure) {
          item.payload.orphaned_clock_in_reason = `Parent offline clock-in failed: ${parentItem.last_error || 'Validation error'}`;
        }
      }

      item.status = 'sending';
      await putGuardOutboxRecord(item);
      await renderOutboxQueueUi();

      try {
        await sendSingleOutboxItem(item);
        item.status = 'synced';
        item.last_error = null;
        await putGuardOutboxRecord(item);
        await renderOutboxQueueUi();
        syncedAny = true;

        // Clear synced item promptly from IndexedDB
        setTimeout(() => {
          deleteGuardOutboxRecord(item.client_uuid).then(() => renderOutboxQueueUi()).catch(() => {});
        }, 1800);
      } catch (err) {
        if (err.status === 401) {
          // Expired token: pause without losing queue, ask guard to sign back in
          item.status = 'pending';
          item.last_error = 'Session expired — sign in again to finish syncing';
          await putGuardOutboxRecord(item);
          const remaining = await getUnsyncedCountForCurrentGuard();
          clearToken();
          resetPortalDomState();
          showLoginView(`Session expired. Please sign in again to sync ${remaining} saved offline item(s).`, 'danger');
          return;
        }

        if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
          // Permanent 4xx validation failure — mark "Failed - needs attention" with reason
          item.status = 'failed';
          item.permanent_failure = true;
          item.last_error = err.message || 'Failed - needs attention';
          await putGuardOutboxRecord(item);
          await renderOutboxQueueUi();
          showSyncNoticeBanner(`⚠️ Offline item failed — needs attention: ${item.last_error}`, 'danger');
          // Continue loop so dependent clock-outs can still be sent with orphaned_clock_in_reason
          continue;
        }

        // Network error or 5xx/429 -> exponential backoff, preserve FIFO order
        item.retry_count = (item.retry_count || 0) + 1;
        nextBackoffDelayMs = Math.min(2000 * Math.pow(2, item.retry_count - 1), 60000);
        item.status = 'pending';
        item.next_retry_at = Date.now() + nextBackoffDelayMs;
        item.last_error = `Temporary connection issue — retry #${item.retry_count} in ${Math.round(nextBackoffDelayMs / 1000)}s`;
        await putGuardOutboxRecord(item);
        await renderOutboxQueueUi();
        encounteredTempFailure = true;
        break;
      }
    }

    if (syncedAny) {
      showSyncNoticeBanner('✅ All queued offline actions synced to CorpSec server!', 'success');
      loadDashboard();
      loadIncidents();
    }
  } finally {
    outboxSyncInFlight = false;
    await renderOutboxQueueUi();
    if (encounteredTempFailure && navigator.onLine) {
      outboxBackoffTimer = setTimeout(() => flushGuardOutbox('backoff-retry'), nextBackoffDelayMs);
    }
  }
}

async function sendSingleOutboxItem(item) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let endpoint = '';
  if (item.action_type === 'CLOCK_IN') {
    endpoint = '/attendance/clock-in';
  } else if (item.action_type === 'CLOCK_OUT') {
    endpoint = '/attendance/clock-out';
  } else if (item.action_type === 'INCIDENT_REPORT') {
    endpoint = '/guard-portal/incidents';
  } else {
    const e = new Error(`Unsupported offline action type: ${item.action_type}`);
    e.status = 400;
    throw e;
  }

  // Step 1: Send JSON payload (unless incident text already succeeded and only photo remains)
  let responseData = null;
  if (!(item.action_type === 'INCIDENT_REPORT' && item.remote_incident_id)) {
    const bodyPayload = Object.assign({}, item.payload, { submitted_offline: true });
    let res;
    try {
      res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(bodyPayload),
      });
    } catch (netErr) {
      const e = new Error('Network unreachable');
      e.status = 0;
      throw e;
    }

    responseData = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = typeof responseData.detail === 'string'
        ? responseData.detail
        : (Array.isArray(responseData.detail) ? responseData.detail[0].msg : `HTTP ${res.status}`);
      const e = new Error(detail);
      e.status = res.status;
      throw e;
    }

    if (item.action_type === 'INCIDENT_REPORT' && responseData && responseData.id) {
      item.remote_incident_id = responseData.id;
      await putGuardOutboxRecord(item);
    }
  }

  // Step 2: If incident has a compressed photo blob pending upload, upload it after text record
  if (item.action_type === 'INCIDENT_REPORT' && item.photo_blob && item.photo_status !== 'uploaded') {
    const incId = item.remote_incident_id || (responseData && responseData.id);
    if (incId) {
      await uploadCompressedIncidentPhoto(incId, item.photo_blob, item.photo_name || 'incident_photo.jpg');
      item.photo_status = 'uploaded';
      item.photo_blob = null; // Free IndexedDB space immediately once photo is uploaded
      await putGuardOutboxRecord(item);
    }
  }
}

window.retryGuardOutboxItem = async function (clientUuid) {
  const items = await getGuardOutboxItems();
  const target = items.find((i) => i.client_uuid === clientUuid);
  if (!target) return;
  target.status = 'pending';
  target.permanent_failure = false;
  target.last_error = null;
  await putGuardOutboxRecord(target);
  await renderOutboxQueueUi();
  if (navigator.onLine) {
    flushGuardOutbox('manual-item-retry');
  } else {
    showSyncNoticeBanner('Item queued for retry as soon as connection returns.', 'info');
  }
};

window.removeFailedGuardOutboxItem = async function (clientUuid) {
  if (!confirm('Remove this failed item from your phone outbox?')) return;
  await deleteGuardOutboxRecord(clientUuid);
  await renderOutboxQueueUi();
};

window.toggleGuardOutboxDrawer = function () {
  const drawer = document.getElementById('portal-outbox-drawer');
  if (!drawer) return;
  drawer.hidden = !drawer.hidden;
};

function showSyncNoticeBanner(message, type = 'info') {
  const toastEl = document.getElementById('portal-sync-toast');
  if (!toastEl) return;
  toastEl.className = `portal-sync-toast toast-${type}`;
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(window.__portalSyncToastTimer);
  window.__portalSyncToastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 5500);
}

async function updateSyncStatusBarUi() {
  const pillEl = document.getElementById('portal-net-indicator');
  const lastUpdEl = document.getElementById('portal-last-updated-label');
  const storedUser = getStoredUser();
  const snap = storedUser ? getCachedShiftSnapshot(storedUser.user_id) : null;
  const updTime = snap && snap.last_updated_iso ? formatLastUpdatedLabel(snap.last_updated_iso) : '';

  if (pillEl) {
    if (navigator.onLine) {
      pillEl.className = 'net-status-pill online';
      pillEl.innerHTML = '🟢 Online';
    } else {
      pillEl.className = 'net-status-pill offline';
      pillEl.innerHTML = '📴 Offline';
    }
  }
  if (lastUpdEl) {
    if (!navigator.onLine && updTime) {
      lastUpdEl.textContent = `Offline — last updated ${updTime}`;
      lastUpdEl.hidden = false;
    } else if (updTime) {
      lastUpdEl.textContent = `Updated ${updTime}`;
      lastUpdEl.hidden = false;
    } else {
      lastUpdEl.hidden = true;
    }
  }
}

async function renderOutboxQueueUi() {
  await updateSyncStatusBarUi();
  const counterBtn = document.getElementById('portal-outbox-counter-btn');
  const listEl = document.getElementById('portal-outbox-list');
  const drawer = document.getElementById('portal-outbox-drawer');

  const items = await getGuardOutboxItems();
  const waitingCount = items.filter((i) => i.status !== 'synced').length;

  if (counterBtn) {
    if (waitingCount > 0) {
      counterBtn.hidden = false;
      counterBtn.textContent = `🔄 ${waitingCount} item${waitingCount > 1 ? 's' : ''} waiting to sync`;
    } else {
      counterBtn.hidden = true;
    }
  }

  if (!listEl) return;
  if (items.length === 0) {
    listEl.innerHTML = '<div style="font-size:12px; color:#64748B; text-align:center; padding:10px;">No offline items waiting to sync.</div>';
    if (drawer && waitingCount === 0) drawer.hidden = true;
    return;
  }

  listEl.innerHTML = items.map((item) => {
    const timeStr = formatLastUpdatedLabel(item.device_timestamp);
    let badge = '';
    if (item.status === 'pending') {
      badge = '<span class="outbox-badge pending">⏳ Saved on phone (Pending)</span>';
    } else if (item.status === 'sending') {
      badge = '<span class="outbox-badge sending">🔄 Sending...</span>';
    } else if (item.status === 'failed') {
      badge = '<span class="outbox-badge failed">⚠️ Failed — needs attention</span>';
    } else {
      badge = '<span class="outbox-badge synced">✅ Synced</span>';
    }

    const errHtml = item.last_error
      ? `<div class="outbox-item-error">${item.last_error}</div>`
      : '<div class="outbox-item-sub">Saved on this phone, not yet sent</div>';

    const actionsHtml = (item.status === 'failed' || item.status === 'pending')
      ? `<div class="outbox-item-actions">
           <button type="button" class="btn-outbox-retry" onclick="retryGuardOutboxItem('${item.client_uuid}')">Retry Now</button>
           ${item.status === 'failed' ? `<button type="button" class="btn-outbox-dismiss" onclick="removeFailedGuardOutboxItem('${item.client_uuid}')">Dismiss</button>` : ''}
         </div>`
      : '';

    return `
      <div class="outbox-item-card">
        <div class="outbox-item-top">
          <strong>${item.label}</strong>
          ${badge}
        </div>
        <div class="outbox-item-meta">Recorded at ${timeStr || item.device_timestamp}</div>
        ${errHtml}
        ${actionsHtml}
      </div>
    `;
  }).join('');
}

window.handleIncidentPhotoSelect = function (inputEl) {
  const previewWrap = document.getElementById('incident-photo-preview-wrap');
  const previewName = document.getElementById('incident-photo-preview-name');
  if (!inputEl || !inputEl.files || !inputEl.files[0]) {
    clearIncidentPhotoPreview();
    return;
  }
  const f = inputEl.files[0];
  if (previewWrap && previewName) {
    const kb = Math.round(f.size / 1024);
    previewName.textContent = `📷 ${f.name} (${kb} KB — will be compressed on phone before upload)`;
    previewWrap.style.display = 'flex';
  }
};

function clearIncidentPhotoPreview() {
  const inputEl = document.getElementById('incident-photo');
  const previewWrap = document.getElementById('incident-photo-preview-wrap');
  if (inputEl) inputEl.value = '';
  if (previewWrap) previewWrap.style.display = 'none';
}
window.clearIncidentPhotoPreview = clearIncidentPhotoPreview;
window.flushGuardOutbox = flushGuardOutbox;
