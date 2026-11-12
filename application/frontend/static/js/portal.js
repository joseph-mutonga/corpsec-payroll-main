/* CorpSec Guard Mobile Portal JavaScript Module */

const API_BASE = '/api/v1';
const INSTALL_DISMISSED_KEY = 'corpsec_guard_install_dismissed_v2';
let deferredInstallPrompt = null;

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

function clearToken() {
  sessionStorage.removeItem('guard_auth_token');
  sessionStorage.removeItem('guard_user');
  localStorage.removeItem('guard_auth_token');
  localStorage.removeItem('guard_user');
}

function getStoredUser() {
  const data = sessionStorage.getItem('guard_user') || localStorage.getItem('guard_user');
  return data ? JSON.parse(data) : null;
}

// REST API Fetch Wrapper
async function apiFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  const token = getToken();
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }
  if (!options.headers['Content-Type'] && options.body && typeof options.body === 'string') {
    options.headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${endpoint}`, options);
  
  if (res.status === 401) {
    clearToken();
    showLoginView('Session expired. Please log in again.');
    throw new Error('Unauthorized');
  }

  return res;
}

function registerPortalServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('/portal-sw.js', { scope: '/', updateViaCache: 'none' })
    .then(() => {
      console.log('CorpSec Guard Portal PWA: Service worker registered');
    })
    .catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
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
  registerPortalServiceWorker();
  setupInstallPrompt();

  const token = getToken();
  if (token) {
    showPortalView();
    switchPortalTab('home');
  } else {
    window.location.href = '/';
  }
});

// View Toggle Helpers
function showLoginView(alertMessage = null) {
  // Redirect to the unified login page at index.html.
  // Append optional alert message as a query param so the login page can surface it.
  clearToken();
  const url = alertMessage
    ? `/?alert=${encodeURIComponent(alertMessage)}`
    : '/';
  window.location.replace(url);
}

function showPortalView() {
  document.body.classList.add('portal-logged-in');
  document.getElementById('portal-header').style.display = 'flex';
  document.getElementById('portal-bottom-nav').style.display = 'flex';
  document.getElementById('portal-main').style.display = 'block';

  const user = getStoredUser();
  if (user && user.email) {
    document.getElementById('header-guard-name').innerText = user.email.split('@')[0].replace('.', ' ').toUpperCase();
  }
}


function logoutGuard() {
  clearToken();
  // Redirect to the unified login page on logout.
  window.location.replace('/');
}

window.addEventListener('popstate', () => {
  if (!getToken()) {
    showLoginView('Logged out successfully.');
  }
});

/// Tab Switching Handler
function switchPortalTab(tabName) {
  if (!getToken()) {
    showLoginView('Session expired. Please log in again.');
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
  try {
    const res = await apiFetch('/guard-portal/dashboard');
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const clockStatus = document.getElementById('dash-clock-status');
      if (clockStatus) {
        clockStatus.className = 'status-badge danger';
        clockStatus.innerText = '⚠️ Error Loading Dashboard';
      }
      console.error('Dashboard load failed:', errData);
      return;
    }

    const data = await res.json();
    
    // Header & User badge
    if (data.full_name) {
      document.getElementById('header-guard-name').innerText = data.full_name.toUpperCase();
    }
    document.getElementById('dash-emp-num').innerText = data.employee_number || '--';
    
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
        clockStatus.innerText = '⚪ Day Off (No Shift Scheduled)';
        clockBtn.className = 'btn-clock clock-in';
        clockBtn.innerHTML = '▶ Clock In (Unrostered)';
        clockBtn.onclick = () => handleClockIn(null);
      }
    } else {
      document.getElementById('dash-site-name').innerText = shift.site_name || 'Assigned Site';
      document.getElementById('dash-shift-name').innerText = `${shift.shift_name || 'Day Shift'} (${shift.start_time || '06:00 AM'} - ${shift.end_time || '06:00 PM'})`;

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

  } catch (err) {
    console.error('Dashboard load error:', err);
    const clockStatus = document.getElementById('dash-clock-status');
    if (clockStatus) {
      clockStatus.className = 'status-badge danger';
      clockStatus.innerText = '⚠️ Network Error';
    }
  }
}

async function handleClockIn(shiftId) {
  const clockBtn = document.getElementById('btn-clock-action');
  const originalText = clockBtn ? clockBtn.innerHTML : 'Clock In';

  if (!navigator.geolocation) {
    alert('📍 Geolocation is not supported by your device browser.\n\nGuards without GPS-capable smartphones must be signed in by the Site Super Guard.');
    return;
  }

  if (clockBtn) {
    clockBtn.disabled = true;
    clockBtn.innerHTML = '📡 Acquiring GPS Location...';
  }

  const geoOptions = {
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0
  };

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = Math.round(position.coords.accuracy || 0);

        if (clockBtn) clockBtn.innerHTML = '⏳ Verifying Site Geofence...';

        let url = `/attendance/clock-in?latitude=${lat}&longitude=${lng}`;
        if (shiftId) url += `&shift_id=${shiftId}`;

        const res = await apiFetch(url, { method: 'POST' });
        const data = await res.json();

        if (!res.ok) {
          const errMsg = data.detail || 'Clock-in rejected';
          const isGeofenceErr = errMsg.toLowerCase().includes('metres away') || errMsg.toLowerCase().includes('radius') || errMsg.toLowerCase().includes('geofence');
          if (isGeofenceErr) {
            alert(`❌ Clock-In Failed (Geofence Check):\n\n${errMsg}\n\nNote: If you do not have a smartphone or device GPS is inaccurate, please request your Site Super Guard to clock you in.`);
          } else {
            alert(`❌ Clock-In Failed:\n\n${errMsg}`);
          }
          return;
        }

        alert(`✅ Clocked In Successfully!\n\nDevice GPS verified within site perimeter (Accuracy: ±${accuracy}m). Have a safe shift!`);
        loadDashboard();
      } catch (err) {
        alert('Network or clock-in error: ' + err.message);
      } finally {
        if (clockBtn) {
          clockBtn.disabled = false;
          clockBtn.innerHTML = originalText;
        }
      }
    },
    (err) => {
      if (clockBtn) {
        clockBtn.disabled = false;
        clockBtn.innerHTML = originalText;
      }
      let explanation = 'Could not acquire GPS position.';
      if (err.code === 1) explanation = 'GPS location permission was denied. Please allow location access in your browser settings to verify you are within 200m of the site.';
      else if (err.code === 2) explanation = 'GPS position unavailable. Please ensure your device location/GPS is switched ON.';
      else if (err.code === 3) explanation = 'GPS request timed out. Please try again with clear sky or Wi-Fi visibility.';

      alert(`📍 GPS Verification Required:\n\n${explanation}\n\nGuards stationed at this site without a smartphone can be clocked in directly by their Site Super Guard.`);
    },
    geoOptions
  );
}

async function handleClockOut() {
  try {
    const res = await apiFetch('/attendance/clock-out', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.detail || 'Clock-out failed');
      return;
    }
    alert(`✅ Clocked out successfully! (Hours: ${data.regular_hours} hrs, OT: ${data.overtime_hours} hrs)`);
    loadDashboard();
  } catch (err) {
    alert('Clock-out error: ' + err.message);
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
// 3. INCIDENT REPORTING SCREEN
// -------------------------------------------------------------
async function handleIncidentSubmit(event) {
  event.preventDefault();
  const alertEl = document.getElementById('incident-alert-banner');
  const successEl = document.getElementById('incident-success-banner');
  if (alertEl) alertEl.style.display = 'none';
  if (successEl) successEl.style.display = 'none';

  const incidentType = document.getElementById('incident-type').value;
  const description = document.getElementById('incident-desc').value.trim();

  // Validation: Short description check
  if (!description || description.length < 5) {
    showIncidentError('Incident description must be at least 5 characters long.');
    return;
  }

  try {
    const res = await apiFetch('/guard-portal/incidents', {
      method: 'POST',
      body: JSON.stringify({
        incident_type: incidentType,
        description: description
      })
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = typeof data.detail === 'string' ? data.detail : (Array.isArray(data.detail) ? data.detail[0].msg : 'Failed to submit incident report.');
      showIncidentError(msg);
      return;
    }

    if (successEl) {
      successEl.style.display = 'block';
      successEl.innerHTML = `✅ <strong>Incident Reported Successfully!</strong><br>Reference Number: <span style="font-family:monospace; font-size:16px; font-weight:800;">${data.reference_number || 'INC-0001'}</span>`;
    }

    document.getElementById('incident-form').reset();
    loadIncidents();

  } catch (err) {
    showIncidentError('Network error or server unreachable.');
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
              <div style="font-size:11px; color:#64748B;">Shift: <strong>${g.shift_name || 'Day Shift'}</strong></div>
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
    document.getElementById('prof-full-name').innerText = data.full_name || 'Guard Name';
    document.getElementById('prof-emp-num').innerText = data.employee_number || 'CS-00400';
    document.getElementById('prof-site').innerText = data.today_shift ? data.today_shift.site_name : 'Primary Site';
    document.getElementById('prof-shift').innerText = data.today_shift ? data.today_shift.shift_name : 'Shift Roster';

    // Also get current user info for email
    const meRes = await apiFetch('/auth/me');
    if (meRes.ok) {
      const me = await meRes.json();
      document.getElementById('prof-email').innerText = me.email || 'guard@corpsec.co.ke';
      document.getElementById('prof-phone').innerText = me.phone || '0700000000';
    }

  } catch (err) {
    console.error('Profile load error:', err);
  }
}

// -------------------------------------------------------------
// 6. OFF DAYS MANAGEMENT FOR GUARDS
// -------------------------------------------------------------
async function loadOffDayAllowance() {
  const labelEl = document.getElementById('off-day-allowance-label');
  const badgeEl = document.getElementById('off-day-remaining-badge');
  if (!labelEl) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  try {
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
