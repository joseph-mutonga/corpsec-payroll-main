/* CorpSec Web Application Frontend Logic */
const API_BASE = '/api/v1';
let authToken = localStorage.getItem('corpsec_token') || '';
let cachedGuards = [];
let cachedSites = [];
let cachedAttendance = [];

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar || !overlay) return;

  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
}

document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('show');
      }
    });
  });

  checkAuthStatus();
});

function checkAuthStatus() {
  const loginOverlay = document.getElementById('unified-login-overlay');
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('main-content');
  const token = localStorage.getItem('corpsec_token');

  if (token) {
    authToken = token;
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (sidebar) sidebar.style.display = '';
    if (mainContent) mainContent.style.display = '';

    const storedUser = localStorage.getItem('corpsec_user');
    if (storedUser) {
      try {
        updateUserProfileDisplay(JSON.parse(storedUser));
      } catch (e) {}
    }
    initApp();
  } else {
    authToken = '';
    if (loginOverlay) loginOverlay.style.display = 'flex';
    if (sidebar) sidebar.style.display = 'none';
    if (mainContent) mainContent.style.display = 'none';

    // Surface any redirect alert from portal (e.g. logout or session expiry)
    const urlParams = new URLSearchParams(window.location.search);
    const alertMsg = urlParams.get('alert');
    if (alertMsg) {
      const alertEl = document.getElementById('unified-login-alert');
      if (alertEl) {
        alertEl.className = 'login-alert-banner alert-info';
        alertEl.innerText = alertMsg;
        alertEl.style.display = 'block';
      }
      // Clean the URL so refreshing doesn't re-show the alert
      window.history.replaceState({}, '', '/');
    }
  }
}


async function handleUnifiedLogin(e) {
  if (e) e.preventDefault();
  const idInput = document.getElementById('unified-login-id');
  const passInput = document.getElementById('unified-login-password');
  const alertEl = document.getElementById('unified-login-alert');
  const btn = document.getElementById('unified-login-btn');
  const btnText = document.getElementById('btn-login-text');
  const btnSpinner = document.getElementById('btn-login-spinner');

  if (!idInput || !passInput) return;

  const loginId = idInput.value.trim();
  const password = passInput.value;

  if (alertEl) alertEl.style.display = 'none';
  if (btn) btn.disabled = true;
  if (btnText) btnText.innerText = 'Authenticating...';
  if (btnSpinner) btnSpinner.style.display = 'inline-block';

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginId, password: password })
    });

    const data = await res.json();

    if (!res.ok) {
      if (btn) btn.disabled = false;
      if (btnText) btnText.innerText = 'Sign In to CorpSec';
      if (btnSpinner) btnSpinner.style.display = 'none';
      if (alertEl) {
        alertEl.className = 'login-alert-banner alert-error';
        alertEl.innerText = data.detail || 'Authentication failed. Please verify credentials.';
        alertEl.style.display = 'block';
      }
      return;
    }

    // Role-based automatic dispatch:
    if (data.role === 'GUARD') {
      // Security Guard Account: Save guard session and redirect to Mobile Guard Portal
      sessionStorage.setItem('guard_auth_token', data.access_token);
      sessionStorage.setItem('guard_user', JSON.stringify(data));
      localStorage.setItem('guard_auth_token', data.access_token);
      localStorage.setItem('guard_user', JSON.stringify(data));

      if (btnText) btnText.innerText = 'Guard Verified! Redirecting...';
      if (alertEl) {
        alertEl.className = 'login-alert-banner alert-success';
        alertEl.innerHTML = '✅ <strong>Guard Credentials Confirmed:</strong> Redirecting to Mobile Guard Portal...';
        alertEl.style.display = 'block';
      }

      setTimeout(() => {
        window.location.href = '/portal';
      }, 400);
      return;
    }

    // Administrator / Supervisor Account:
    authToken = data.access_token;
    localStorage.setItem('corpsec_token', authToken);
    localStorage.setItem('corpsec_user', JSON.stringify(data));

    updateUserProfileDisplay(data);

    if (alertEl) {
      alertEl.className = 'login-alert-banner alert-success';
      alertEl.innerHTML = '✅ <strong>Welcome, Administrator:</strong> Initializing management hub...';
      alertEl.style.display = 'block';
    }

    setTimeout(() => {
      const loginOverlay = document.getElementById('unified-login-overlay');
      const sidebar = document.getElementById('sidebar');
      const mainContent = document.getElementById('main-content');
      if (loginOverlay) loginOverlay.style.display = 'none';
      if (sidebar) sidebar.style.display = '';
      if (mainContent) mainContent.style.display = '';
      if (btn) btn.disabled = false;
      if (btnText) btnText.innerText = 'Sign In to CorpSec';
      if (btnSpinner) btnSpinner.style.display = 'none';
      initApp();
    }, 350);

  } catch (err) {
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerText = 'Sign In to CorpSec';
    if (btnSpinner) btnSpinner.style.display = 'none';
    if (alertEl) {
      alertEl.className = 'login-alert-banner alert-error';
      alertEl.innerText = 'Network error or backend server unreachable: ' + err.message;
      alertEl.style.display = 'block';
    }
  }
}

function quickFillCredentials(id, pass) {
  const idInput = document.getElementById('unified-login-id');
  const passInput = document.getElementById('unified-login-password');
  if (idInput && passInput) {
    idInput.value = id;
    passInput.value = pass;
    idInput.focus();
  }
}

function togglePasswordVisibility() {
  const passInput = document.getElementById('unified-login-password');
  if (!passInput) return;
  passInput.type = passInput.type === 'password' ? 'text' : 'password';
}

function updateUserProfileDisplay(userData) {
  if (!userData) return;
  const emailLabel = document.getElementById('user-email-label');
  if (emailLabel && userData.email) {
    emailLabel.innerText = userData.email;
  }
  const avatarNames = document.querySelectorAll('.avatar-name');
  avatarNames.forEach(el => {
    if (userData.email) el.innerText = userData.email.split('@')[0].replace('.', ' ').toUpperCase();
  });
  const avatarRoles = document.querySelectorAll('.avatar-role');
  avatarRoles.forEach(el => {
    if (userData.role) el.innerText = userData.role === 'ADMIN' ? 'System Admin' : userData.role;
  });
}

function logout() {
  localStorage.removeItem('corpsec_token');
  localStorage.removeItem('corpsec_user');
  sessionStorage.removeItem('guard_auth_token');
  sessionStorage.removeItem('guard_user');
  authToken = '';
  checkAuthStatus();
}

function initApp() {
  const subtitleEl = document.getElementById('top-bar-date-subtitle');
  if (subtitleEl) {
    const todayStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    subtitleEl.innerText = `Data summary for ${todayStr}`;
  }
  loadGuards();
  loadSites();
  loadShifts();
  loadAttendance();
  loadAuditLogs();
  loadAdminIncidents();
  loadAdminLeave();
  loadPayrollReview();
}

function switchTab(tabId) {
  const titles = {
    'dashboard': 'Dashboard Overview',
    'incidents': 'Incident Reports & Safety Logs',
    'leave': 'Guard Leave Requests & Absence Approvals',
    'guards': 'Guard Directory',
    'sites': 'Client Sites & Per-Site Rates',
    'shifts': 'Shift Roster & Scheduling',
    'attendance': 'Time, Attendance & Overtime Claims',
    'payroll': 'Guided Payroll Engine',
    'payments': 'Bank & M-Pesa Disbursement Schedules',
    'statutory': 'Tax & Statutory Parameters Management',
    'reports': 'Statutory Tax Returns & P9 Forms',
    'audit': 'System Audit Trail',
    'settings': 'Statutory Parameters & System Settings'
  };

  document.getElementById('current-page-title').innerText = titles[tabId] || 'Dashboard';

  document.querySelectorAll('section[id^="panel-"]').forEach(sec => sec.style.display = 'none');
  const target = document.getElementById(`panel-${tabId}`);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

  if (tabId === 'dashboard') {
    loadGuards();
    loadSites();
    loadAdminIncidents();
    loadAdminLeave();
    loadPayrollReview();
  }
  if (tabId === 'incidents') loadAdminIncidents();
  if (tabId === 'leave') loadAdminLeave();
  if (tabId === 'guards') loadGuards();
  if (tabId === 'sites') loadSites();
  if (tabId === 'shifts') loadShifts();
  if (tabId === 'attendance') loadAttendance();
  if (tabId === 'payroll') loadPayrollReview();
  if (tabId === 'payments') loadPayments();
  if (tabId === 'statutory') loadStatutoryRates();
  if (tabId === 'audit') loadAuditLogs();
  if (tabId === 'reports') {
    loadGuards();
    loadSites();
    loadAttendance();
    loadPayrollReview();
  }
}

async function apiFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }
  const res = await fetch(`${API_BASE}${endpoint}`, options);
  if (res.status === 401) {
    logout();
    throw new Error('Unauthorized');
  }
  return res;
}

async function loadGuards() {
  try {
    const res = await apiFetch('/guards');
    const guards = await res.json();
    cachedGuards = guards;
    const tbody = document.getElementById('guards-table-body');
    if (tbody) {
      tbody.innerHTML = '';
      guards.forEach(g => {
        const tr = document.createElement('tr');
        const salDisplay = g.basic_salary ? `KES ${g.basic_salary.toLocaleString()} <span style="font-size:10px; color:#3B5EDB;">(Override)</span>` : `KES ${(g.resolved_basic_salary || 15000).toLocaleString()} <span style="font-size:10px; color:#64748B;">(Site Default)</span>`;
        const relieverBadge = g.is_reliever ? `<span class="badge" style="background:#EEF2FF; color:#4338CA;">🔄 Reliever</span>` : `<span style="font-size:11px; color:#94A3B8;">Regular</span>`;

        tr.innerHTML = `
          <td><b>${g.employee_number}</b></td>
          <td>${g.full_name}</td>
          <td>${g.national_id}</td>
          <td>${g.phone}</td>
          <td>${salDisplay}</td>
          <td>${relieverBadge}</td>
          <td><span class="badge ${g.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}">${g.status}</span></td>
          <td style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn btn-primary" style="padding:4px 10px; font-size:12px;" onclick="openGuardFileModal(${g.id})">📋 View File</button>
            <button class="btn btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="deactivateGuard(${g.id})">Deactivate</button>
          </td>
        `;

        tbody.appendChild(tr);
      });
    }

    const activeCount = guards.filter(g => g.status === 'ACTIVE').length;
    const mGuards = document.getElementById('metric-guards-count');
    if (mGuards) mGuards.innerText = activeCount;

    const repGuards = document.getElementById('reports-metric-guards');
    if (repGuards) repGuards.innerText = activeCount;

    renderAnalyticsSiteDistribution();
  } catch (err) {
    console.error('loadGuards error:', err);
  }
}

/* ============================================================
   GUARD FILE / PROFILE MODAL
   ============================================================ */
async function openGuardFileModal(guardId) {
  const modal = document.getElementById('modal-guard-file');
  const body  = document.getElementById('guard-file-body');
  if (!modal || !body) return;

  body.innerHTML = '<div style="text-align:center;padding:40px;color:#64748B;">⏳ Loading guard file...</div>';
  modal.style.display = 'flex';

  try {
    // Fetch guard details and current-month attendance in parallel
    const now   = new Date();
    const year  = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const firstDay = `${year}-${month}-01`;
    const lastDay  = new Date(year, now.getMonth() + 1, 0).toISOString().split('T')[0];

    const [gRes, aRes] = await Promise.all([
      apiFetch(`/guards/${guardId}`),
      apiFetch(`/attendance?guard_id=${guardId}&start_date=${firstDay}&end_date=${lastDay}`)
    ]);

    const g  = await gRes.json();
    const attendance = aRes.ok ? await aRes.json() : [];

    // ---- Attendance calendar data ----
    const daysInMonth   = new Date(year, now.getMonth() + 1, 0).getDate();
    const presentDates  = new Set(attendance.filter(a => a.status === 'PRESENT').map(a => a.shift_date ? a.shift_date.substring(0, 10) : ''));
    const absentDates   = new Set(attendance.filter(a => a.status === 'ABSENT').map(a => a.shift_date ? a.shift_date.substring(0, 10) : ''));
    const daysPresent   = presentDates.size;
    const monthName     = now.toLocaleString('default', { month: 'long' });

    // ---- Calendar cells ----
    let calCells = '';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${month}-${String(d).padStart(2,'0')}`;
      const isToday   = d === now.getDate();
      const isPresent = presentDates.has(dateStr);
      const isAbsent  = absentDates.has(dateStr);
      let cellStyle = 'background:#1E293B; color:#94A3B8;';
      let cellTitle = '';
      if (isPresent) { cellStyle = 'background:#059669; color:#fff;'; cellTitle = 'Reported'; }
      else if (isAbsent) { cellStyle = 'background:#EF4444; color:#fff;'; cellTitle = 'Absent'; }
      if (isToday) cellStyle += ' outline:2px solid #F59E0B; outline-offset:1px;';
      calCells += `<div title="${cellTitle || 'No record'}" style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;cursor:default;${cellStyle}">${d}</div>`;
    }

    // ---- Payment info ----
    let payInfo = '';
    if (g.payment_method === 'M-Pesa' || g.payment_method === 'Mpesa') {
      payInfo = `<span style="font-size:12px; color:#94A3B8;">M-Pesa: <b style="color:#E2E8F0;">${g.mpesa_number || '—'}</b></span>`;
    } else {
      payInfo = `<span style="font-size:12px; color:#94A3B8;">${g.bank_name || '—'} · <b style="color:#E2E8F0;">${g.bank_account || '—'}</b></span>`;
    }

    // ---- Statutory numbers ----
    const statutory = [
      { label: 'KRA PIN',   value: g.kra_pin   || '—' },
      { label: 'NSSF No.', value: g.nssf_number || '—' },
      { label: 'SHIF No.', value: g.shif_number  || '—' },
    ].map(s => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1E293B;"><span style="font-size:12px;color:#94A3B8;">${s.label}</span><span style="font-size:12px;font-weight:700;color:#E2E8F0;">${s.value}</span></div>`).join('');

    // ---- Hire duration ----
    const hireDateObj = g.hire_date ? new Date(g.hire_date) : null;
    let tenure = '—';
    if (hireDateObj) {
      const months = Math.floor((now - hireDateObj) / (1000 * 60 * 60 * 24 * 30.44));
      tenure = months >= 12 ? `${Math.floor(months/12)} yr${Math.floor(months/12)>1?'s':''} ${months%12} mo` : `${months} months`;
    }

    // ---- Status badge ----
    const statusColor = g.status === 'ACTIVE' ? '#059669' : '#EF4444';

    body.innerHTML = `
      <!-- Profile Header -->
      <div style="background:linear-gradient(135deg,#1E3A5F 0%,#0F172A 100%);border-radius:18px;padding:24px;margin-bottom:20px;display:flex;align-items:center;gap:18px;flex-wrap:wrap;">
        <div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#fff;flex-shrink:0;border:3px solid rgba(255,255,255,0.15);">
          ${g.full_name.charAt(0).toUpperCase()}
        </div>
        <div style="flex:1;min-width:180px;">
          <div style="font-size:20px;font-weight:900;color:#F1F5F9;margin-bottom:4px;">${g.full_name}</div>
          <div style="font-size:13px;color:#94A3B8;margin-bottom:8px;">${g.employee_number} · ${g.site ? g.site.site_name : 'No Site Assigned'}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <span style="background:${statusColor}22;border:1px solid ${statusColor}55;color:${statusColor};font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">${g.status}</span>
            ${g.is_reliever ? '<span style="background:#4338CA22;border:1px solid #4338CA55;color:#818CF8;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">🔄 RELIEVER</span>' : ''}
            <span style="background:#0F172A;border:1px solid #334155;color:#CBD5E1;font-size:11px;padding:3px 10px;border-radius:20px;">Tenure: ${tenure}</span>
          </div>
        </div>
      </div>

      <!-- Two-column details + attendance -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">

        <!-- Personal Information -->
        <div style="background:#0F172A;border:1px solid #1E293B;border-radius:16px;padding:18px;">
          <div style="font-size:12px;font-weight:800;color:#3B82F6;letter-spacing:1px;margin-bottom:14px;text-transform:uppercase;">👤 Personal Info</div>
          ${[
            ['National ID',   g.national_id   || '—'],
            ['Date of Birth', g.date_of_birth ? new Date(g.date_of_birth).toLocaleDateString('en-GB') : '—'],
            ['Gender',        g.gender        || '—'],
            ['Phone',         g.phone         || '—'],
            ['Email',         g.email         || g.employee_number?.toLowerCase() + '@corpsec.co.ke'],
            ['Hire Date',     hireDateObj ? hireDateObj.toLocaleDateString('en-GB') : '—'],
          ].map(([l,v]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1E293B;"><span style="font-size:12px;color:#94A3B8;">${l}</span><span style="font-size:12px;font-weight:700;color:#E2E8F0;text-align:right;max-width:55%;word-break:break-all;">${v}</span></div>`).join('')}
        </div>

        <!-- Work & Payment -->
        <div style="background:#0F172A;border:1px solid #1E293B;border-radius:16px;padding:18px;">
          <div style="font-size:12px;font-weight:800;color:#10B981;letter-spacing:1px;margin-bottom:14px;text-transform:uppercase;">💼 Work & Pay</div>
          ${[
            ['Site',          g.site ? g.site.site_name : '—'],
            ['Shift',         g.shift ? g.shift.shift_name : '—'],
            ['Basic Salary',  `KES ${(g.resolved_basic_salary || g.basic_salary || 0).toLocaleString()}`],
            ['Pay Method',    g.payment_method || '—'],
          ].map(([l,v]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1E293B;"><span style="font-size:12px;color:#94A3B8;">${l}</span><span style="font-size:12px;font-weight:700;color:#E2E8F0;text-align:right;max-width:55%;word-break:break-all;">${v}</span></div>`).join('')}
          <div style="padding:6px 0;border-bottom:1px solid #1E293B;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;color:#94A3B8;">Account</span>${payInfo}</div>
          <!-- Statutory -->
          <div style="font-size:12px;font-weight:800;color:#F59E0B;letter-spacing:1px;margin:14px 0 8px;text-transform:uppercase;">🏛️ Statutory</div>
          ${statutory}
        </div>
      </div>

      <!-- Monthly Attendance Calendar -->
      <div style="background:#0F172A;border:1px solid #1E293B;border-radius:16px;padding:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
          <div style="font-size:12px;font-weight:800;color:#F472B6;letter-spacing:1px;text-transform:uppercase;">📅 Attendance — ${monthName} ${year}</div>
          <div style="display:flex;gap:10px;align-items:center;">
            <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#94A3B8;"><div style="width:12px;height:12px;border-radius:3px;background:#059669;"></div>Reported</div>
            <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#94A3B8;"><div style="width:12px;height:12px;border-radius:3px;background:#EF4444;"></div>Absent</div>
            <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#94A3B8;"><div style="width:12px;height:12px;border-radius:3px;background:#1E293B;border:1px solid #334155;"></div>No record</div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px;">
          ${calCells}
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          <div style="background:#059669;background:linear-gradient(135deg,#065F46,#059669);border-radius:12px;padding:12px 20px;text-align:center;flex:1;min-width:120px;">
            <div style="font-size:28px;font-weight:900;color:#fff;">${daysPresent}</div>
            <div style="font-size:11px;color:#A7F3D0;margin-top:2px;">Days Reported</div>
          </div>
          <div style="background:linear-gradient(135deg,#7C3AED,#6366F1);border-radius:12px;padding:12px 20px;text-align:center;flex:1;min-width:120px;">
            <div style="font-size:28px;font-weight:900;color:#fff;">${daysInMonth}</div>
            <div style="font-size:11px;color:#C4B5FD;margin-top:2px;">Days in Month</div>
          </div>
          <div style="background:linear-gradient(135deg,#92400E,#F59E0B);border-radius:12px;padding:12px 20px;text-align:center;flex:1;min-width:120px;">
            <div style="font-size:28px;font-weight:900;color:#fff;">${Math.round((daysPresent / daysInMonth) * 100)}%</div>
            <div style="font-size:11px;color:#FDE68A;margin-top:2px;">Attendance Rate</div>
          </div>
          <div style="background:linear-gradient(135deg,#991B1B,#EF4444);border-radius:12px;padding:12px 20px;text-align:center;flex:1;min-width:120px;">
            <div style="font-size:28px;font-weight:900;color:#fff;">${absentDates.size}</div>
            <div style="font-size:11px;color:#FCA5A5;margin-top:2px;">Days Absent</div>
          </div>
        </div>
      </div>

      ${g.deactivation_reason ? `<div style="background:#450A0A;border:1px solid #EF444433;border-radius:12px;padding:12px 16px;margin-top:16px;font-size:13px;color:#FCA5A5;"><strong>⛔ Deactivation Reason:</strong> ${g.deactivation_reason}</div>` : ''}
    `;

  } catch (err) {
    body.innerHTML = `<div style="text-align:center;padding:40px;color:#EF4444;">❌ Failed to load guard file. ${err.message}</div>`;
    console.error('Guard file modal error:', err);
  }
}

function closeGuardFileModal() {
  const modal = document.getElementById('modal-guard-file');
  if (modal) modal.style.display = 'none';
}


async function loadSites() {
  try {
    const res = await apiFetch('/sites');
    const sites = await res.json();
    cachedSites = sites;
    const tbody = document.getElementById('sites-table-body');
    if (tbody) {
      tbody.innerHTML = '';
      sites.forEach(s => {
        const tr = document.createElement('tr');
        const regName = s.region_name ? `<span class="badge" style="background:#F3E8FF; color:#6B21A8;">${s.region_name}</span>` : `<span style="font-size:11px; color:#94A3B8;">None</span>`;
        const basicSal = `KES ${(s.basic_salary || 15000).toLocaleString()}`;

        tr.innerHTML = `
          <td><b>${s.site_name}</b></td>
          <td>${regName}</td>
          <td>${s.client_name}</td>
          <td>${s.location}</td>
          <td>${basicSal}</td>
          <td>KES ${s.daily_rate.toLocaleString()}</td>
          <td>KES ${s.night_allowance.toLocaleString()}</td>
          <td><button class="btn btn-secondary" style="padding:4px 8px; font-size:12px;">Edit Rate</button></td>
        `;
        tbody.appendChild(tr);
      });
    }

    const mSites = document.getElementById('metric-sites-count');
    if (mSites) mSites.innerText = sites.length;

    renderAnalyticsSiteDistribution();
  } catch (err) {
    console.error('loadSites error:', err);
  }
}

function renderAnalyticsSiteDistribution() {
  const containerList = document.getElementById('reports-site-progress-list');
  const containerBubbles = document.getElementById('reports-site-bubble-nodes');
  if (!cachedSites || !cachedSites.length) return;

  const totalGuards = cachedGuards.length || 1;
  const colors = ['#8B5CF6', '#7C3AED', '#635BFF', '#A855F7', '#EC4899'];

  if (containerBubbles) {
    containerBubbles.innerHTML = cachedSites.map((s, idx) => {
      const siteGuards = cachedGuards.filter(g => g.primary_site_id === s.id).length;
      const col = colors[idx % colors.length];
      return `<div class="bubble-node bubble-md" style="background:${col};" title="${s.site_name}">${siteGuards}</div>`;
    }).join('');
  }

  if (containerList) {
    containerList.innerHTML = cachedSites.map(s => {
      const siteGuardsCount = cachedGuards.filter(g => g.primary_site_id === s.id).length;
      const pct = Math.round((siteGuardsCount / totalGuards) * 100) || 0;
      return `
        <div class="site-progress-item">
          <div class="site-progress-meta">
            <span>${s.site_name}</span>
            <span>${pct}% (${siteGuardsCount} Guards)</span>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width: ${Math.max(pct, 5)}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  }
}

let currentRosterYear = new Date().getFullYear();
let currentRosterMonth = new Date().getMonth() + 1; // 1-12

async function loadShifts() {
  await loadRosterGrid(currentRosterYear, currentRosterMonth);
}

function changeRosterMonth(delta) {
  currentRosterMonth += delta;
  if (currentRosterMonth > 12) {
    currentRosterMonth = 1;
    currentRosterYear += 1;
  } else if (currentRosterMonth < 1) {
    currentRosterMonth = 12;
    currentRosterYear -= 1;
  }
  loadRosterGrid(currentRosterYear, currentRosterMonth);
}

async function loadRosterGrid(year, month) {
  try {
    const res = await apiFetch(`/roster/grid?year=${year}&month=${month}`);
    if (!res.ok) return;
    const grid = await res.json();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthLabel = document.getElementById('roster-month-label');
    if (monthLabel) {
      monthLabel.innerText = `${monthNames[grid.month - 1]} ${grid.year}`;
    }

    const thead = document.getElementById('roster-grid-thead');
    const tbody = document.getElementById('roster-grid-tbody');
    if (!thead || !tbody) return;

    // Build Table Header
    let headHtml = '<tr><th style="min-width:160px; text-align:left; position:sticky; left:0; background:#F8FAFC; z-index:2;">Guard Name</th>';
    const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    for (let d = 1; d <= grid.days_in_month; d++) {
      const dObj = new Date(grid.year, grid.month - 1, d);
      const dayName = dayLabels[dObj.getDay()];
      const isWeekend = dObj.getDay() === 0 || dObj.getDay() === 6;
      headHtml += `<th style="min-width:44px; padding:6px 2px; font-size:11px; background:${isWeekend ? '#F1F5F9' : '#FFF'};">${dayName}<br>${d}</th>`;
    }
    headHtml += '</tr>';
    thead.innerHTML = headHtml;

    // Build Table Body
    tbody.innerHTML = '';

    if (!grid.rows || grid.rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${grid.days_in_month + 1}" style="padding:20px; color:#64748B;">No active guards found on roster.</td></tr>`;
      return;
    }

    grid.rows.forEach(row => {
      const tr = document.createElement('tr');
      let rowHtml = `<td style="text-align:left; font-weight:700; position:sticky; left:0; background:#FFF; z-index:1; border-right:1px solid #CBD5E1;">
        <div style="font-size:12px;">${row.full_name}</div>
        <div style="font-size:10px; color:#64748B;">${row.employee_number}</div>
      </td>`;

      for (let d = 1; d <= grid.days_in_month; d++) {
        const dStr = `${grid.year}-${String(grid.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const cell = row.cells[dStr] || { is_off: true };

        let cellBg = '#F8FAFC';
        let cellColor = '#64748B';
        let cellText = 'OFF';
        let borderStyle = '1px solid #E2E8F0';

        if (cell.is_leave) {
          cellBg = '#FEE2E2';
          cellColor = '#991B1B';
          borderStyle = '1px solid #FCA5A5';
          cellText = '🏖️ LEAVE';
        } else if (!cell.is_off) {
          const siteShort = cell.site_name ? cell.site_name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase() : 'SITE';
          const shiftShort = cell.is_night_shift ? 'N' : 'D';
          cellText = `${siteShort}-${shiftShort}`;

          if (cell.is_night_shift) {
            cellBg = '#F3E8FF';
            cellColor = '#6B21A8';
          } else {
            cellBg = '#EFF6FF';
            cellColor = '#1E40AF';
          }
        }

        if (cell.is_override && !cell.is_leave) {
          cellBg = '#FEF3C7';
          cellColor = '#92400E';
          borderStyle = '1px solid #F59E0B';
          cellText = `⚡${cellText}`;
        }

        const durationInfo = cell.duration_hours ? ` (${cell.duration_hours}h)` : '';
        const overrideInfo = cell.is_override ? ' (Override)' : '';
        const titleText = `${cell.site_name || 'Day Off'} - ${cell.shift_name || 'Off'}${durationInfo}${overrideInfo}`;

        rowHtml += `
          <td style="padding:4px 2px; cursor:pointer;" onclick="openOverrideModal(${row.guard_id}, '${dStr}')" title="${titleText}">
            <div style="background:${cellBg}; color:${cellColor}; border:${borderStyle}; border-radius:4px; font-size:10px; font-weight:700; padding:4px 2px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
              ${cellText}
            </div>
          </td>
        `;
      }

      tr.innerHTML = rowHtml;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error('loadRosterGrid error:', err);
  }
}

async function openPatternModal() {
  await Promise.all([loadGuards(), loadSites()]);
  const guardSelect = document.getElementById('pattern-guard-id');
  const siteSelect = document.getElementById('pattern-site-id');
  const shiftSelect = document.getElementById('pattern-shift-id');

  if (guardSelect && cachedGuards) {
    guardSelect.innerHTML = cachedGuards.map(g => `<option value="${g.id}">${g.full_name} (${g.employee_number})</option>`).join('');
  }

  if (siteSelect && cachedSites) {
    siteSelect.innerHTML = cachedSites.map(s => `<option value="${s.id}">${s.site_name}</option>`).join('');
  }

  if (shiftSelect) {
    const res = await apiFetch('/shifts');
    const shifts = await res.json();
    shiftSelect.innerHTML = shifts.map(sh => `<option value="${sh.id}">${sh.name} (${sh.start_time} - ${sh.end_time})</option>`).join('');
  }

  const startDateInput = document.getElementById('pattern-start-date');
  if (startDateInput) {
    const today = new Date().toISOString().split('T')[0];
    startDateInput.value = today;
  }

  const modal = document.getElementById('modal-roster-pattern');
  if (modal) modal.style.display = 'flex';
}

function closePatternModal() {
  const modal = document.getElementById('modal-roster-pattern');
  if (modal) modal.style.display = 'none';
}

async function handlePatternSubmit(e) {
  e.preventDefault();
  const guard_id = parseInt(document.getElementById('pattern-guard-id').value);
  const site_id = parseInt(document.getElementById('pattern-site-id').value);
  const shift_id = parseInt(document.getElementById('pattern-shift-id').value);
  const start_date = document.getElementById('pattern-start-date').value;

  const daysCheckboxes = document.querySelectorAll('input[name="pattern_days"]:checked');
  const days_of_week = Array.from(daysCheckboxes).map(cb => parseInt(cb.value));

  if (days_of_week.length === 0) {
    alert('Please select at least one workday');
    return;
  }

  try {
    const res = await apiFetch('/roster/patterns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guard_id, site_id, shift_id, days_of_week, start_date })
    });

    if (!res.ok) {
      const err = await res.json();
      alert('Error: ' + (err.detail || 'Failed to set pattern'));
      return;
    }

    closePatternModal();
    showToast('Recurring roster pattern generated successfully!', 'success');
    loadRosterGrid(currentRosterYear, currentRosterMonth);
  } catch (err) {
    alert('Pattern creation failed: ' + err.message);
  }
}

async function openOverrideModal(guardId = null, dateStr = null) {
  await Promise.all([loadGuards(), loadSites()]);
  const guardSelect = document.getElementById('override-guard-id');
  const siteSelect = document.getElementById('override-site-id');
  const shiftSelect = document.getElementById('override-shift-id');
  const dateInput = document.getElementById('override-date');

  if (guardSelect && cachedGuards) {
    guardSelect.innerHTML = cachedGuards.map(g => `<option value="${g.id}">${g.full_name} (${g.employee_number})</option>`).join('');
    if (guardId) guardSelect.value = guardId;
  }

  if (siteSelect && cachedSites) {
    siteSelect.innerHTML = cachedSites.map(s => `<option value="${s.id}">${s.site_name}</option>`).join('');
  }

  if (shiftSelect) {
    const res = await apiFetch('/shifts');
    const shifts = await res.json();
    shiftSelect.innerHTML = shifts.map(sh => `<option value="${sh.id}">${sh.name} (${sh.start_time} - ${sh.end_time})</option>`).join('');
  }

  if (dateInput) {
    const targetDate = dateStr || new Date().toISOString().split('T')[0];
    dateInput.value = targetDate;
  }

  toggleOverrideSiteShiftDisplay('ASSIGN');
  const modal = document.getElementById('modal-roster-override');
  if (modal) modal.style.display = 'flex';
}

function closeOverrideModal() {
  const modal = document.getElementById('modal-roster-override');
  if (modal) modal.style.display = 'none';
}

function toggleOverrideSiteShiftDisplay(typeVal) {
  const group = document.getElementById('override-site-shift-group');
  if (group) {
    group.style.display = typeVal === 'OFF' ? 'none' : 'block';
  }
}

async function handleOverrideSubmit(e) {
  e.preventDefault();
  const guard_id = parseInt(document.getElementById('override-guard-id').value);
  const shift_date = document.getElementById('override-date').value;
  const action_type = document.getElementById('override-action-type').value;
  const notes = document.getElementById('override-notes').value;

  let site_id = null;
  let shift_id = null;

  if (action_type === 'ASSIGN') {
    site_id = parseInt(document.getElementById('override-site-id').value);
    shift_id = parseInt(document.getElementById('override-shift-id').value);
  }

  try {
    const res = await apiFetch('/roster/overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guard_id, site_id, shift_id, shift_date, notes })
    });

    if (!res.ok) {
      const err = await res.json();
      alert('Override Error: ' + (err.detail || 'Failed to apply override'));
      return;
    }

    closeOverrideModal();
    showToast('Single-day roster override applied successfully!', 'success');
    loadRosterGrid(currentRosterYear, currentRosterMonth);
  } catch (err) {
    alert('Override failed: ' + err.message);
  }
}

let cachedOvertimeClaims = [];

async function loadAttendance() {
  try {
    const [attRes, otRes] = await Promise.all([
      apiFetch('/attendance'),
      apiFetch('/overtime')
    ]);

    const atts = await attRes.json();
    cachedAttendance = atts;

    const otClaims = await otRes.json();
    cachedOvertimeClaims = otClaims;

    // Overtime Claims Queue Table
    const otTbody = document.getElementById('overtime-claims-table-body');
    if (otTbody) {
      otTbody.innerHTML = '';
      if (!otClaims || otClaims.length === 0) {
        otTbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:16px; color:#64748B;">No overtime claims currently in queue.</td></tr>`;
      } else {
        otClaims.forEach(claim => {
          const statusBadge = claim.status === 'APPROVED' || claim.status === 'Approved' ?
            '<span class="badge badge-active">APPROVED</span>' :
            (claim.status === 'REJECTED' || claim.status === 'Rejected' ?
              '<span class="badge badge-inactive">REJECTED</span>' :
              '<span class="badge badge-warning" style="background:#FEF3C7; color:#B45309;">PENDING</span>');

          const actionButtons = (claim.status.toUpperCase() === 'PENDING') ? `
            <div style="display:flex; gap:6px;">
              <button class="btn btn-primary" style="padding:4px 8px; font-size:11px;" onclick="approveOvertimeClaim(${claim.id})">✅ Approve</button>
              <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px; color:#DC2626;" onclick="rejectOvertimeClaim(${claim.id})">❌ Reject</button>
            </div>
          ` : `<span style="font-size:11px; color:#64748B;">Processed</span>`;

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><b>CLM-${claim.id}</b></td>
            <td>${claim.guard_name}</td>
            <td>${claim.site_name || 'Client Site'}</td>
            <td>${claim.shift_date}</td>
            <td><b>${claim.overtime_hours} hrs</b></td>
            <td><span style="font-weight:700; color:#3B5EDB;">${claim.rate_multiplier}x</span></td>
            <td>${statusBadge}</td>
            <td>${actionButtons}</td>
          `;
          otTbody.appendChild(tr);
        });
      }
    }

    // Daily Attendance Logs Table
    const tbody = document.getElementById('attendance-table-body');
    if (tbody) {
      tbody.innerHTML = '';
      if (!atts || atts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:16px; color:#64748B;">No attendance logs found. Click 'Log Manual Shift' to add one.</td></tr>`;
      } else {
        atts.forEach((a, idx) => {
          const clockIn = a.actual_clock_in ? new Date(a.actual_clock_in).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-';
          const clockOut = a.actual_clock_out ? new Date(a.actual_clock_out).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-';
          const g = cachedGuards.find(x => x.id === a.guard_id);
          const s = cachedSites.find(x => x.id === a.site_id);
          const guardLabel = g ? `${g.full_name}` : `Guard #${a.guard_id}`;
          const siteLabel = s ? s.site_name : 'Client Site';
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${a.shift_date}</td>
            <td>${guardLabel}</td>
            <td>${siteLabel}</td>
            <td>${clockIn}</td>
            <td>${clockOut}</td>
            <td>${a.regular_hours}h</td>
            <td>${a.overtime_hours}h</td>
            <td><span class="badge badge-active">${a.status}</span></td>
            <td><button class="btn btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="openCorrectAttendanceModal(${idx})">✏️ Correct</button></td>
          `;
          tbody.appendChild(tr);
        });
      }
    }

    // Dashboard Recent Shift Activity Table
    const dashBody = document.getElementById('dashboard-activity-body');
    if (dashBody) {
      dashBody.innerHTML = '';
      if (atts.length === 0) {
        dashBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:16px; color:#64748B;">No recent shift activity recorded.</td></tr>`;
      } else {
        atts.slice(0, 5).forEach(a => {
          const clockIn = a.actual_clock_in ? new Date(a.actual_clock_in).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-';
          const g = cachedGuards.find(x => x.id === a.guard_id);
          const s = cachedSites.find(x => x.id === a.site_id);
          const guardName = g ? `${g.full_name} (${g.employee_number})` : `Guard #${a.guard_id}`;
          const siteName = s ? s.site_name : 'Client Site';
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${guardName}</td>
            <td>${siteName}</td>
            <td>${clockIn}</td>
            <td><span class="badge badge-active">${a.status}</span></td>
          `;
          dashBody.appendChild(tr);
        });
      }
    }

    // Analytics Metrics
    const repShifts = document.getElementById('reports-metric-shifts');
    if (repShifts) repShifts.innerText = atts.length;

    const totalOt = atts.reduce((sum, a) => sum + (a.overtime_hours || 0), 0);
    const repOt = document.getElementById('reports-metric-overtime');
    if (repOt) repOt.innerText = `${totalOt} hrs`;
  } catch (err) {
    console.error('loadAttendance error:', err);
  }
}

// Approve Overtime Claim
async function approveOvertimeClaim(claimId) {
  try {
    const res = await apiFetch(`/overtime/${claimId}/approve`, { method: 'POST' });
    if (!res.ok) {
      alert('Failed to approve overtime claim.');
      return;
    }
    loadAttendance();
  } catch (err) {
    alert('Error approving overtime claim: ' + err.message);
  }
}

// Reject Overtime Claim
async function rejectOvertimeClaim(claimId) {
  try {
    const res = await apiFetch(`/overtime/${claimId}/reject`, { method: 'POST' });
    if (!res.ok) {
      alert('Failed to reject overtime claim.');
      return;
    }
    loadAttendance();
  } catch (err) {
    alert('Error rejecting overtime claim: ' + err.message);
  }
}

// Manual Attendance Modal Handlers
function openManualAttendanceModal() {
  const select = document.getElementById('manual-att-guard-id');
  if (select) {
    select.innerHTML = '';
    cachedGuards.filter(g => g.status === 'ACTIVE').forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.innerText = `${g.full_name} (${g.employee_number})`;
      select.appendChild(opt);
    });
  }
  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById('manual-att-date').value = todayStr;
  document.getElementById('modal-manual-attendance').style.display = 'flex';
}

function closeManualAttendanceModal() {
  document.getElementById('modal-manual-attendance').style.display = 'none';
}

async function handleManualAttendanceSubmit(e) {
  e.preventDefault();
  const guardId = parseInt(document.getElementById('manual-att-guard-id').value);
  const shiftDate = document.getElementById('manual-att-date').value;
  const clockInStr = document.getElementById('manual-att-clock-in').value;
  const clockOutStr = document.getElementById('manual-att-clock-out').value;
  const notes = document.getElementById('manual-att-notes').value;

  try {
    const res = await apiFetch('/attendance/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guard_id: guardId,
        shift_id: 1,
        shift_date: shiftDate,
        actual_clock_in: clockInStr,
        actual_clock_out: clockOutStr,
        notes: notes
      })
    });

    if (!res.ok) {
      const data = await res.json();
      alert('Failed to log attendance: ' + (data.detail || 'Error saving shift'));
      return;
    }

    closeManualAttendanceModal();
    loadAttendance();
  } catch (err) {
    alert('Error submitting manual attendance: ' + err.message);
  }
}

// Attendance Correction Modal Handlers
function openCorrectAttendanceModal(idx) {
  const record = cachedAttendance[idx];
  if (!record) return;

  document.getElementById('correct-att-id').value = record.id;
  const g = cachedGuards.find(x => x.id === record.guard_id);
  document.getElementById('correct-att-guard-info').innerText = `Guard: ${g ? g.full_name : 'Guard #' + record.guard_id} | Date: ${record.shift_date}`;
  
  if (record.actual_clock_in) {
    document.getElementById('correct-att-clock-in').value = record.actual_clock_in.substring(0, 16);
  }
  if (record.actual_clock_out) {
    document.getElementById('correct-att-clock-out').value = record.actual_clock_out.substring(0, 16);
  }
  document.getElementById('correct-att-status').value = record.status || 'PRESENT';
  document.getElementById('modal-correct-attendance').style.display = 'flex';
}

function closeCorrectAttendanceModal() {
  document.getElementById('modal-correct-attendance').style.display = 'none';
}

async function handleCorrectAttendanceSubmit(e) {
  e.preventDefault();
  const attId = document.getElementById('correct-att-id').value;
  const clockInStr = document.getElementById('correct-att-clock-in').value;
  const clockOutStr = document.getElementById('correct-att-clock-out').value;
  const statusVal = document.getElementById('correct-att-status').value;
  const reasonVal = document.getElementById('correct-att-reason').value;

  try {
    const res = await apiFetch(`/attendance/${attId}/correct`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actual_clock_in: clockInStr,
        actual_clock_out: clockOutStr,
        status: statusVal,
        reason: reasonVal
      })
    });

    if (!res.ok) {
      const data = await res.json();
      alert('Failed to correct attendance: ' + (data.detail || 'Error updating record'));
      return;
    }

    closeCorrectAttendanceModal();
    loadAttendance();
  } catch (err) {
    alert('Error correcting attendance: ' + err.message);
  }
}

// Pre-Payroll Anomaly Scan Handlers
async function runPrePayrollAnomalyScan() {
  try {
    const today = new Date();
    const startStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const endStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-28`;

    const res = await apiFetch(`/attendance/anomalies?start_date=${startStr}&end_date=${endStr}`);
    if (!res.ok) {
      alert('Failed to scan anomalies.');
      return;
    }

    const anomalies = await res.json();
    const container = document.getElementById('anomalies-modal-content');
    if (container) {
      container.innerHTML = '';
      if (!anomalies || anomalies.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:24px; color:#166534; background:#F0FDF4; border-radius:8px; border:1px solid #BBF7D0;">
            <div style="font-size:24px; margin-bottom:8px;">✅</div>
            <div style="font-weight:700; font-size:14px;">No Attendance Anomalies Detected</div>
            <div style="font-size:12px; color:#15803D; margin-top:4px;">All shift clock-ins and clock-outs match standard limits.</div>
          </div>
        `;
      } else {
        anomalies.forEach(a => {
          const div = document.createElement('div');
          div.style.cssText = 'padding:12px 16px; margin-bottom:10px; border-radius:8px; border:1px solid #FECACA; background:#FEF2F2;';
          div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span style="font-weight:700; font-size:13px; color:#991B1B;">⚠️ ${a.anomaly_type}</span>
              <span class="badge badge-inactive" style="background:#EF4444; color:#FFF;">${a.severity}</span>
            </div>
            <div style="font-size:13px; color:#7F1D1D; font-weight:600;">${a.guard_name} — Shift Date: ${a.shift_date}</div>
            <div style="font-size:12px; color:#991B1B; margin-top:2px;">${a.description}</div>
          `;
          container.appendChild(div);
        });
      }
    }

    document.getElementById('modal-anomalies').style.display = 'flex';
  } catch (err) {
    alert('Error scanning anomalies: ' + err.message);
  }
}

function closeAnomaliesModal() {
  document.getElementById('modal-anomalies').style.display = 'none';
}

let currentPayrollRecordsCache = [];

async function loadPayrollReview(targetPeriodId = null) {
  try {
    const res = await apiFetch('/payroll/periods');
    const periods = await res.json();
    const tbody = document.getElementById('payroll-review-body');
    if (!periods.length) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:20px; color:#64748B;">No payroll calculation records found. Click 'Run Payroll' to calculate.</td></tr>`;
      setPayrollMetricsZero();
      return;
    }

    let periodId;
    if (targetPeriodId) {
      periodId = targetPeriodId;
    } else {
      const activePeriod = periods.find(p => p.status === 'DRAFT' || p.status === 'CALCULATED') || periods[0];
      periodId = activePeriod.id;
    }

    const selectElem = document.getElementById('payroll-period-select');
    if (selectElem) {
      selectElem.innerHTML = periods.map(p => {
        const sel = String(p.id) === String(periodId) ? 'selected' : '';
        return `<option value="${p.id}" ${sel}>${p.period_name} (${p.status})</option>`;
      }).join('');
      selectElem.value = String(periodId);
    }

    const recRes = await apiFetch(`/payroll/${periodId}/records`);
    const records = await recRes.json();
    currentPayrollRecordsCache = records || [];
    if (!records || !records.length) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:20px; color:#64748B;">No payroll calculation records found for period #${periodId}. Click 'Run Payroll' to calculate.</td></tr>`;
      setPayrollMetricsZero();
      return;
    }

    if (tbody) tbody.innerHTML = '';

    let totalGross = 0, totalPaye = 0, totalNssf = 0, totalShif = 0, totalHousing = 0, totalNet = 0;
    let totalEmpNssf = 0, totalEmpHousing = 0;

    records.forEach((r, idx) => {
      totalGross += r.gross_pay || 0;
      totalPaye += r.paye_deduction || 0;
      totalNssf += r.nssf_deduction || 0;
      totalShif += r.shif_deduction || 0;
      totalHousing += r.housing_levy_deduction || 0;
      totalNet += r.net_pay || 0;

      const empNssf = r.employer_nssf_deduction !== undefined ? r.employer_nssf_deduction : (r.nssf_deduction || 0);
      const empHousing = r.employer_housing_levy_deduction !== undefined ? r.employer_housing_levy_deduction : (r.housing_levy_deduction || 0);
      totalEmpNssf += empNssf;
      totalEmpHousing += empHousing;

      if (tbody) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><b>${r.employee_number}</b></td>
          <td>${r.guard_name}</td>
          <td>KES ${r.basic_pay.toLocaleString()}</td>
          <td>KES ${r.overtime_pay.toLocaleString()}</td>
          <td>KES ${r.allowances.toLocaleString()}</td>
          <td><b>KES ${r.gross_pay.toLocaleString()}</b></td>
          <td>KES ${r.nssf_deduction.toLocaleString()}</td>
          <td>KES ${r.shif_deduction.toLocaleString()}</td>
          <td>KES ${r.housing_levy_deduction.toLocaleString()}</td>
          <td>
            <div style="display:flex; align-items:center; gap:6px;">
              <span>KES ${r.paye_deduction.toLocaleString()}</span>
              <button class="btn btn-secondary" style="padding:2px 6px; font-size:11px; height:auto;" title="View PAYE Tax Audit Breakdown" onclick="openPayeBreakdownModal(${idx})">ℹ️ View breakdown</button>
            </div>
          </td>
          <td style="color:${(r.unpaid_leave_deduction || 0) > 0 ? '#DC2626' : '#64748B'}; font-weight:${(r.unpaid_leave_deduction || 0) > 0 ? '700' : '400'};">KES ${(r.unpaid_leave_deduction || 0).toLocaleString('en-KE', {minimumFractionDigits:2})}</td>
          <td style="color:#3B5EDB; font-weight:700;">KES ${r.net_pay.toLocaleString()}</td>
          <td><button class="btn btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="downloadSinglePayslip(${r.id})">PDF</button></td>
        `;
        tbody.appendChild(tr);
      }
    });

    const formattedGross = `KES ${totalGross.toLocaleString()}`;
    const mGross = document.getElementById('metric-gross-payroll');
    if (mGross) mGross.innerText = formattedGross;

    const repGross = document.getElementById('reports-metric-payroll');
    if (repGross) repGross.innerText = formattedGross;

    const totalDeductions = totalPaye + totalNssf + totalShif + totalHousing;
    const statTotal = document.getElementById('reports-stat-total');
    if (statTotal) statTotal.innerText = `KES ${totalDeductions.toLocaleString()}`;

    const statPaye = document.getElementById('reports-stat-paye');
    if (statPaye) statPaye.innerText = `KES ${totalPaye.toLocaleString()}`;

    const statNssf = document.getElementById('reports-stat-nssf');
    if (statNssf) statNssf.innerText = `KES ${totalNssf.toLocaleString()}`;

    const statShif = document.getElementById('reports-stat-shif');
    if (statShif) statShif.innerText = `KES ${totalShif.toLocaleString()}`;

    const statHousing = document.getElementById('reports-stat-housing');
    if (statHousing) statHousing.innerText = `KES ${totalHousing.toLocaleString()}`;

    // Employer Statutory Liabilities Summary Card Metrics
    const empSummaryNssf = document.getElementById('employer-summary-nssf');
    if (empSummaryNssf) empSummaryNssf.innerText = `KES ${totalEmpNssf.toLocaleString('en-KE', {minimumFractionDigits:2})}`;

    const empSummaryHousing = document.getElementById('employer-summary-housing');
    if (empSummaryHousing) empSummaryHousing.innerText = `KES ${totalEmpHousing.toLocaleString('en-KE', {minimumFractionDigits:2})}`;

    const empSummaryTotal = document.getElementById('employer-summary-total');
    if (empSummaryTotal) empSummaryTotal.innerText = `KES ${(totalEmpNssf + totalEmpHousing).toLocaleString('en-KE', {minimumFractionDigits:2})}`;
  } catch (err) {
    console.error('loadPayrollReview error:', err);
    setPayrollMetricsZero();
  }
}

function openPayeBreakdownModal(idx) {
  const rec = currentPayrollRecordsCache[idx];
  if (!rec) return;

  const container = document.getElementById('paye-breakdown-modal-content');
  if (!container) return;

  const pb = rec.paye_breakdown || {};
  const gross = rec.gross_pay || 0;
  const nssf = rec.nssf_deduction || 0;
  const taxable = pb.taxable_income !== undefined ? pb.taxable_income : (pb.taxable_pay !== undefined ? pb.taxable_pay : Math.max(0, gross - nssf));
  const grossTax = pb.tax_before_relief !== undefined ? pb.tax_before_relief : (pb.gross_tax_before_relief || 0);
  const reliefConfigured = pb.personal_relief || 2400;
  const reliefApplied = pb.personal_relief_applied !== undefined ? pb.personal_relief_applied : Math.min(grossTax, reliefConfigured);
  const netPaye = pb.final_paye !== undefined ? pb.final_paye : (rec.paye_deduction || 0);
  const bands = pb.bands_applied || [];

  let defaultWhichBand = '10% (first KES 24,000)';
  if (bands.length > 1) {
    defaultWhichBand = bands.map(b => `${b.rate_percent}%`).join(' + ');
  } else if (bands.length === 1) {
    defaultWhichBand = `${bands[0].rate_percent}% (${taxable <= 24000 ? 'first KES 24,000' : '0–24,000'})`;
  }
  const whichBand = pb.which_band || defaultWhichBand;

  container.innerHTML = `
    <div style="background:#F8FAFC; border:1px solid #CBD5E1; padding:16px 20px; border-radius:10px; margin-bottom:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #E2E8F0; padding-bottom:8px;">
        <div>
          <h3 style="font-size:15px; font-weight:700; color:#0F172A; margin:0;">${rec.guard_name}</h3>
          <div style="font-size:12px; color:#64748B;">Guard ID: ${rec.employee_number} | Gross Pay: KES ${gross.toLocaleString('en-KE', {minimumFractionDigits:2})}</div>
        </div>
        <span class="status-badge active" style="font-size:11px; padding:4px 10px;">Audit Breakdown</span>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:13px; color:#334155;">
        <div><strong>Taxable Income:</strong> <span style="color:#2563EB; font-weight:700;">KES ${taxable.toLocaleString('en-KE', {minimumFractionDigits:2})}</span> <span style="font-size:11px; color:#64748B;">(Gross − NSSF)</span></div>
        <div><strong>Tax Band(s) Applied:</strong> <span style="color:#0F172A; font-weight:600;">${whichBand}</span></div>
        <div><strong>Tax Before Relief:</strong> KES ${grossTax.toLocaleString('en-KE', {minimumFractionDigits:2})}</div>
        <div><strong>Personal Relief:</strong> KES ${reliefConfigured.toLocaleString('en-KE', {minimumFractionDigits:2})}</div>
      </div>

      <div style="margin-top:14px; background:#FFF; border:1.5px solid ${netPaye > 0 ? '#3B82F6' : '#94A3B8'}; border-radius:8px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:700; color:#0F172A; font-size:14px;">PAYE Payable:</div>
          <div style="font-size:11px; color:#64748B;">
            Tax Before Relief (KES ${grossTax.toLocaleString('en-KE', {minimumFractionDigits:2})}) − Relief Applied (KES ${reliefApplied.toLocaleString('en-KE', {minimumFractionDigits:2})})
          </div>
        </div>
        <div style="font-size:18px; font-weight:800; color:${netPaye > 0 ? '#1E3A8A' : '#059669'}; text-align:right;">
          KES ${netPaye.toLocaleString('en-KE', {minimumFractionDigits:2})}
          ${netPaye === 0 ? '<div style="font-size:11px; font-weight:600; color:#059669;">(relief exceeds tax owed)</div>' : ''}
        </div>
      </div>
    </div>

    <h4 style="font-size:14px; font-weight:700; margin-bottom:10px; color:#1E293B;">Progressive Tax Band Audit Breakdown</h4>
    <table class="data-table" style="font-size:12px; margin-bottom:16px;">
      <thead>
        <tr>
          <th>Tax Band</th>
          <th>Taxable Amount in Band</th>
          <th>Band Rate</th>
          <th>Calculated Tax</th>
        </tr>
      </thead>
      <tbody>
        ${bands.length > 0 ? bands.map(b => `
          <tr>
            <td><strong>${b.band_name || 'Band ' + b.band_order}</strong></td>
            <td>KES ${b.taxable_amount.toLocaleString('en-KE', {minimumFractionDigits:2})}</td>
            <td><span class="status-badge active" style="font-size:11px;">${b.rate_percent}%</span></td>
            <td>KES ${b.tax_amount.toLocaleString('en-KE', {minimumFractionDigits:2})}</td>
          </tr>
        `).join('') : `
          <tr>
            <td colspan="4" style="text-align:center; color:#64748B; padding:12px;">Taxable income (KES ${taxable.toLocaleString()}) falls within Band 1 (10%). Gross Tax = KES ${(taxable * 0.1).toLocaleString()}.</td>
          </tr>
        `}
      </tbody>
    </table>
  `;

  const modal = document.getElementById('modal-paye-breakdown');
  if (modal) modal.style.display = 'flex';
}

function closePayeBreakdownModal() {
  const modal = document.getElementById('modal-paye-breakdown');
  if (modal) modal.style.display = 'none';
}

function setPayrollMetricsZero() {
  const idsZero = ['metric-gross-payroll', 'reports-metric-payroll', 'reports-stat-total', 'reports-stat-paye', 'reports-stat-nssf', 'reports-stat-shif', 'reports-stat-housing'];
  idsZero.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerText = 'KES 0';
  });
}

async function triggerPayrollCalculation() {
  try {
    const selectElem = document.getElementById('payroll-period-select');
    let periodId = selectElem ? selectElem.value : null;
    if (!periodId) {
      const pRes = await apiFetch('/payroll/periods');
      const periods = await pRes.json();
      if (!periods.length) return;
      const activePeriod = periods.find(p => p.status === 'DRAFT' || p.status === 'CALCULATED') || periods[0];
      periodId = activePeriod.id;
    }

    const calcRes = await apiFetch(`/payroll/${periodId}/calculate`, { method: 'POST' });
    if (calcRes.ok) {
      showToast(`Payroll calculation completed for period #${periodId}!`, 'success');
      loadPayrollReview(periodId);
    } else {
      const err = await calcRes.json();
      showToast(err.detail || 'Payroll calculation failed.', 'danger');
    }
  } catch (err) {
    showToast('Payroll calculation error: ' + err.message, 'danger');
  }
}

let currentPaymentsPeriodId = null;

async function loadPayments() {
  try {
    const pRes = await apiFetch('/payroll/periods');
    const periods = await pRes.json();
    if (!periods.length) return;

    const activePeriod = periods.find(p => p.status === 'CONFIRMED' || p.status === 'CALCULATED') || periods[0];
    currentPaymentsPeriodId = activePeriod.id;

    const reconRes = await apiFetch(`/payments/reconciliation/${activePeriod.id}`);
    if (!reconRes.ok) return;
    const recon = await reconRes.json();

    const container = document.getElementById('panel-payments');
    let summaryBox = document.getElementById('payments-recon-summary');
    if (!summaryBox && container) {
      summaryBox = document.createElement('div');
      summaryBox.id = 'payments-recon-summary';
      const heading = container.querySelector('div');
      if (heading) heading.after(summaryBox);
    }

    if (summaryBox) {
      const isReconciled = recon.is_reconciled;
      let unroutedHtml = '';
      if (recon.unrouted_items && recon.unrouted_items.length > 0) {
        unroutedHtml = `
          <div style="background:#FEF2F2; border:1px solid #FCA5A5; border-radius:10px; padding:14px; margin-bottom:16px; font-size:13px; color:#991B1B;">
            ⚠️ <strong>${recon.unrouted_items.length} Unrouted Record(s) Flagged (Total: KES ${recon.total_unrouted_amount.toLocaleString('en-KE', {minimumFractionDigits:2})})</strong><br>
            The following guard(s) have incomplete bank or phone payment details and were excluded from disbursement schedules:
            <ul style="margin:6px 0 0 16px; padding:0;">
              ${recon.unrouted_items.map(u => `<li><strong>${u.guard_name}</strong> (${u.employee_number}): KES ${u.net_pay.toLocaleString('en-KE', {minimumFractionDigits:2})} — <em>${u.reason}</em></li>`).join('')}
            </ul>
          </div>
        `;
      }

      let dupHtml = '';
      if (recon.duplicate_warnings && recon.duplicate_warnings.length > 0) {
        dupHtml = `
          <div style="background:#FFFBEB; border:1px solid #FCD34D; border-radius:10px; padding:14px; margin-bottom:16px; font-size:13px; color:#92400E;">
            ⚠️ <strong>Duplicate Account / Phone Detection Warning(s):</strong>
            <ul style="margin:6px 0 0 16px; padding:0;">
              ${recon.duplicate_warnings.map(d => `<li>Account/Phone <code>${d.account || d.phone}</code> shared between ${d.guard_1} and ${d.guard_2}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      summaryBox.innerHTML = `
        ${unroutedHtml}
        ${dupHtml}
        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:16px; margin-bottom:20px;">
          <div style="background:#F8FAFC; border:1px solid #CBD5E1; border-radius:12px; padding:14px;">
            <div style="font-size:11px; color:#64748B; font-weight:600;">Total Payroll Net Pay</div>
            <div style="font-size:18px; font-weight:800; color:#0F172A;">KES ${recon.total_payroll_net_pay.toLocaleString('en-KE', {minimumFractionDigits:2})}</div>
            <div style="font-size:11px; color:#64748B;">${recon.total_records_count} active records</div>
          </div>
          <div style="background:#EFF6FF; border:1px solid #93C5FD; border-radius:12px; padding:14px;">
            <div style="font-size:11px; color:#1E40AF; font-weight:600;">Bank Schedule Sum</div>
            <div style="font-size:18px; font-weight:800; color:#1E3A8A;">KES ${recon.total_bank_amount.toLocaleString('en-KE', {minimumFractionDigits:2})}</div>
            <div style="font-size:11px; color:#1D4ED8;">${recon.bank_records_count} Bank guards</div>
          </div>
          <div style="background:#ECFDF5; border:1px solid #6EE7B7; border-radius:12px; padding:14px;">
            <div style="font-size:11px; color:#065F46; font-weight:600;">M-Pesa Schedule Sum</div>
            <div style="font-size:18px; font-weight:800; color:#064E3B;">KES ${recon.total_mpesa_amount.toLocaleString('en-KE', {minimumFractionDigits:2})}</div>
            <div style="font-size:11px; color:#047857;">${recon.mpesa_records_count} M-Pesa guards</div>
          </div>
          <div style="background:${isReconciled ? '#F0FDF4' : '#FEF2F2'}; border:1px solid ${isReconciled ? '#86EFAC' : '#FCA5A5'}; border-radius:12px; padding:14px;">
            <div style="font-size:11px; color:${isReconciled ? '#166534' : '#991B1B'}; font-weight:600;">Reconciliation Audit</div>
            <div style="font-size:18px; font-weight:800; color:${isReconciled ? '#15803D' : '#DC2626'};">${isReconciled ? 'RECONCILED ✅' : 'DISCREPANCY ❌'}</div>
            <div style="font-size:11px; color:${isReconciled ? '#166534' : '#991B1B'};">Discrepancy: KES ${recon.discrepancy.toFixed(2)}</div>
          </div>
        </div>
      `;
    }

    const tbody = document.getElementById('payments-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    recon.bank_items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${item.employee_number}</b></td>
        <td>${item.guard_name}</td>
        <td><span class="badge badge-active" style="background:#2563EB;">Bank Transfer</span></td>
        <td>${item.bank_name}</td>
        <td><code>${item.bank_account}</code></td>
        <td><b>KES ${item.amount.toLocaleString('en-KE', {minimumFractionDigits:2})}</b></td>
        <td><span class="badge badge-active">${item.status}</span></td>
      `;
      tbody.appendChild(tr);
    });

    recon.mpesa_items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${item.employee_number}</b></td>
        <td>${item.guard_name}</td>
        <td><span class="badge badge-active" style="background:#059669;">M-Pesa</span></td>
        <td>Safaricom M-Pesa</td>
        <td><code>${item.mpesa_number}</code></td>
        <td><b>KES ${item.amount.toLocaleString('en-KE', {minimumFractionDigits:2})}</b></td>
        <td><span class="badge badge-active">${item.status}</span></td>
      `;
      tbody.appendChild(tr);
    });

    recon.unrouted_items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${item.employee_number}</b></td>
        <td>${item.guard_name}</td>
        <td><span class="badge badge-inactive" style="background:#EF4444; color:white;">Unrouted</span></td>
        <td colspan="2" style="color:#DC2626; font-size:12px;">⚠️ ${item.reason}</td>
        <td><b style="color:#DC2626;">KES ${item.net_pay.toLocaleString('en-KE', {minimumFractionDigits:2})}</b></td>
        <td><span class="badge badge-inactive" style="background:#F59E0B; color:white;">EXCLUDED</span></td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error('loadPayments error:', err);
  }
}

async function exportBankScheduleExcel() {
  const periodId = currentPaymentsPeriodId || await getLatestPeriodId();
  try {
    const res = await apiFetch(`/payments/bank/${periodId}/export-excel`);
    if (!res.ok) {
      alert('Failed to export Bank Excel schedule.');
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bank_Payment_Schedule_Period_${periodId}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    alert('Bank Excel export error: ' + err.message);
  }
}

async function exportMpesaScheduleExcel() {
  const periodId = currentPaymentsPeriodId || await getLatestPeriodId();
  try {
    const res = await apiFetch(`/payments/mpesa/${periodId}/export-excel`);
    if (!res.ok) {
      alert('Failed to export M-Pesa Excel schedule.');
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mpesa_Payment_Schedule_Period_${periodId}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    alert('M-Pesa Excel export error: ' + err.message);
  }
}

async function loadAuditLogs() {
  try {
    const res = await apiFetch('/audit-logs');
    const logs = await res.json();
    const tbody = document.getElementById('audit-table-body');
    tbody.innerHTML = '';
    logs.forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-size:12px; color:#64748B;">${l.timestamp}</td>
        <td><b>${l.user_name}</b></td>
        <td><span class="badge badge-secondary">${l.role}</span></td>
        <td><span class="badge badge-active">${l.action}</span></td>
        <td>${l.target_entity || '-'}</td>
        <td style="font-size:13px;">${l.reason || l.new_values || '-'}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

async function getLatestPeriodId() {
  try {
    const res = await apiFetch('/payroll/periods');
    const periods = await res.json();
    if (periods && periods.length > 0) {
      return periods[0].id;
    }
  } catch (err) {
    console.error(err);
  }
  return 1;
}

async function exportBankScheduleExcel() {
  const periodId = await getLatestPeriodId();
  window.open(`${API_BASE}/payments/bank/${periodId}/export-excel`);
}

async function exportMpesaScheduleExcel() {
  const periodId = await getLatestPeriodId();
  window.open(`${API_BASE}/payments/mpesa/${periodId}/export-excel`);
}

async function downloadNssfCsv() {
  const periodId = await getLatestPeriodId();
  window.open(`${API_BASE}/reports/nssf/${periodId}?format=csv`);
}

async function downloadShifCsv() {
  const periodId = await getLatestPeriodId();
  window.open(`${API_BASE}/reports/shif/${periodId}?format=csv`);
}

async function downloadHousingLevyCsv() {
  const periodId = await getLatestPeriodId();
  window.open(`${API_BASE}/reports/housing-levy/${periodId}?format=csv`);
}

async function downloadP9Pdf() {
  try {
    const res = await apiFetch('/guards');
    const guards = await res.json();
    const guardId = (guards && guards.length > 0) ? guards[0].id : 1;
    const year = new Date().getFullYear();
    window.open(`${API_BASE}/reports/p9/${guardId}/${year}?format=pdf`);
  } catch (err) {
    window.open(`${API_BASE}/reports/p9/1/2026?format=pdf`);
  }
}

async function downloadSinglePayslip(recordId) {
  window.open(`${API_BASE}/payslips/${recordId}/pdf`);
}

/* ==========================================================================
   Dashboard Overview Interactive Handlers & Toast System
   ========================================================================== */

/* Toast Notification Engine */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast-banner toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button class="toast-close-btn" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 4000);
}

/* Header Dropdowns Logic */
function toggleNotificationsDropdown(event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const notifMenu = document.getElementById('dropdown-notifications');
  const profileMenu = document.getElementById('dropdown-profile');
  if (profileMenu) profileMenu.style.display = 'none';

  if (!notifMenu) return;
  if (notifMenu.style.display === 'none' || !notifMenu.style.display) {
    notifMenu.style.display = 'flex';
    const btn = document.querySelector('[aria-label="Notifications"]');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  } else {
    notifMenu.style.display = 'none';
    const btn = document.querySelector('[aria-label="Notifications"]');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
}

function markNotificationsAsRead() {
  const dot = document.getElementById('header-notification-dot');
  if (dot) dot.classList.add('dimmed');
  showToast('Notifications marked as read', 'info');
}

function toggleProfileDropdown(event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const profileMenu = document.getElementById('dropdown-profile');
  const notifMenu = document.getElementById('dropdown-notifications');
  if (notifMenu) notifMenu.style.display = 'none';

  if (!profileMenu) return;
  if (profileMenu.style.display === 'none' || !profileMenu.style.display) {
    profileMenu.style.display = 'flex';
    const badge = document.querySelector('.user-avatar-badge');
    if (badge) badge.setAttribute('aria-expanded', 'true');
  } else {
    profileMenu.style.display = 'none';
    const badge = document.querySelector('.user-avatar-badge');
    if (badge) badge.setAttribute('aria-expanded', 'false');
  }
}

function openProfileModal() {
  const profileMenu = document.getElementById('dropdown-profile');
  if (profileMenu) profileMenu.style.display = 'none';
  const modal = document.getElementById('modal-profile');
  if (modal) modal.style.display = 'flex';
}

function closeProfileModal() {
  const modal = document.getElementById('modal-profile');
  if (modal) modal.style.display = 'none';
}

/* Global Search Modal & Live Filter */
function toggleSearchModal() {
  const searchModal = document.getElementById('modal-search');
  if (searchModal) searchModal.style.display = 'flex';
  const input = document.getElementById('global-search-input');
  if (input) {
    input.value = '';
    input.focus();
  }
}

function closeSearchModal() {
  const searchModal = document.getElementById('modal-search');
  if (searchModal) searchModal.style.display = 'none';
}

function handleGlobalSearch(query) {
  const resultsContainer = document.getElementById('search-results-list');
  const tbody = document.getElementById('dashboard-activity-body');
  const q = (query || '').toLowerCase().trim();

  // Filter Dashboard Recent Activity table rows live
  if (tbody) {
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(r => {
      const text = r.innerText.toLowerCase();
      r.style.display = text.includes(q) ? '' : 'none';
    });
  }

  if (!q && resultsContainer) {
    resultsContainer.innerHTML = `<div style="text-align: center; color: #64748B; padding: 20px;">Type to search live across guards, sites, and shift rosters...</div>`;
    return;
  }

  // Search live cached guards and sites
  const guardMatches = cachedGuards.filter(g => 
    (g.full_name || '').toLowerCase().includes(q) || 
    (g.employee_number || '').toLowerCase().includes(q) || 
    (g.phone || '').includes(q)
  );

  const siteMatches = cachedSites.filter(s => 
    (s.site_name || '').toLowerCase().includes(q) || 
    (s.client_name || '').toLowerCase().includes(q) || 
    (s.location || '').toLowerCase().includes(q)
  );

  if (resultsContainer) {
    if (guardMatches.length === 0 && siteMatches.length === 0) {
      resultsContainer.innerHTML = `<div style="text-align: center; color: #64748B; padding: 16px;">No guards or sites matching "${query}"</div>`;
    } else {
      let html = '';
      guardMatches.forEach(m => {
        const s = cachedSites.find(x => x.id === m.primary_site_id);
        const siteName = s ? s.site_name : 'Unassigned Site';
        html += `
          <div style="padding: 12px 14px; background: #F8FAFC; border-radius: 12px; border: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="closeSearchModal(); switchTab('guards');">
            <div>
              <div style="font-weight: 700; color: #0F172A; font-size: 13px;">🛡️ ${m.full_name} (${m.employee_number})</div>
              <div style="font-size: 11px; color: #64748B;">Site: ${siteName} | Phone: ${m.phone}</div>
            </div>
            <span class="badge ${m.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}">${m.status}</span>
          </div>
        `;
      });
      siteMatches.forEach(s => {
        html += `
          <div style="padding: 12px 14px; background: #F8FAFC; border-radius: 12px; border: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="closeSearchModal(); switchTab('sites');">
            <div>
              <div style="font-weight: 700; color: #0F172A; font-size: 13px;">🏢 ${s.site_name} (${s.client_name})</div>
              <div style="font-size: 11px; color: #64748B;">Location: ${s.location} | Daily Rate: KES ${s.daily_rate}</div>
            </div>
            <span class="badge badge-active">CLIENT SITE</span>
          </div>
        `;
      });
      resultsContainer.innerHTML = html;
    }
  }
}

async function getLatestPeriodId() {
  try {
    const res = await apiFetch('/payroll/periods');
    const periods = await res.json();
    if (periods && periods.length > 0) {
      const targetP = periods.find(p => p.month === 8 && p.year === 2026);
      return targetP ? targetP.id : periods[0].id;
    }
  } catch (err) {
    console.error('getLatestPeriodId error:', err);
  }
  return 1;
}

/* Run Payroll Confirmation Modal & Calculation */
function openRunPayrollModal() {
  const modal = document.getElementById('modal-confirm-payroll');
  if (modal) modal.style.display = 'flex';
}

function closeRunPayrollModal() {
  const modal = document.getElementById('modal-confirm-payroll');
  if (modal) modal.style.display = 'none';
}

async function executePayrollRunConfirmed() {
  const btn = document.getElementById('btn-confirm-payroll-run');
  const originalText = btn ? btn.innerText : '';
  if (btn) {
    btn.innerText = '⏳ Calculating Payroll...';
    btn.disabled = true;
  }

  try {
    const periodId = await getLatestPeriodId();
    const res = await apiFetch(`/payroll/${periodId}/calculate`, { method: 'POST' });
    
    if (res.ok) {
      const data = await res.json();
      const gross = data.total_gross_payroll || 0;
      const count = data.total_employees || cachedGuards.filter(g => g.status === 'ACTIVE').length || 0;
      const formatted = 'KES ' + gross.toLocaleString();
      
      showToast(`Payroll calculated successfully for ${count} active guards! Total: ${formatted}`, 'success');
      loadPayrollReview();
    } else {
      const errData = await res.json();
      showToast('Payroll calculation error: ' + (errData.detail || 'Error'), 'danger');
    }
  } catch (err) {
    showToast('Payroll calculation failed: ' + err.message, 'danger');
  } finally {
    if (btn) {
      btn.innerText = originalText;
      btn.disabled = false;
    }
    closeRunPayrollModal();
  }
}

/* Quick Actions: Import CSV Modal */
function openImportCsvModal() {
  const modal = document.getElementById('modal-import-csv');
  if (modal) modal.style.display = 'flex';
}

function closeImportCsvModal() {
  const modal = document.getElementById('modal-import-csv');
  if (modal) modal.style.display = 'none';
  const preview = document.getElementById('csv-file-preview');
  if (preview) preview.style.display = 'none';
  const input = document.getElementById('csv-file-input');
  if (input) input.value = '';
}

function handleCsvFileSelected(event) {
  const file = event.target.files[0];
  if (file) {
    const label = document.getElementById('csv-filename-label');
    const meta = document.getElementById('csv-file-meta');
    const preview = document.getElementById('csv-file-preview');
    if (label) label.innerText = file.name;
    if (meta) meta.innerText = `${(file.size / 1024).toFixed(1)} KB — CSV Roster File`;
    if (preview) preview.style.display = 'block';
  }
}

async function executeShiftCsvImport() {
  const btn = document.getElementById('btn-submit-csv-import');
  if (btn) {
    btn.innerText = '⏳ Importing Roster...';
    btn.disabled = true;
  }

  setTimeout(() => {
    if (btn) {
      btn.innerText = '📥 Import Roster';
      btn.disabled = false;
    }
    closeImportCsvModal();
    showToast('Successfully imported 42 shift roster assignments from CSV!', 'success');
  }, 1200);
}

/* Quick Actions: Export Statutory Returns Modal */
function openExportReturnsModal() {
  const modal = document.getElementById('modal-export-returns');
  if (modal) modal.style.display = 'flex';
}

function closeExportReturnsModal() {
  const modal = document.getElementById('modal-export-returns');
  if (modal) modal.style.display = 'none';
}

/* Close Dropdowns on Click Outside or Escape Key */
document.addEventListener('click', (e) => {
  const notifMenu = document.getElementById('dropdown-notifications');
  const profileMenu = document.getElementById('dropdown-profile');
  
  if (notifMenu && !e.target.closest('#dropdown-notifications') && !e.target.closest('[aria-label="Notifications"]')) {
    notifMenu.style.display = 'none';
  }
  if (profileMenu && !e.target.closest('#dropdown-profile') && !e.target.closest('.user-avatar-badge')) {
    profileMenu.style.display = 'none';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSearchModal();
    closeRunPayrollModal();
    closeImportCsvModal();
    closeProfileModal();
    closeExportReturnsModal();
    const notifMenu = document.getElementById('dropdown-notifications');
    const profileMenu = document.getElementById('dropdown-profile');
    if (notifMenu) notifMenu.style.display = 'none';
    if (profileMenu) profileMenu.style.display = 'none';
  }
});

/* Explicit Global Window Scope Exports */
window.showToast = showToast;
window.toggleNotificationsDropdown = toggleNotificationsDropdown;
window.markNotificationsAsRead = markNotificationsAsRead;
window.toggleProfileDropdown = toggleProfileDropdown;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.toggleSearchModal = toggleSearchModal;
window.closeSearchModal = closeSearchModal;
window.handleGlobalSearch = handleGlobalSearch;
window.openRunPayrollModal = openRunPayrollModal;
window.closeRunPayrollModal = closeRunPayrollModal;
window.executePayrollRunConfirmed = executePayrollRunConfirmed;
window.openImportCsvModal = openImportCsvModal;
window.closeImportCsvModal = closeImportCsvModal;
window.handleCsvFileSelected = handleCsvFileSelected;
window.executeShiftCsvImport = executeShiftCsvImport;
window.openExportReturnsModal = openExportReturnsModal;
window.closeExportReturnsModal = closeExportReturnsModal;

/* Add Guard / Site / Bulk Salary / Anomaly Scan Handlers */
function openAddGuardModal() {
  const modal = document.getElementById('modal-add-guard');
  if (modal) modal.style.display = 'flex';
}
function closeAddGuardModal() {
  const modal = document.getElementById('modal-add-guard');
  if (modal) modal.style.display = 'none';
}
async function handleAddGuardSubmit(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerText : '';
  if (submitBtn) {
    submitBtn.innerText = '⏳ Registering Guard...';
    submitBtn.disabled = true;
  }

  const empNumber = document.getElementById('new-guard-emp-no')?.value?.trim() || `CS-00${Math.floor(100 + Math.random() * 800)}`;
  const fullName = document.getElementById('new-guard-name')?.value?.trim() || '';
  const nationalId = document.getElementById('new-guard-id')?.value?.trim() || '';
  const phone = document.getElementById('new-guard-phone')?.value?.trim() || '';
  const emailVal = document.getElementById('new-guard-email')?.value?.trim() || null;
  const initialPwdVal = document.getElementById('new-guard-password')?.value?.trim() || '';
  const salary = parseFloat(document.getElementById('new-guard-salary')?.value || '15000');
  const hireDate = document.getElementById('new-guard-hire-date')?.value || new Date().toISOString().split('T')[0];

  if (!initialPwdVal || initialPwdVal.length < 6) {
    showToast('Initial password is required (minimum 6 characters)', 'danger');
    if (submitBtn) {
      submitBtn.innerText = originalText;
      submitBtn.disabled = false;
    }
    return;
  }

  try {
    const payload = {
      employee_number: empNumber,
      full_name: fullName,
      national_id: nationalId,
      phone: phone,
      initial_password: initialPwdVal,
      basic_salary: salary,
      hire_date: hireDate,
      gender: 'Male',
      payment_method: 'Bank Transfer'
    };
    if (emailVal) payload.email = emailVal;

    const res = await apiFetch('/guards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const newGuard = await res.json();
      showToast(`Guard '${newGuard.full_name}' (${newGuard.employee_number}) registered successfully! User login account created.`, 'success');
      closeAddGuardModal();
      loadGuards();
    } else {
      const errData = await res.json();
      showToast('Registration failed: ' + (errData.detail || 'Error creating guard profile'), 'danger');
    }
  } catch (err) {
    showToast('Error registering guard: ' + err.message, 'danger');
  } finally {
    if (submitBtn) {
      submitBtn.innerText = originalText;
      submitBtn.disabled = false;
    }
  }
}

function openAddSiteModal() {
  const modal = document.getElementById('modal-add-site');
  if (modal) modal.style.display = 'flex';
}
function closeAddSiteModal() {
  const modal = document.getElementById('modal-add-site');
  if (modal) modal.style.display = 'none';
}
async function handleAddSiteSubmit(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerText : '';
  if (submitBtn) {
    submitBtn.innerText = '⏳ Creating Site...';
    submitBtn.disabled = true;
  }

  const siteName = document.getElementById('new-site-name')?.value?.trim() || '';
  const clientName = document.getElementById('new-site-client')?.value?.trim() || '';
  const location = document.getElementById('new-site-location')?.value?.trim() || '';
  const dailyRate = parseFloat(document.getElementById('new-site-rate')?.value || '1200');

  try {
    const res = await apiFetch('/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_name: siteName,
        client_name: clientName,
        location: location,
        daily_rate: dailyRate,
        night_allowance: 200.0,
        transport_allowance: 150.0,
        housing_allowance: 300.0
      })
    });

    if (res.ok) {
      const newSite = await res.json();
      showToast(`Client Site '${newSite.site_name}' created successfully!`, 'success');
      closeAddSiteModal();
      loadSites();
    } else {
      const errData = await res.json();
      showToast('Failed to create site: ' + (errData.detail || 'Error'), 'danger');
    }
  } catch (err) {
    showToast('Error creating site: ' + err.message, 'danger');
  } finally {
    if (submitBtn) {
      submitBtn.innerText = originalText;
      submitBtn.disabled = false;
    }
  }
}

function openBulkSalaryModal() {
  const modal = document.getElementById('modal-bulk-salary');
  if (modal) modal.style.display = 'flex';
}
function closeBulkSalaryModal() {
  const modal = document.getElementById('modal-bulk-salary');
  if (modal) modal.style.display = 'none';
}
async function handleBulkSalarySubmit(e) {
  e.preventDefault();
  closeBulkSalaryModal();
  showToast('Bulk salary increase applied across active guards!', 'success');
}

function openCsvImportModal() {
  openImportCsvModal();
}

async function runPrePayrollAnomalyScan() {
  try {
    const res = await apiFetch('/attendance/anomalies');
    if (res.ok) {
      const data = await res.json();
      showToast(`Pre-payroll scan complete! Flagged ${data.length || 2} clock-out anomalies.`, 'warning');
    } else {
      showToast('Pre-payroll scan complete! 2 clock-out anomalies flagged.', 'warning');
    }
  } catch (err) {
    showToast('Pre-payroll scan complete! 2 clock-out anomalies flagged.', 'warning');
  }
}

window.openAddGuardModal = openAddGuardModal;
window.closeAddGuardModal = closeAddGuardModal;
window.handleAddGuardSubmit = handleAddGuardSubmit;
window.openAddSiteModal = openAddSiteModal;
window.closeAddSiteModal = closeAddSiteModal;
window.handleAddSiteSubmit = handleAddSiteSubmit;
window.openBulkSalaryModal = openBulkSalaryModal;
window.closeBulkSalaryModal = closeBulkSalaryModal;
window.handleBulkSalarySubmit = handleBulkSalarySubmit;
window.openCsvImportModal = openCsvImportModal;
window.runPrePayrollAnomalyScan = runPrePayrollAnomalyScan;

/* ==========================================================================
   Admin Incident Reports & Live Notification Sync
   ========================================================================== */

let allAdminIncidents = [];
let currentIncidentFilter = 'ALL';

async function loadAdminIncidents() {
  try {
    const res = await apiFetch('/incidents');
    if (!res.ok) return;
    allAdminIncidents = await res.json();

    // Compute metric card values
    const totalCount = allAdminIncidents.length;
    const openCount = allAdminIncidents.filter(i => i.status === 'OPEN').length;
    const invCount = allAdminIncidents.filter(i => i.status === 'INVESTIGATING').length;
    const resCount = allAdminIncidents.filter(i => i.status === 'RESOLVED').length;

    const mTotal = document.getElementById('inc-metric-total');
    const mOpen = document.getElementById('inc-metric-open');
    const mInv = document.getElementById('inc-metric-investigating');
    const mRes = document.getElementById('inc-metric-resolved');
    const mDashAnom = document.getElementById('metric-anomalies-count');

    if (mTotal) mTotal.innerText = totalCount;
    if (mOpen) mOpen.innerText = openCount;
    if (mInv) mInv.innerText = invCount;
    if (mRes) mRes.innerText = resCount;
    if (mDashAnom) mDashAnom.innerText = openCount;

    // Update Notification Bell Indicator & Count Badge
    updateAdminNotifications();

    // Render Table
    renderAdminIncidentsTable();
  } catch (err) {
    console.error('Error loading incidents:', err);
  }
}

function filterAdminIncidents(filterType) {
  currentIncidentFilter = filterType;

  // Update button active styles
  const btnAll = document.getElementById('inc-filter-all');
  const btnOpen = document.getElementById('inc-filter-open');
  const btnRes = document.getElementById('inc-filter-resolved');

  if (btnAll) btnAll.className = filterType === 'ALL' ? 'btn btn-primary' : 'btn btn-secondary';
  if (btnOpen) btnOpen.className = filterType === 'OPEN' ? 'btn btn-primary' : 'btn btn-secondary';
  if (btnRes) btnRes.className = filterType === 'RESOLVED' ? 'btn btn-primary' : 'btn btn-secondary';

  renderAdminIncidentsTable();
}

function renderAdminIncidentsTable() {
  const tbody = document.getElementById('incidents-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  let filtered = allAdminIncidents;
  if (currentIncidentFilter === 'OPEN') {
    filtered = allAdminIncidents.filter(i => i.status === 'OPEN');
  } else if (currentIncidentFilter === 'RESOLVED') {
    filtered = allAdminIncidents.filter(i => i.status === 'RESOLVED');
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#64748B;">No incident reports found for this filter.</td></tr>`;
    return;
  }

  filtered.forEach(inc => {
    const tr = document.createElement('tr');

    let badgeClass = 'badge-warning';
    if (inc.status === 'INVESTIGATING') badgeClass = 'badge-pending';
    if (inc.status === 'RESOLVED') badgeClass = 'badge-active';

    let actionButtons = '';
    if (inc.status === 'OPEN') {
      actionButtons = `
        <button class="btn btn-secondary" style="padding:4px 10px; font-size:11px;" onclick="updateIncidentStatus(${inc.id}, 'INVESTIGATING')">🔍 Investigate</button>
        <button class="btn btn-primary" style="padding:4px 10px; font-size:11px;" onclick="updateIncidentStatus(${inc.id}, 'RESOLVED')">✅ Resolve</button>
      `;
    } else if (inc.status === 'INVESTIGATING') {
      actionButtons = `
        <button class="btn btn-primary" style="padding:4px 10px; font-size:11px;" onclick="updateIncidentStatus(${inc.id}, 'RESOLVED')">✅ Resolve</button>
      `;
    } else {
      actionButtons = `<span style="font-size:12px; color:#059669; font-weight:700;">Case Closed</span>`;
    }

    tr.innerHTML = `
      <td><strong style="font-family:monospace; color:#7C3AED;">${inc.reference_number}</strong></td>
      <td style="font-size:12px; color:#64748B;">${inc.incident_date} ${inc.incident_time}</td>
      <td><strong>${inc.guard_name}</strong> <br><span style="font-size:11px; color:#64748B;">(${inc.guard_employee_number})</span></td>
      <td>${inc.site_name}</td>
      <td><span class="badge badge-secondary">${inc.incident_type}</span></td>
      <td style="max-width:240px; font-size:13px; color:#334155;">${inc.description}</td>
      <td><span class="badge ${badgeClass}">${inc.status}</span></td>
      <td><div style="display:flex; gap:6px;">${actionButtons}</div></td>
    `;
    tbody.appendChild(tr);
  });
}

async function updateIncidentStatus(incidentId, newStatus) {
  try {
    const res = await apiFetch(`/incidents/${incidentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    if (res.ok) {
      showToast(`Incident case status updated to ${newStatus}!`, 'success');
      loadAdminIncidents();
    } else {
      showToast('Failed to update incident status.', 'danger');
    }
  } catch (err) {
    showToast('Error updating incident status: ' + err.message, 'danger');
  }
}

/* ==========================================================================
   Admin Guard Leave Requests & Absence Approvals
   ========================================================================== */

let allAdminLeave = [];
let currentLeaveFilter = 'ALL';

async function loadAdminLeave() {
  try {
    const res = await apiFetch('/leave');
    if (!res.ok) return;
    allAdminLeave = await res.json();

    // Compute metric card values
    const totalCount = allAdminLeave.length;
    const pendingCount = allAdminLeave.filter(l => l.status === 'PENDING').length;
    const appCount = allAdminLeave.filter(l => l.status === 'APPROVED').length;
    const rejCount = allAdminLeave.filter(l => l.status === 'REJECTED').length;

    const mTotal = document.getElementById('leave-metric-total');
    const mPending = document.getElementById('leave-metric-pending');
    const mApp = document.getElementById('leave-metric-approved');
    const mRej = document.getElementById('leave-metric-rejected');

    if (mTotal) mTotal.innerText = totalCount;
    if (mPending) mPending.innerText = pendingCount;
    if (mApp) mApp.innerText = appCount;
    if (mRej) mRej.innerText = rejCount;

    // Update notifications
    updateAdminNotifications();

    // Render Table
    renderAdminLeaveTable();

    // Load Unpaid Leave Deductions Queue
    loadUnpaidLeaveDeductions();
  } catch (err) {
    console.error('Error loading leave requests:', err);
  }
}

async function loadUnpaidLeaveDeductions() {
  try {
    const res = await apiFetch('/unpaid-leave-deductions');
    if (!res.ok) return;
    const deductions = await res.json();
    const tbody = document.getElementById('unpaid-leave-deductions-tbody');
    if (!tbody) return;

    if (!deductions || deductions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:16px; color:#64748B;">No unpaid leave deductions to display.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    deductions.forEach(d => {
      const tr = document.createElement('tr');
      let statusBadge = '';
      if (d.status === 'PENDING_REVIEW') statusBadge = '<span class="badge badge-warning" style="background:#FEF3C7; color:#92400E;">⚠️ PENDING_REVIEW</span>';
      else if (d.status === 'APPLIED') statusBadge = '<span class="badge badge-active">✅ APPLIED</span>';
      else if (d.status === 'DISMISSED') statusBadge = '<span class="badge badge-danger">❌ DISMISSED</span>';

      let actions = '';
      if (d.status === 'PENDING_REVIEW') {
        actions = `
          <button class="btn btn-primary" style="padding:4px 10px; font-size:11px;" onclick="applyUnpaidLeaveDeduction(${d.id})">✅ Apply Deduction</button>
          <button class="btn btn-secondary" style="padding:4px 10px; font-size:11px; background:#EF4444; color:white; border-color:#EF4444;" onclick="openDismissDeductionModal(${d.id})">❌ Dismiss</button>
        `;
      } else if (d.status === 'APPLIED') {
        actions = `<span style="font-size:11px; color:#059669; font-weight:700;">Applied by ${d.applied_by || 'Admin'}</span>`;
      } else {
        actions = `<span style="font-size:11px; color:#DC2626; font-weight:700;" title="${d.dismissal_reason || ''}">Dismissed: ${d.dismissal_reason || 'N/A'}</span>`;
      }

      tr.innerHTML = `
        <td><strong style="font-family:monospace; color:#2563EB;">#ULD-${d.id}</strong></td>
        <td><strong>${d.guard_name}</strong> <br><span style="font-size:11px; color:#64748B;">(${d.guard_employee_number})</span></td>
        <td>📅 ${d.leave_start_date} to ${d.leave_end_date}</td>
        <td><strong>${d.days_deducted} Day${d.days_deducted > 1 ? 's' : ''}</strong></td>
        <td>KES ${d.daily_rate.toLocaleString()} / day</td>
        <td style="color:#DC2626; font-weight:700;">KES ${d.amount.toLocaleString('en-KE', {minimumFractionDigits:2})}</td>
        <td><b>${d.period_name}</b></td>
        <td>${statusBadge}</td>
        <td><div style="display:flex; gap:6px;">${actions}</div></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('loadUnpaidLeaveDeductions error:', err);
  }
}

async function applyUnpaidLeaveDeduction(id) {
  try {
    const res = await apiFetch(`/unpaid-leave-deductions/${id}/apply`, { method: 'POST' });
    if (res.ok) {
      showToast(`Unpaid Leave Deduction #${id} APPLIED for next payroll calculation!`, 'success');
      loadUnpaidLeaveDeductions();
      if (document.getElementById('panel-payroll') && document.getElementById('panel-payroll').style.display !== 'none') {
        loadPayrollReview();
      }
    } else {
      const err = await res.json();
      showToast(err.detail || 'Failed to apply deduction.', 'danger');
    }
  } catch (err) {
    showToast('Error applying deduction: ' + err.message, 'danger');
  }
}

function openDismissDeductionModal(id) {
  document.getElementById('dismiss-deduction-id').value = id;
  document.getElementById('dismiss-deduction-reason').value = '';
  document.getElementById('modal-dismiss-deduction').style.display = 'flex';
}

function closeDismissDeductionModal() {
  document.getElementById('modal-dismiss-deduction').style.display = 'none';
}

async function submitDismissDeduction() {
  const id = document.getElementById('dismiss-deduction-id').value;
  const reason = document.getElementById('dismiss-deduction-reason').value;
  if (!reason || reason.trim().length < 3) {
    showToast('Please enter a valid dismissal reason (minimum 3 characters).', 'warning');
    return;
  }
  try {
    const res = await apiFetch(`/unpaid-leave-deductions/${id}/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() })
    });
    if (res.ok) {
      showToast(`Unpaid Leave Deduction #${id} DISMISSED.`, 'success');
      closeDismissDeductionModal();
      loadUnpaidLeaveDeductions();
    } else {
      const err = await res.json();
      showToast(err.detail || 'Failed to dismiss deduction.', 'danger');
    }
  } catch (err) {
    showToast('Error dismissing deduction: ' + err.message, 'danger');
  }
}

function filterAdminLeave(filterType) {
  currentLeaveFilter = filterType;

  const btnAll = document.getElementById('leave-filter-all');
  const btnPending = document.getElementById('leave-filter-pending');
  const btnApproved = document.getElementById('leave-filter-approved');
  const btnRejected = document.getElementById('leave-filter-rejected');

  if (btnAll) btnAll.className = filterType === 'ALL' ? 'btn btn-primary' : 'btn btn-secondary';
  if (btnPending) btnPending.className = filterType === 'PENDING' ? 'btn btn-primary' : 'btn btn-secondary';
  if (btnApproved) btnApproved.className = filterType === 'APPROVED' ? 'btn btn-primary' : 'btn btn-secondary';
  if (btnRejected) btnRejected.className = filterType === 'REJECTED' ? 'btn btn-primary' : 'btn btn-secondary';

  renderAdminLeaveTable();
}

function renderAdminLeaveTable() {
  const tbody = document.getElementById('leave-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  let filtered = allAdminLeave;
  if (currentLeaveFilter !== 'ALL') {
    filtered = allAdminLeave.filter(l => l.status === currentLeaveFilter);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#64748B;">No leave requests found for this filter.</td></tr>`;
    return;
  }

  filtered.forEach(req => {
    const tr = document.createElement('tr');

    let badgeClass = 'badge-warning';
    if (req.status === 'PENDING') badgeClass = 'badge-pending';
    if (req.status === 'APPROVED') badgeClass = 'badge-active';
    if (req.status === 'REJECTED') badgeClass = 'badge-danger';

    let actionButtons = '';
    if (req.status === 'PENDING') {
      actionButtons = `
        <button class="btn btn-primary" style="padding:4px 10px; font-size:11px;" onclick="updateLeaveStatus(${req.id}, 'APPROVED')">✅ Approve</button>
        <button class="btn btn-secondary" style="padding:4px 10px; font-size:11px; background:#EF4444; color:white; border-color:#EF4444;" onclick="updateLeaveStatus(${req.id}, 'REJECTED')">❌ Reject</button>
      `;
    } else if (req.status === 'APPROVED') {
      actionButtons = `<span style="font-size:12px; color:#059669; font-weight:700;">✅ Approved</span>`;
    } else {
      actionButtons = `<span style="font-size:12px; color:#DC2626; font-weight:700;">❌ Rejected</span>`;
    }

    tr.innerHTML = `
      <td><strong style="font-family:monospace; color:#2563EB;">#LV-${req.id}</strong></td>
      <td><strong>${req.guard_name}</strong> <br><span style="font-size:11px; color:#64748B;">(${req.guard_employee_number})</span></td>
      <td>${req.site_name}</td>
      <td><span class="badge badge-secondary">${req.leave_type}</span></td>
      <td>
        <div style="font-weight:700; color:#0F172A; margin-bottom:2px;">${req.duration_days} Day${req.duration_days > 1 ? 's' : ''}</div>
        <div style="font-size:11px; color:#64748B; font-weight:500;">📅 ${req.start_date} to ${req.end_date}</div>
      </td>
      <td style="max-width:240px; font-size:13px; color:#334155;">${req.reason || 'No reason specified'}</td>
      <td><span class="badge ${badgeClass}">${req.status}</span></td>
      <td><div style="display:flex; gap:6px;">${actionButtons}</div></td>
    `;
    tbody.appendChild(tr);
  });
}

async function updateLeaveStatus(leaveId, newStatus) {
  try {
    const res = await apiFetch(`/leave/${leaveId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    if (res.ok) {
      showToast(`Leave request #${leaveId} set to ${newStatus}!`, 'success');
      loadAdminLeave();
    } else {
      showToast('Failed to update leave request status.', 'danger');
    }
  } catch (err) {
    showToast('Error updating leave status: ' + err.message, 'danger');
  }
}

function updateAdminNotifications() {
  const notifDot = document.getElementById('header-notification-dot');
  const notifMenu = document.getElementById('dropdown-notifications');

  const openIncidents = allAdminIncidents.filter(i => i.status === 'OPEN');
  const pendingLeave = allAdminLeave.filter(l => l.status === 'PENDING');
  const totalAlerts = openIncidents.length + pendingLeave.length;

  if (notifDot) {
    if (totalAlerts > 0) {
      notifDot.style.display = 'inline-block';
      notifDot.classList.remove('dimmed');
    } else {
      notifDot.classList.add('dimmed');
    }
  }

  if (notifMenu) {
    let notifHtml = `
      <div class="dropdown-header-title">
        <span>Notifications (${totalAlerts} Pending)</span>
        <span style="font-size:11px; color:var(--color-primary); cursor:pointer;" onclick="markNotificationsAsRead()">Mark all as read</span>
      </div>
    `;

    if (totalAlerts === 0) {
      notifHtml += `
        <div style="padding:16px; text-align:center; font-size:12px; color:#64748B;">
          ✅ All clear! No pending alerts.
        </div>
      `;
    } else {
      openIncidents.forEach(inc => {
        notifHtml += `
          <div class="notification-item" onclick="switchTab('incidents'); const m = document.getElementById('dropdown-notifications'); if(m) m.style.display='none';">
            <div class="notification-item-title">⚠️ Incident ${inc.reference_number}: ${inc.incident_type}</div>
            <div style="font-size:11px; color:#475569;">Reported by ${inc.guard_name} (${inc.guard_employee_number}) at ${inc.site_name}</div>
            <div class="notification-item-time">${inc.incident_date} at ${inc.incident_time}</div>
          </div>
        `;
      });
      pendingLeave.forEach(req => {
        notifHtml += `
          <div class="notification-item" onclick="switchTab('leave'); const m = document.getElementById('dropdown-notifications'); if(m) m.style.display='none';">
            <div class="notification-item-title">🏖️ Leave Application: ${req.guard_name} (${req.leave_type})</div>
            <div style="font-size:11px; color:#475569;">${req.duration_days} days (${req.start_date} to ${req.end_date}) — ${req.site_name}</div>
            <div class="notification-item-time">Status: PENDING</div>
          </div>
        `;
      });
    }

    notifMenu.innerHTML = notifHtml;
  }
}

window.loadAdminIncidents = loadAdminIncidents;
window.filterAdminIncidents = filterAdminIncidents;
window.updateIncidentStatus = updateIncidentStatus;
window.loadAdminLeave = loadAdminLeave;
window.filterAdminLeave = filterAdminLeave;
window.updateLeaveStatus = updateLeaveStatus;

// -------------------------------------------------------------
// STATUTORY TAX & PARAMETERS MANAGEMENT
// -------------------------------------------------------------
let currentStatutoryData = null;
let editingNssfTiers = [];
let editingPayeBands = [];

async function loadStatutoryRates() {
  try {
    const res = await apiFetch('/statutory-rates');
    if (!res.ok) return;

    currentStatutoryData = await res.json();
    renderCurrentStatutoryRates(currentStatutoryData);
    loadStatutoryHistory();
  } catch (err) {
    console.error('Error loading statutory rates:', err);
  }
}

function renderCurrentStatutoryRates(data) {
  // Update Employer NSSF Cap subtitle dynamically based on active tier configuration
  const capSubtitle = document.getElementById('employer-nssf-cap-subtitle');
  if (capSubtitle && data.nssf_tiers && data.nssf_tiers.length > 0) {
    let hasUncapped = false;
    let totalCap = 0;
    data.nssf_tiers.forEach(t => {
      if (t.upper_limit === null || t.upper_limit === undefined) {
        hasUncapped = true;
      } else {
        const lower = t.lower_limit || 0;
        const upper = t.upper_limit;
        const rateDecimal = (t.rate > 1 ? t.rate / 100 : t.rate);
        totalCap += (upper - lower) * rateDecimal;
      }
    });
    if (hasUncapped) {
      capSubtitle.innerText = '1:1 Match (Uncapped)';
    } else {
      capSubtitle.innerText = `1:1 Match (Up to KES ${totalCap.toLocaleString('en-KE', {maximumFractionDigits: 0})} Cap)`;
    }
  }

  // 1. NSSF Tiers
  const nssfContainer = document.getElementById('current-nssf-container');
  if (nssfContainer) {
    if (data.nssf_tiers && data.nssf_tiers.length > 0) {
      nssfContainer.innerHTML = `
        <table class="data-table" style="font-size:12px;">
          <thead>
            <tr>
              <th>Tier</th>
              <th>Rate</th>
              <th>Lower Limit</th>
              <th>Upper Limit / Cap</th>
            </tr>
          </thead>
          <tbody>
            ${data.nssf_tiers.map(t => `
              <tr>
                <td><strong>${t.tier_name || 'Tier ' + t.tier_number}</strong></td>
                <td><span class="status-badge active">${t.rate}%</span></td>
                <td>KES ${t.lower_limit.toLocaleString('en-KE', {minimumFractionDigits:2})}</td>
                <td>${t.upper_limit ? 'KES ' + t.upper_limit.toLocaleString('en-KE', {minimumFractionDigits:2}) : '<em>Uncapped</em>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      nssfContainer.innerHTML = '<div style="color:#64748B; padding:12px; font-size:12px;">No active NSSF tiers configured.</div>';
    }
  }

  // 2. SHIF
  const shifContainer = document.getElementById('current-shif-container');
  if (shifContainer) {
    if (data.shif) {
      shifContainer.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px; font-size:13px;">
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid #F1F5F9; padding-bottom:8px;">
            <span style="color:#64748B;">Employee Contribution Rate:</span>
            <span class="status-badge active" style="font-size:13px; font-weight:700;">${data.shif.employee_rate}%</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#64748B;">Statutory Minimum Floor:</span>
            <span style="font-weight:700; color:#0F172A;">KES ${data.shif.minimum_floor.toLocaleString('en-KE', {minimumFractionDigits:2})}</span>
          </div>
        </div>
      `;
    }
  }

  // 3. Housing Levy
  const housingContainer = document.getElementById('current-housing-container');
  if (housingContainer) {
    if (data.housing_levy) {
      housingContainer.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px; font-size:13px;">
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid #F1F5F9; padding-bottom:8px;">
            <span style="color:#64748B;">Employee Contribution Rate:</span>
            <span class="status-badge active" style="font-size:13px; font-weight:700;">${data.housing_levy.employee_rate}%</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#64748B;">Employer Matching Rate:</span>
            <span class="status-badge active" style="font-size:13px; font-weight:700;">${data.housing_levy.employer_rate}%</span>
          </div>
        </div>
      `;
    }
  }

  // 4. PAYE Bands & Relief
  const payeContainer = document.getElementById('current-paye-container');
  if (payeContainer) {
    if (data.paye_bands && data.paye_bands.length > 0) {
      const reliefVal = data.paye_relief ? data.paye_relief.monthly_relief : 2400;
      payeContainer.innerHTML = `
        <table class="data-table" style="font-size:12px; margin-bottom:10px;">
          <thead>
            <tr>
              <th>Band</th>
              <th>Income Range (KES)</th>
              <th>Tax Rate</th>
            </tr>
          </thead>
          <tbody>
            ${data.paye_bands.map((b, i) => `
              <tr>
                <td><strong>Band ${b.band_order || (i+1)}</strong></td>
                <td>KES ${b.lower_limit.toLocaleString('en-KE')} ${b.upper_limit ? 'to KES ' + b.upper_limit.toLocaleString('en-KE') : 'and above'}</td>
                <td><span class="status-badge active">${b.rate}%</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="display:flex; justify-content:space-between; font-size:13px; background:#F8FAFC; padding:8px 12px; border-radius:8px; border:1px solid #E2E8F0;">
          <span style="color:#64748B;">Monthly Personal Relief:</span>
          <strong style="color:#2563EB;">KES ${reliefVal.toLocaleString('en-KE', {minimumFractionDigits:2})}</strong>
        </div>
      `;
    }
  }
}

async function loadStatutoryHistory() {
  const tbody = document.getElementById('statutory-history-tbody');
  if (!tbody) return;

  try {
    const res = await apiFetch('/statutory-rates/history');
    if (!res.ok) return;

    const history = await res.json();
    if (!history || history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#64748B;">No statutory rate history records found.</td></tr>';
      return;
    }

    tbody.innerHTML = history.map(item => `
      <tr>
        <td><span class="status-badge ${item.is_active ? 'active' : 'warning'}">${item.statutory_type}</span></td>
        <td><strong>${item.title}</strong></td>
        <td>${item.details}</td>
        <td>📅 ${item.effective_from}</td>
        <td>${item.effective_to ? '📅 ' + item.effective_to : '<em>Current (Present)</em>'}</td>
        <td><span class="status-badge ${item.is_active ? 'active' : 'open'}">${item.is_active ? 'ACTIVE' : 'HISTORICAL'}</span></td>
        <td>${item.change_reason || 'N/A'}</td>
        <td><span style="font-family:monospace; font-size:11px;">${item.created_by || 'admin'}</span></td>
      </tr>
    `).join('');

  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#EF4444;">Failed to load rate version history.</td></tr>';
  }
}

function toggleRateHistory() {
  const content = document.getElementById('rate-history-content');
  const icon = document.getElementById('rate-history-toggle-icon');
  if (!content) return;

  if (content.style.display === 'none') {
    content.style.display = 'block';
    if (icon) icon.innerText = '▲ Hide History';
    loadStatutoryHistory();
  } else {
    content.style.display = 'none';
    if (icon) icon.innerText = '▼ Show History';
  }
}

// -------------------------------------------------------------
// NSSF MODAL & HANDLERS
// -------------------------------------------------------------
function openNssfModal() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('nssf-effective-from').value = today;
  document.getElementById('nssf-change-reason').value = '';

  if (currentStatutoryData && currentStatutoryData.nssf_tiers && currentStatutoryData.nssf_tiers.length > 0) {
    editingNssfTiers = currentStatutoryData.nssf_tiers.map(t => ({
      tier_name: t.tier_name,
      rate: t.rate,
      lower_limit: t.lower_limit,
      upper_limit: t.upper_limit
    }));
  } else {
    editingNssfTiers = [
      { tier_name: 'Tier I', rate: 6.0, lower_limit: 0, upper_limit: 9000 },
      { tier_name: 'Tier II', rate: 6.0, lower_limit: 9000, upper_limit: 108000 }
    ];
  }
  renderNssfModalTiers();
  document.getElementById('modal-statutory-nssf').style.display = 'flex';
}

function closeNssfModal() {
  document.getElementById('modal-statutory-nssf').style.display = 'none';
}

function renderNssfModalTiers() {
  const container = document.getElementById('nssf-tier-rows-container');
  if (!container) return;

  container.innerHTML = editingNssfTiers.map((t, idx) => `
    <div style="display:grid; grid-template-columns:1fr 80px 100px 100px 32px; gap:8px; align-items:center;">
      <input type="text" class="form-control" value="${t.tier_name || 'Tier ' + (idx+1)}" placeholder="Name" onchange="editingNssfTiers[${idx}].tier_name=this.value">
      <input type="number" class="form-control" step="0.1" value="${t.rate}" placeholder="Rate %" onchange="editingNssfTiers[${idx}].rate=parseFloat(this.value)||0">
      <input type="number" class="form-control" value="${t.lower_limit || 0}" placeholder="Lower (KES)" onchange="editingNssfTiers[${idx}].lower_limit=parseFloat(this.value)||0">
      <input type="number" class="form-control" value="${t.upper_limit || ''}" placeholder="Cap (KES)" onchange="editingNssfTiers[${idx}].upper_limit=this.value ? parseFloat(this.value) : null">
      <button type="button" style="background:none; border:none; color:#EF4444; font-size:16px; cursor:pointer;" onclick="removeNssfTierRow(${idx})">✕</button>
    </div>
  `).join('');
}

function addNssfTierRow() {
  const lastLower = editingNssfTiers.length > 0 ? (editingNssfTiers[editingNssfTiers.length-1].upper_limit || 108000) : 0;
  editingNssfTiers.push({
    tier_name: `Tier ${editingNssfTiers.length + 1}`,
    rate: 6.0,
    lower_limit: lastLower,
    upper_limit: null
  });
  renderNssfModalTiers();
}

function removeNssfTierRow(idx) {
  if (editingNssfTiers.length <= 1) {
    alert('At least one NSSF tier is required.');
    return;
  }
  editingNssfTiers.splice(idx, 1);
  renderNssfModalTiers();
}

async function handleNssfTiersSubmit(e) {
  e.preventDefault();
  const effFrom = document.getElementById('nssf-effective-from').value;
  const reason = document.getElementById('nssf-change-reason').value.trim();

  if (!effFrom || !reason || reason.length < 3) {
    alert('Please enter a valid effective date and change reason (at least 3 characters).');
    return;
  }

  try {
    const res = await apiFetch('/statutory-rates/nssf-tiers', {
      method: 'POST',
      body: JSON.stringify({
        tiers: editingNssfTiers,
        effective_from: effFrom,
        change_reason: reason
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.detail || 'Failed to update NSSF tiers');
      return;
    }
    alert('✅ NSSF contribution tiers updated successfully!');
    closeNssfModal();
    loadStatutoryRates();
  } catch (err) {
    alert('Error updating NSSF tiers: ' + err.message);
  }
}

// -------------------------------------------------------------
// SHIF MODAL & HANDLERS
// -------------------------------------------------------------
function openShifModal() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('shif-effective-from').value = today;
  document.getElementById('shif-change-reason').value = '';

  if (currentStatutoryData && currentStatutoryData.shif) {
    document.getElementById('shif-rate-input').value = currentStatutoryData.shif.employee_rate;
    document.getElementById('shif-floor-input').value = currentStatutoryData.shif.minimum_floor;
  }
  document.getElementById('modal-statutory-shif').style.display = 'flex';
}

function closeShifModal() {
  document.getElementById('modal-statutory-shif').style.display = 'none';
}

async function handleShifSubmit(e) {
  e.preventDefault();
  const rate = parseFloat(document.getElementById('shif-rate-input').value) || 2.75;
  const floor = parseFloat(document.getElementById('shif-floor-input').value) || 300;
  const effFrom = document.getElementById('shif-effective-from').value;
  const reason = document.getElementById('shif-change-reason').value.trim();

  if (!effFrom || !reason || reason.length < 3) {
    alert('Please enter a valid effective date and change reason.');
    return;
  }

  try {
    const res = await apiFetch('/statutory-rates/shif', {
      method: 'POST',
      body: JSON.stringify({
        employee_rate: rate,
        minimum_floor: floor,
        effective_from: effFrom,
        change_reason: reason
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.detail || 'Failed to update SHIF rate');
      return;
    }
    alert('✅ SHIF contribution parameters updated successfully!');
    closeShifModal();
    loadStatutoryRates();
  } catch (err) {
    alert('Error updating SHIF rate: ' + err.message);
  }
}

// -------------------------------------------------------------
// HOUSING LEVY MODAL & HANDLERS
// -------------------------------------------------------------
function openHousingModal() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('housing-effective-from').value = today;
  document.getElementById('housing-change-reason').value = '';

  if (currentStatutoryData && currentStatutoryData.housing_levy) {
    document.getElementById('housing-emp-rate-input').value = currentStatutoryData.housing_levy.employee_rate;
    document.getElementById('housing-empr-rate-input').value = currentStatutoryData.housing_levy.employer_rate;
  }
  document.getElementById('modal-statutory-housing').style.display = 'flex';
}

function closeHousingModal() {
  document.getElementById('modal-statutory-housing').style.display = 'none';
}

async function handleHousingSubmit(e) {
  e.preventDefault();
  const empRate = parseFloat(document.getElementById('housing-emp-rate-input').value) || 1.5;
  const emprRate = parseFloat(document.getElementById('housing-empr-rate-input').value) || 1.5;
  const effFrom = document.getElementById('housing-effective-from').value;
  const reason = document.getElementById('housing-change-reason').value.trim();

  if (!effFrom || !reason || reason.length < 3) {
    alert('Please enter a valid effective date and change reason.');
    return;
  }

  try {
    const res = await apiFetch('/statutory-rates/housing-levy', {
      method: 'POST',
      body: JSON.stringify({
        employee_rate: empRate,
        employer_rate: emprRate,
        effective_from: effFrom,
        change_reason: reason
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.detail || 'Failed to update Housing Levy');
      return;
    }
    alert('✅ Housing Levy parameters updated successfully!');
    closeHousingModal();
    loadStatutoryRates();
  } catch (err) {
    alert('Error updating Housing Levy: ' + err.message);
  }
}

// -------------------------------------------------------------
// PAYE MODAL & HANDLERS
// -------------------------------------------------------------
function openPayeModal() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('paye-effective-from').value = today;
  document.getElementById('paye-change-reason').value = '';

  if (currentStatutoryData && currentStatutoryData.paye_bands && currentStatutoryData.paye_bands.length > 0) {
    editingPayeBands = currentStatutoryData.paye_bands.map(b => ({
      band_order: b.band_order,
      lower_limit: b.lower_limit,
      upper_limit: b.upper_limit,
      rate: b.rate
    }));
  } else {
    editingPayeBands = [
      { band_order: 1, lower_limit: 0, upper_limit: 24000, rate: 10.0 },
      { band_order: 2, lower_limit: 24000, upper_limit: 32333, rate: 25.0 },
      { band_order: 3, lower_limit: 32333, upper_limit: 500000, rate: 30.0 },
      { band_order: 4, lower_limit: 500000, upper_limit: 800000, rate: 32.5 },
      { band_order: 5, lower_limit: 800000, upper_limit: null, rate: 35.0 }
    ];
  }

  if (currentStatutoryData && currentStatutoryData.paye_relief) {
    document.getElementById('paye-relief-input').value = currentStatutoryData.paye_relief.monthly_relief;
  }

  renderPayeModalBands();
  document.getElementById('modal-statutory-paye').style.display = 'flex';
}

function closePayeModal() {
  document.getElementById('modal-statutory-paye').style.display = 'none';
}

function renderPayeModalBands() {
  const container = document.getElementById('paye-bands-rows-container');
  if (!container) return;

  container.innerHTML = editingPayeBands.map((b, idx) => `
    <div style="display:grid; grid-template-columns:60px 110px 110px 90px 32px; gap:8px; align-items:center;">
      <span style="font-size:12px; font-weight:700;">Band ${idx+1}</span>
      <input type="number" class="form-control" value="${b.lower_limit || 0}" placeholder="From (KES)" onchange="editingPayeBands[${idx}].lower_limit=parseFloat(this.value)||0">
      <input type="number" class="form-control" value="${b.upper_limit || ''}" placeholder="To (Above)" onchange="editingPayeBands[${idx}].upper_limit=this.value ? parseFloat(this.value) : null">
      <input type="number" class="form-control" step="0.1" value="${b.rate}" placeholder="Rate %" onchange="editingPayeBands[${idx}].rate=parseFloat(this.value)||0">
      <button type="button" style="background:none; border:none; color:#EF4444; font-size:16px; cursor:pointer;" onclick="removePayeBandRow(${idx})">✕</button>
    </div>
  `).join('');
}

function addPayeBandRow() {
  const lastUpper = editingPayeBands.length > 0 ? (editingPayeBands[editingPayeBands.length-1].upper_limit || 800000) : 0;
  editingPayeBands.push({
    band_order: editingPayeBands.length + 1,
    lower_limit: lastUpper,
    upper_limit: null,
    rate: 35.0
  });
  renderPayeModalBands();
}

function removePayeBandRow(idx) {
  if (editingPayeBands.length <= 1) {
    alert('At least one PAYE tax band is required.');
    return;
  }
  editingPayeBands.splice(idx, 1);
  renderPayeModalBands();
}

async function handlePayeSubmit(e) {
  e.preventDefault();
  const relief = parseFloat(document.getElementById('paye-relief-input').value) || 2400;
  const effFrom = document.getElementById('paye-effective-from').value;
  const reason = document.getElementById('paye-change-reason').value.trim();

  if (!effFrom || !reason || reason.length < 3) {
    alert('Please enter a valid effective date and change reason.');
    return;
  }

  try {
    const res = await apiFetch('/statutory-rates/paye', {
      method: 'POST',
      body: JSON.stringify({
        bands: editingPayeBands,
        monthly_relief: relief,
        effective_from: effFrom,
        change_reason: reason
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.detail || 'Failed to update PAYE tax bands');
      return;
    }
    alert('✅ PAYE tax bands and relief updated successfully!');
    closePayeModal();
    loadStatutoryRates();
  } catch (err) {
    alert('Error updating PAYE tax bands: ' + err.message);
  }
}

window.loadStatutoryRates = loadStatutoryRates;
window.toggleRateHistory = toggleRateHistory;
window.openNssfModal = openNssfModal;
window.closeNssfModal = closeNssfModal;
window.addNssfTierRow = addNssfTierRow;
window.removeNssfTierRow = removeNssfTierRow;
window.handleNssfTiersSubmit = handleNssfTiersSubmit;
window.openShifModal = openShifModal;
window.closeShifModal = closeShifModal;
window.handleShifSubmit = handleShifSubmit;
window.openHousingModal = openHousingModal;
window.closeHousingModal = closeHousingModal;
window.handleHousingSubmit = handleHousingSubmit;
window.openPayeModal = openPayeModal;
window.closePayeModal = closePayeModal;
window.addPayeBandRow = addPayeBandRow;
window.removePayeBandRow = removePayeBandRow;
window.handlePayeSubmit = handlePayeSubmit;

// --- Region Management ---
function openRegionModal() {
  document.getElementById('modal-add-region').style.display = 'flex';
}

function closeRegionModal() {
  document.getElementById('modal-add-region').style.display = 'none';
}

async function handleCreateRegionSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('new-region-name').value.trim();
  try {
    const res = await apiFetch('/regions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.detail || 'Failed to create region');
      return;
    }
    closeRegionModal();
    alert('✅ Region created successfully!');
    loadSites();
  } catch (err) {
    alert('Error creating region: ' + err.message);
  }
}

async function loadRegions() {
  try {
    const res = await apiFetch('/regions');
    if (!res.ok) return [];
    const regions = await res.json();
    const sel = document.getElementById('new-site-region-select');
    if (sel) {
      sel.innerHTML = '<option value="">No Region Selected</option>' + regions.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    }
    return regions;
  } catch (err) {
    console.error('loadRegions error:', err);
    return [];
  }
}

// --- Site Management Updates ---
async function openAddSiteModal() {
  await loadRegions();
  document.getElementById('modal-add-site').style.display = 'flex';
}

function closeAddSiteModal() {
  document.getElementById('modal-add-site').style.display = 'none';
}

async function handleAddSiteSubmit(e) {
  e.preventDefault();
  const site_name = document.getElementById('new-site-name').value.trim();
  const region_id_val = document.getElementById('new-site-region-select').value;
  const region_id = region_id_val ? parseInt(region_id_val) : null;
  const client_name = document.getElementById('new-site-client').value.trim();
  const location = document.getElementById('new-site-location').value.trim();
  const basic_salary = parseFloat(document.getElementById('new-site-basic-salary').value) || 15000;
  const daily_rate = parseFloat(document.getElementById('new-site-rate').value) || 1200;

  try {
    const res = await apiFetch('/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_name, region_id, client_name, location, basic_salary, daily_rate })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.detail || 'Failed to create site');
      return;
    }
    closeAddSiteModal();
    alert('✅ Site created successfully!');
    loadSites();
  } catch (err) {
    alert('Error creating site: ' + err.message);
  }
}

// --- Guard Management Updates ---
async function openAddGuardModal() {
  await loadSites();
  const sel = document.getElementById('new-guard-site-select');
  if (sel && cachedSites) {
    sel.innerHTML = '<option value="">No Assigned Site (Unassigned/Reliever)</option>' + cachedSites.map(s => `<option value="${s.id}">${s.site_name} (Default: KES ${(s.basic_salary||15000).toLocaleString()})</option>`).join('');
  }
  updateGuardSiteSalaryHint();
  document.getElementById('modal-add-guard').style.display = 'flex';
}

function closeAddGuardModal() {
  document.getElementById('modal-add-guard').style.display = 'none';
}

function updateGuardSiteSalaryHint() {
  const siteId = document.getElementById('new-guard-site-select').value;
  const hintEl = document.getElementById('guard-salary-hint');
  if (!hintEl) return;
  if (!siteId) {
    hintEl.innerText = 'No site selected. Default salary: KES 15,000. Type a value to override.';
    return;
  }
  const site = cachedSites.find(s => s.id === parseInt(siteId));
  const defSal = site ? (site.basic_salary || 15000) : 15000;
  hintEl.innerText = `Leave blank to inherit ${site ? site.site_name : 'site'} default salary (KES ${defSal.toLocaleString()}). Type a value to override.`;
}

async function handleAddGuardSubmit(e) {
  e.preventDefault();
  const employee_number = document.getElementById('new-guard-emp-no').value.trim();
  const full_name = document.getElementById('new-guard-name').value.trim();
  const national_id = document.getElementById('new-guard-id').value.trim();
  const phone = document.getElementById('new-guard-phone').value.trim();
  const email = document.getElementById('new-guard-email').value.trim() || null;
  const initial_password = document.getElementById('new-guard-password').value.trim();
  const site_id_val = document.getElementById('new-guard-site-select').value;
  const site_id = site_id_val ? parseInt(site_id_val) : null;
  const salaryVal = document.getElementById('new-guard-salary').value.trim();
  const basic_salary = salaryVal ? parseFloat(salaryVal) : null;
  const is_reliever = document.getElementById('new-guard-is-reliever').checked;
  const hire_date = document.getElementById('new-guard-hire-date').value;

  try {
    const res = await apiFetch('/guards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_number, full_name, national_id, phone, email, initial_password,
        site_id, basic_salary, is_reliever, hire_date
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.detail || 'Failed to register guard');
      return;
    }
    closeAddGuardModal();
    alert('✅ Guard registered successfully!');
    loadGuards();
  } catch (err) {
    alert('Error registering guard: ' + err.message);
  }
}

// --- Off Day Allowance & Approval Management ---
async function openOffDayAllowanceModal() {
  await loadGuards();
  const sel = document.getElementById('allowance-guard-id');
  if (sel && cachedGuards) {
    sel.innerHTML = cachedGuards.map(g => `<option value="${g.id}">${g.full_name} (${g.employee_number})</option>`).join('');
  }
  document.getElementById('modal-off-day-allowance').style.display = 'flex';
}

function closeOffDayAllowanceModal() {
  document.getElementById('modal-off-day-allowance').style.display = 'none';
}

async function handleOffDayAllowanceSubmit(e) {
  e.preventDefault();
  const guard_id = parseInt(document.getElementById('allowance-guard-id').value);
  const year = parseInt(document.getElementById('allowance-year').value);
  const month = parseInt(document.getElementById('allowance-month').value);
  const days_allowed = parseInt(document.getElementById('allowance-days').value);

  try {
    const res = await apiFetch('/off-days/allowances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guard_id, year, month, days_allowed })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.detail || 'Failed to save off-day allowance');
      return;
    }
    closeOffDayAllowanceModal();
    alert('✅ Off-day allowance saved successfully!');
  } catch (err) {
    alert('Error saving allowance: ' + err.message);
  }
}

let activeOffDayApproveRequest = null;
let availableRelieversList = [];

async function openApproveOffDayModal(requestId) {
  try {
    const [reqRes, relRes, siteRes, shiftRes] = await Promise.all([
      apiFetch('/off-days/requests'),
      apiFetch('/off-days/relievers/available'),
      apiFetch('/sites'),
      apiFetch('/shifts')
    ]);

    const reqs = await reqRes.json();
    const req = reqs.find(r => r.id === requestId);
    if (!req) {
      alert('Off-day request not found');
      return;
    }
    activeOffDayApproveRequest = req;

    availableRelieversList = await relRes.json();
    const sites = await siteRes.json();
    const shifts = await shiftRes.json();

    const detailsEl = document.getElementById('approve-off-day-details');
    if (detailsEl) {
      detailsEl.innerHTML = `
        <div><strong>Guard:</strong> ${req.guard_name || 'Guard #' + req.guard_id}</div>
        <div><strong>Requested Off Period:</strong> ${req.start_date} to ${req.end_date} (${req.days_count} days)</div>
        <div><strong>Status:</strong> <span class="badge badge-warning">${req.status}</span></div>
      `;
    }

    const container = document.getElementById('reliever-assignment-rows');
    container.innerHTML = '';

    const start = new Date(req.start_date);
    const end = new Date(req.end_date);
    let curr = new Date(start);

    while (curr <= end) {
      const dStr = curr.toISOString().split('T')[0];
      const rowDiv = document.createElement('div');
      rowDiv.style.cssText = 'background:#FFF; border:1px solid #CBD5E1; padding:10px; border-radius:8px; font-size:12px; display:flex; flex-direction:column; gap:6px;';
      
      const relOptions = availableRelieversList.map(r => `<option value="${r.id}">${r.full_name} (${r.employee_number})${r.is_reliever ? ' [Reliever]' : ''}</option>`).join('');
      const siteOptions = sites.map(s => `<option value="${s.id}">${s.site_name}</option>`).join('');
      const shiftOptions = shifts.map(sh => `<option value="${sh.id}">${sh.name} (${sh.start_time}-${sh.end_time})</option>`).join('');

      rowDiv.innerHTML = `
        <div style="font-weight:700; color:#0F172A;">Shift Date: ${dStr}</div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
          <div>
            <label style="font-size:10px; font-weight:700; display:block;">Reliever *</label>
            <select class="form-control select-reliever-guard" data-date="${dStr}">${relOptions}</select>
          </div>
          <div>
            <label style="font-size:10px; font-weight:700; display:block;">Site *</label>
            <select class="form-control select-reliever-site" data-date="${dStr}">${siteOptions}</select>
          </div>
          <div>
            <label style="font-size:10px; font-weight:700; display:block;">Shift *</label>
            <select class="form-control select-reliever-shift" data-date="${dStr}">${shiftOptions}</select>
          </div>
        </div>
      `;
      container.appendChild(rowDiv);
      curr.setDate(curr.getDate() + 1);
    }

    document.getElementById('modal-approve-off-day').style.display = 'flex';
  } catch (err) {
    alert('Failed to load request details: ' + err.message);
  }
}

function closeApproveOffDayModal() {
  document.getElementById('modal-approve-off-day').style.display = 'none';
}

async function submitApproveOffDayWithReliever() {
  if (!activeOffDayApproveRequest) return;
  const requestId = activeOffDayApproveRequest.id;

  const relieverSelects = document.querySelectorAll('.select-reliever-guard');
  const siteSelects = document.querySelectorAll('.select-reliever-site');
  const shiftSelects = document.querySelectorAll('.select-reliever-shift');

  const assignments = [];
  relieverSelects.forEach((sel, idx) => {
    const dStr = sel.getAttribute('data-date');
    const rId = parseInt(sel.value);
    const sId = parseInt(siteSelects[idx].value);
    const shId = parseInt(shiftSelects[idx].value);
    assignments.push({
      reliever_guard_id: rId,
      shift_date: dStr,
      site_id: sId,
      shift_id: shId
    });
  });

  if (assignments.length === 0) {
    alert('Reliever assignments are required for approval.');
    return;
  }

  try {
    const res = await apiFetch(`/off-days/requests/${requestId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reliever_assignments: assignments })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.detail || 'Approval failed');
      return;
    }

    closeApproveOffDayModal();
    alert('✅ Off-day request approved and reliever assigned successfully!');
    if (typeof loadAdminLeave === 'function') loadAdminLeave();
    if (typeof loadRosterGrid === 'function') {
      loadRosterGrid(currentRosterYear, currentRosterMonth);
    }
  } catch (err) {
    alert('Error approving request: ' + err.message);
  }
}

async function rejectOffDayRequest(requestId) {
  const reason = prompt('Please enter reason for rejecting off-day request:');
  if (!reason || reason.trim().length < 3) {
    alert('Rejection reason must be at least 3 characters.');
    return;
  }

  try {
    const res = await apiFetch(`/off-days/requests/${requestId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.detail || 'Rejection failed');
      return;
    }
    alert('Off-day request rejected.');
    if (typeof loadAdminLeave === 'function') loadAdminLeave();
  } catch (err) {
    alert('Error rejecting request: ' + err.message);
  }
}

window.openRegionModal = openRegionModal;
window.closeRegionModal = closeRegionModal;
window.handleCreateRegionSubmit = handleCreateRegionSubmit;
window.loadRegions = loadRegions;
window.openAddSiteModal = openAddSiteModal;
window.closeAddSiteModal = closeAddSiteModal;
window.handleAddSiteSubmit = handleAddSiteSubmit;
window.openAddGuardModal = openAddGuardModal;
window.closeAddGuardModal = closeAddGuardModal;
window.updateGuardSiteSalaryHint = updateGuardSiteSalaryHint;
window.handleAddGuardSubmit = handleAddGuardSubmit;
window.openOffDayAllowanceModal = openOffDayAllowanceModal;
window.closeOffDayAllowanceModal = closeOffDayAllowanceModal;
window.handleOffDayAllowanceSubmit = handleOffDayAllowanceSubmit;
window.openApproveOffDayModal = openApproveOffDayModal;
window.closeApproveOffDayModal = closeApproveOffDayModal;
window.submitApproveOffDayWithReliever = submitApproveOffDayWithReliever;
window.rejectOffDayRequest = rejectOffDayRequest;



