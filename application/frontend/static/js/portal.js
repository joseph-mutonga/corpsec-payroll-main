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
  const tabs = ['home', 'leave', 'incidents', 'payslips', 'profile'];
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
  else if (tabName === 'payslips') loadPayslips();
  else if (tabName === 'profile') loadProfile();
}

// -------------------------------------------------------------
// 1. HOME SCREEN & DASHBOARD
// -------------------------------------------------------------
let currentShiftId = null;
let latestPayrollRecordId = null;

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

    // Pay Info
    if (data.latest_pay_period) {
      document.getElementById('dash-pay-period').innerText = data.latest_pay_period;
      document.getElementById('dash-net-pay').innerText = `KES ${(data.latest_net_pay || 0).toLocaleString('en-KE', {minimumFractionDigits:2})}`;
    } else {
      document.getElementById('dash-pay-period').innerText = 'No Payroll Run Yet';
      document.getElementById('dash-net-pay').innerText = 'KES 0.00';
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
  try {
    const url = shiftId ? `/attendance/clock-in?shift_id=${shiftId}` : '/attendance/clock-in';
    const res = await apiFetch(url, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.detail || 'Clock-in failed');
      return;
    }
    alert('✅ Clocked in successfully!');
    loadDashboard();
  } catch (err) {
    alert('Clock-in error: ' + err.message);
  }
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

async function downloadLatestPayslip() {
  try {
    const endpoint = latestPayrollRecordId ? `/payslips/${latestPayrollRecordId}/pdf` : '/payslips/my-latest/pdf';
    const res = await apiFetch(endpoint);
    if (!res.ok) {
      alert('Latest confirmed payslip PDF is not yet available for download.');
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Payslip_My_Latest.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    alert('Could not download payslip PDF.');
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
// 4. PAYSLIPS SCREEN
// -------------------------------------------------------------
let currentGuardPayslips = [];

async function loadPayslips() {
  const container = document.getElementById('payslip-history-list');
  container.innerHTML = '<div style="text-align:center; padding:16px; color:#64748B;">Loading payslips...</div>';

  try {
    const res = await apiFetch('/portal/payslips');
    if (!res.ok) return;

    currentGuardPayslips = await res.json();

    if (!currentGuardPayslips || currentGuardPayslips.length === 0) {
      // Empty state for latest card
      document.getElementById('latest-payslip-period').innerText = 'No Payroll Run Yet';
      document.getElementById('latest-payslip-gross').innerText = 'KES 0.00';
      document.getElementById('latest-payslip-net').innerText = 'KES 0.00';
      document.getElementById('latest-payslip-actions').style.display = 'none';

      // Empty state for history list
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📄</div>
          <div style="font-weight:700; color:#1E293B; margin-bottom:4px;">No payslips yet</div>
          <div style="font-size:12px; color:#64748B;">Your first payslip will appear here after payroll is processed.</div>
        </div>
      `;
      return;
    }

    // Prominent Latest Payslip (first item in array)
    const latest = currentGuardPayslips[0];
    document.getElementById('latest-payslip-period').innerText = latest.period_name || 'Current Month';
    document.getElementById('latest-payslip-gross').innerText = `KES ${latest.gross_pay.toLocaleString('en-KE', {minimumFractionDigits:2})}`;
    document.getElementById('latest-payslip-net').innerText = `KES ${latest.net_pay.toLocaleString('en-KE', {minimumFractionDigits:2})}`;
    document.getElementById('latest-payslip-actions').style.display = 'flex';

    // Payslip History (all payslips, most recent first)
    container.innerHTML = currentGuardPayslips.map(item => `
      <div class="history-item" style="flex-direction:row; align-items:center; justify-content:space-between; padding:14px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="font-size:24px;">📄</div>
          <div>
            <div style="font-weight:700; font-size:14px; color:#0F172A;">${item.period_name} Payslip</div>
            <div style="font-size:12px; color:#64748B;">Gross: KES ${item.gross_pay.toLocaleString('en-KE', {minimumFractionDigits:2})} | Net: <strong style="color:#059669;">KES ${item.net_pay.toLocaleString('en-KE', {minimumFractionDigits:2})}</strong></div>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn-submit" style="width:auto; padding:6px 12px; font-size:12px; background:#2563EB;" onclick="viewPayslipPdf(${item.payroll_record_id})">👁️ View</button>
          <button class="btn-submit" style="width:auto; padding:6px 12px; font-size:12px; background:#059669;" onclick="downloadPayslipPdf(${item.payroll_record_id}, '${item.period_name.replace(/ /g, '_')}')">⬇️ PDF</button>
        </div>
      </div>
    `).join('');

  } catch (err) {
    container.innerHTML = '<div style="color:#EF4444; padding:16px;">Failed to load payslips.</div>';
  }
}

async function viewPayslipPdf(id) {
  const recId = id || (currentGuardPayslips.length > 0 ? currentGuardPayslips[0].payroll_record_id : null);
  if (!recId) {
    alert('No payslip available to view.');
    return;
  }
  try {
    const res = await apiFetch(`/portal/payslips/${recId}/pdf`);
    if (!res.ok) {
      alert('Unauthorized or payslip PDF not available.');
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch (err) {
    alert('Could not view payslip PDF.');
  }
}

async function downloadPayslipPdf(id, periodStr) {
  const recId = id || (currentGuardPayslips.length > 0 ? currentGuardPayslips[0].payroll_record_id : null);
  if (!recId) {
    alert('No payslip available to download.');
    return;
  }
  try {
    const res = await apiFetch(`/portal/payslips/${recId}/pdf`);
    if (!res.ok) {
      alert('Unauthorized or payslip PDF not available.');
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Payslip_${periodStr || 'Month'}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    alert('Could not download payslip PDF.');
  }
}

function viewLatestPayslipPdf() {
  if (currentGuardPayslips.length > 0) {
    viewPayslipPdf(currentGuardPayslips[0].payroll_record_id);
  } else {
    alert('No payslip available yet.');
  }
}

function downloadLatestPayslipPdf() {
  if (currentGuardPayslips.length > 0) {
    const latest = currentGuardPayslips[0];
    downloadPayslipPdf(latest.payroll_record_id, latest.period_name.replace(/ /g, '_'));
  } else {
    alert('No payslip available yet.');
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


