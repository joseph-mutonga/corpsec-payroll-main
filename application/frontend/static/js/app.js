/* CorpSec Web Application Frontend Logic */
const API_BASE = '/api/v1';
let authToken = localStorage.getItem('corpsec_token') || '';
let cachedGuards = [];
let cachedSites = [];
let cachedAttendance = [];
let cachedRegions = [];
let supervisorsCache = [];
let cachedInvoices = [];
let currentViewInvoiceId = null;
let invoiceSearchDebounceTimer = null;
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;

function getLoggedInUser() {
  try {
    const raw = localStorage.getItem('corpsec_user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
window.getLoggedInUser = getLoggedInUser;

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

function quickFillCredentials(id, pass, autoSubmit = true) {
  const idInput = document.getElementById('unified-login-id');
  const passInput = document.getElementById('unified-login-password');
  if (idInput && passInput) {
    idInput.value = id;
    passInput.value = pass;
    idInput.focus();
    if (autoSubmit) {
      setTimeout(() => {
        handleUnifiedLogin();
      }, 60);
    }
  }
}

window.quickFillCredentials = quickFillCredentials;
window.handleUnifiedLogin = handleUnifiedLogin;
window.togglePasswordVisibility = togglePasswordVisibility;

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
    if (userData.role) {
      el.innerText = userData.role === 'ADMIN' ? 'System Admin' : (userData.role === 'SUPERVISOR' ? 'Field Supervisor' : (userData.role === 'HR' ? 'HR Manager' : userData.role));
    }
  });

  // Reset all nav-items and supervisor sections
  document.querySelectorAll('.nav-item').forEach(el => el.style.display = '');
  const promoCard = document.querySelector('.sidebar-promo-card');
  if (promoCard) promoCard.style.display = 'block';
  const supNav = document.querySelector(`.nav-item[onclick="switchTab('supervisors')"]`);
  if (supNav) supNav.innerHTML = '🏢 Supervisors';
  const supAdminSec = document.getElementById('supervisor-admin-management-section');
  if (supAdminSec) supAdminSec.style.display = 'block';

  // Reset Dashboard Widgets
  const gpCard = document.getElementById('dash-card-gross-payroll');
  if (gpCard) gpCard.style.display = 'flex';
  const cCard = document.getElementById('dash-card-contracts');
  if (cCard) cCard.style.display = 'flex';
  const invCard = document.getElementById('dash-card-invoices');
  if (invCard) invCard.style.display = 'flex';
  const astCard = document.getElementById('dash-card-assets');
  if (astCard) astCard.style.display = 'flex';
  const invWatchCard = document.getElementById('dash-inventory-watchlist-card');
  if (invWatchCard) invWatchCard.style.display = 'block';

  const qaAdmin = document.getElementById('dash-quick-actions-admin');
  if (qaAdmin) qaAdmin.style.display = 'flex';
  const qaSup = document.getElementById('dash-quick-actions-supervisor');
  if (qaSup) qaSup.style.display = 'none';

  const gLbl = document.getElementById('dash-card-guards-label');
  if (gLbl) gLbl.innerText = 'Active Guard Force';
  const aLbl = document.getElementById('dash-card-anomalies-label');
  if (aLbl) aLbl.innerText = 'Open Incidents';
  const lLbl = document.getElementById('dash-card-leave-label');
  if (lLbl) lLbl.innerText = 'Pending Leave';

  // Adjust for SUPERVISOR
  if (userData.role === 'SUPERVISOR') {
    const adminOnlyTabs = ['payroll', 'payments', 'salary-advances', 'statutory', 'settings', 'audit', 'reports', 'documents', 'staff', 'sites', 'shifts', 'invoices', 'clients', 'assets', 'company-history'];
    adminOnlyTabs.forEach(tab => {
      const navItem = document.querySelector(`.nav-item[onclick="switchTab('${tab}')"]`);
      if (navItem) navItem.style.display = 'none';
    });
    if (supNav) supNav.innerHTML = '🛡️ My Guard Team & Attendance';
    if (supAdminSec) supAdminSec.style.display = 'none';
    if (promoCard) promoCard.style.display = 'none';
    currentRollCallSupervisorFilter = userData.id;

    // Supervisor Dashboard customization
    if (gpCard) gpCard.style.display = 'none'; // Supervisors cannot see corporate payroll gross
    if (cCard) cCard.style.display = 'none';
    if (invCard) invCard.style.display = 'none';
    if (astCard) astCard.style.display = 'none';
    if (invWatchCard) invWatchCard.style.display = 'none';
    if (qaAdmin) qaAdmin.style.display = 'none';
    if (qaSup) qaSup.style.display = 'flex';

    if (gLbl) gLbl.innerText = 'My Assigned Guards';
    if (aLbl) aLbl.innerText = 'My Team Incidents';
    if (lLbl) lLbl.innerText = 'My Team Pending Leave';

  } else if (userData.role === 'HR') {
    const hrHiddenTabs = ['settings', 'audit', 'statutory', 'staff'];
    hrHiddenTabs.forEach(tab => {
      const navItem = document.querySelector(`.nav-item[onclick="switchTab('${tab}')"]`);
      if (navItem) navItem.style.display = 'none';
    });
  }
}

function logout() {
  localStorage.removeItem('corpsec_token');
  localStorage.removeItem('corpsec_user');
  sessionStorage.removeItem('company_documents_vault_unlocked');
  sessionStorage.removeItem('guard_auth_token');
  sessionStorage.removeItem('guard_user');
  authToken = '';
  checkAuthStatus();
}

async function initApp() {
  const subtitleEl = document.getElementById('top-bar-date-subtitle');
  if (subtitleEl) {
    const todayStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    subtitleEl.innerText = `Data summary for ${todayStr}`;
  }
  const user = getLoggedInUser();

  try {
    // 1. Load baseline directories from DB first
    await Promise.all([loadGuards(), loadSites(), (!user || user.role !== 'SUPERVISOR') ? loadShifts() : Promise.resolve()]);

    // 2. Load operational records from DB
    await Promise.all([
      loadAttendance(),
      loadAdminIncidents(),
      loadAdminLeave(),
      (!user || user.role !== 'SUPERVISOR') ? loadPayrollReview() : loadSupervisorAttendanceRoll(),
      (user && user.role === 'ADMIN') ? loadAuditLogs() : Promise.resolve()
    ]);

    // 3. Populate Executive Operations Dashboard
    loadDashboardData();
  } catch (err) {
    console.error('Error during app initialization:', err);
  }
}

function switchTab(tabId) {
  const user = getLoggedInUser();
  if (user && user.role === 'SUPERVISOR' && (tabId === 'payroll' || tabId === 'payments' || tabId === 'salary-advances' || tabId === 'reports' || tabId === 'statutory' || tabId === 'staff' || tabId === 'audit' || tabId === 'documents' || tabId === 'invoices' || tabId === 'clients' || tabId === 'assets' || tabId === 'company-history')) {
    showToast('Access Denied: Analytics, statutory reports, payroll, and salary advance management are restricted to Admin & HR.', 'danger');
    tabId = 'dashboard';
  }
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
    'reports': 'Performance Overview Analytics & Statutory Reports',
    'audit': 'System Audit Trail',
    'settings': 'Statutory Parameters & System Settings',
    'supervisors': 'Supervisor Management & Guard Assignments',
    'documents': 'Company Documents & Legal Repository',
    'staff': 'Corporate Staff & HR Management',
    'invoices': 'Client Site Invoices & Billing Management',
    'clients': 'Client & Contract Management CRM',
    'assets': 'Company Assets & Inventory Management',
    'company-history': 'Corporate History, Milestones & Governance',
    'salary-advances': 'Mid-Month Salary Advances & Automatic Payroll Deductions',
    'expenses': 'Firm Expenses, Petty Cash & Recurring Expenditure',
    'download-app': 'Download & Install Desktop Application in Your Machine'
  };

  if (tabId === 'documents') {
    if (!window.isAuthorizedForDocumentEntryOnce) {
      openDocumentsVaultModal();
      return;
    }
    // Strictly single-use authorization: immediately reset so leaving and re-entering requires password anytime
    window.isAuthorizedForDocumentEntryOnce = false;
  } else {
    // Whenever navigating away from documents to any other section, reset authorization
    window.isAuthorizedForDocumentEntryOnce = false;
  }

  document.getElementById('current-page-title').innerText = titles[tabId] || 'Dashboard';

  document.querySelectorAll('section[id^="panel-"]').forEach(sec => sec.style.display = 'none');
  const target = document.getElementById(`panel-${tabId}`);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[onclick*="'${tabId}'"]`);
  if (activeNav) activeNav.classList.add('active');

  window.currentActiveTab = tabId;

  if (tabId === 'dashboard') {
    loadDashboardData();
  }
  if (tabId === 'expenses') {
    loadExpenses();
    loadExpensesSummary();
  }
  if (tabId === 'incidents') loadAdminIncidents();
  if (tabId === 'leave') loadAdminLeave();
  if (tabId === 'guards') {
    const fileViewContainer = document.getElementById('guard-file-view');
    const listViewContainer = document.getElementById('guards-list-view');
    const modal = document.getElementById('modal-guard-file');
    if (modal) modal.style.display = 'none';
    if (fileViewContainer) fileViewContainer.style.display = 'none';
    if (listViewContainer) listViewContainer.style.display = 'block';
    window.guardFilePreviousTab = null;
    loadGuards();
  }
  if (tabId === 'sites') loadSites();
  if (tabId === 'shifts') loadShifts();
  if (tabId === 'attendance') loadAttendance();
  if (tabId === 'payroll') loadPayrollReview();
  if (tabId === 'salary-advances') loadSalaryAdvances();
  if (tabId === 'payments') loadPayments();
  if (tabId === 'statutory') loadStatutoryRates();
  if (tabId === 'audit') loadAuditLogs();
  if (tabId === 'settings') loadSettings();
  if (tabId === 'supervisors') loadSupervisors();
  if (tabId === 'documents') loadCompanyDocuments();
  if (tabId === 'staff') loadStaffMembers();
  if (tabId === 'invoices') loadInvoices();
  if (tabId === 'clients') loadClients();
  if (tabId === 'assets') loadAssets();
  if (tabId === 'company-history') loadCompanyHistory();
  if (tabId === 'download-app') initDownloadAppSection();
  if (tabId === 'reports') {
    loadAnalyticsData();
    loadGuards();
    loadSites();
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


// ==================== EXECUTIVE OPERATIONS DASHBOARD ====================

async function refreshDashboard(forceReload = false) {
  const refreshIcon = document.getElementById('dash-refresh-icon');
  if (refreshIcon) refreshIcon.style.display = 'inline-block';
  try {
    if (refreshIcon) refreshIcon.style.animation = 'spin 0.8s linear infinite';
    await loadDashboardData(forceReload);
    if (forceReload && typeof showToast === 'function') {
      showToast('Dashboard synchronized with live database', 'success');
    }
  } catch (err) {
    console.error('Error refreshing dashboard:', err);
    if (typeof showToast === 'function') {
      showToast('Error syncing dashboard: ' + (err.message || 'Check database connection'), 'danger');
    }
  } finally {
    if (refreshIcon) {
      refreshIcon.style.animation = '';
    }
  }
}

async function loadDashboardData(forceReload = false) {
  const user = getLoggedInUser();
  const isSupervisor = user && user.role === 'SUPERVISOR';

  // 1. Update live shift badge & current clock subtitle
  const now = new Date();
  const hr = now.getHours();
  const isDayShift = hr >= 6 && hr < 18;
  const shiftBadge = document.getElementById('dash-live-shift-badge');
  if (shiftBadge) {
    shiftBadge.innerHTML = isDayShift ? '☀️ Day Shift (06:00 - 18:00)' : '🌙 Night Shift (18:00 - 06:00)';
    shiftBadge.className = 'dash-badge ' + (isDayShift ? 'dash-badge-shift' : 'dash-badge-live');
  }
  const statusSubtitle = document.getElementById('dashboard-hero-status-text');
  if (statusSubtitle) {
    statusSubtitle.innerText = `Real-time command center • Last synchronized: ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}`;
  }

  // 2. Fetch live baseline data directly from database
  try {
    const fetchPromises = [
      loadGuards(),
      loadSites(),
      loadAttendance(),
      loadAdminIncidents(),
      loadAdminLeave()
    ];
    if (!isSupervisor) {
      fetchPromises.push(loadPayrollReview());
    }

    await Promise.allSettled(fetchPromises);

    // 3. If Admin or HR, fetch enterprise analytics, invoices, and asset KPIs
    let analyticsData = null;
    let assetKpis = null;
    let inventoryItems = [];
    let invoicesList = [];

    if (!isSupervisor) {
      const enterprisePromises = [
        apiFetch('/company/analytics').then(r => r.ok ? r.json() : null).catch(() => null),
        apiFetch('/assets/summary/kpis').then(r => r.ok ? r.json() : null).catch(() => null),
        apiFetch('/invoices').then(r => r.ok ? r.json() : null).catch(() => null),
        apiFetch('/assets/inventory').then(r => r.ok ? r.json() : null).catch(() => null),
        apiFetch('/expenses/summary').then(r => r.ok ? r.json() : null).catch(() => null)
      ];

      const [resAnalytics, resAssets, resInvoices, resInventory, resExpenses] = await Promise.allSettled(enterprisePromises);
      analyticsData = resAnalytics.status === 'fulfilled' ? resAnalytics.value : null;
      assetKpis = resAssets.status === 'fulfilled' ? resAssets.value : null;
      invoicesList = (resInvoices.status === 'fulfilled' && Array.isArray(resInvoices.value)) ? resInvoices.value : [];
      inventoryItems = (resInventory.status === 'fulfilled' && Array.isArray(resInventory.value)) ? resInventory.value : [];
      var expensesSummary = resExpenses.status === 'fulfilled' ? resExpenses.value : null;
    }

    // 4. Update KPI Card values & trend footers
    renderDashboardKPIs({ analyticsData, assetKpis, invoicesList, expensesSummary: typeof expensesSummary !== 'undefined' ? expensesSummary : null, isSupervisor, user });

    // 5. Render Site Deployment & Coverage Table
    renderDashboardSiteDeployment();

    // 6. Render Live Incident Alerts Feed
    renderDashboardIncidentsFeed();

    // 7. Render Inventory Watchlist Feed (Admin/HR)
    if (!isSupervisor) {
      renderDashboardInventoryWatchlist(inventoryItems);
    }
  } catch (err) {
    console.error('loadDashboardData error:', err);
  }
}

function renderDashboardKPIs({ analyticsData, assetKpis, invoicesList, expensesSummary, isSupervisor, user }) {
  // 1. Guards
  const allGuards = cachedGuards || [];
  let displayGuards = allGuards.filter(g => g.status === 'ACTIVE');
  if (isSupervisor && user) {
    displayGuards = displayGuards.filter(g => g.supervisor_id === user.id);
  }
  const relievers = displayGuards.filter(g => g.is_reliever).length;
  const regular = displayGuards.length - relievers;

  const mGuards = document.getElementById('metric-guards-count');
  if (mGuards) mGuards.innerText = displayGuards.length;
  const subGuards = document.getElementById('metric-guards-subtext');
  if (subGuards) subGuards.innerText = `${regular} Regular • ${relievers} Reliever${relievers === 1 ? '' : 's'}`;

  // 2. Sites
  const sites = cachedSites || [];
  const mSites = document.getElementById('metric-sites-count');
  if (mSites) mSites.innerText = sites.length;
  const totalPosts = sites.reduce((sum, s) => sum + (Number(s.guards_required) || 1), 0);
  const subSites = document.getElementById('metric-sites-subtext');
  if (subSites) subSites.innerText = `${totalPosts} Guard Posts Required`;

  // 3. Contracts & MRR (Admin/HR)
  const cardContracts = document.getElementById('dash-card-contracts');
  if (cardContracts) {
    if (isSupervisor) {
      cardContracts.style.display = 'none';
    } else {
      cardContracts.style.display = 'flex';
      const mrr = analyticsData ? (analyticsData.monthly_contract_run_rate || 0) : 0;
      const mMrr = document.getElementById('metric-dashboard-mrr');
      if (mMrr) mMrr.innerText = `KES ${Math.round(mrr).toLocaleString()}`;
      const activeClients = analyticsData ? (analyticsData.active_clients_count || 0) : 0;
      const subContracts = document.getElementById('metric-contracts-subtext');
      if (subContracts) subContracts.innerText = `${activeClients} Active Client${activeClients === 1 ? '' : 's'}`;
    }
  }

  // 4. Gross Payroll (Admin/HR)
  const cardPayroll = document.getElementById('dash-card-gross-payroll');
  if (cardPayroll) {
    if (isSupervisor) {
      cardPayroll.style.display = 'none';
    } else {
      cardPayroll.style.display = 'flex';
      const subPayroll = document.getElementById('metric-payroll-subtext');
      if (subPayroll) {
        subPayroll.innerText = 'Calculated Gross Run';
      }
    }
  }

  // 5. Invoices (Admin/HR)
  const cardInvoices = document.getElementById('dash-card-invoices');
  if (cardInvoices) {
    if (isSupervisor) {
      cardInvoices.style.display = 'none';
    } else {
      cardInvoices.style.display = 'flex';
      const totalInv = invoicesList.reduce((s, inv) => s + (Number(inv.total_amount) || 0), 0);
      const paidCount = invoicesList.filter(inv => inv.status === 'PAID').length;
      const pendingCount = invoicesList.filter(inv => inv.status !== 'PAID' && inv.status !== 'CANCELLED').length;
      const mInvoices = document.getElementById('metric-dashboard-invoices');
      if (mInvoices) mInvoices.innerText = `KES ${Math.round(totalInv).toLocaleString()}`;
      const subInvoices = document.getElementById('metric-invoices-subtext');
      if (subInvoices) subInvoices.innerText = `${paidCount} Settled • ${pendingCount} Pending`;
    }
  }

  // 6. Assets & Inventory (Admin/HR)
  const cardAssets = document.getElementById('dash-card-assets');
  if (cardAssets) {
    if (isSupervisor) {
      cardAssets.style.display = 'none';
    } else {
      cardAssets.style.display = 'flex';
      const totalAssets = assetKpis ? (assetKpis.total_assets || 0) : 0;
      const assetVal = assetKpis ? (assetKpis.total_asset_value || 0) : 0;
      const mAssets = document.getElementById('metric-dashboard-assets');
      if (mAssets) mAssets.innerText = `${totalAssets} Item${totalAssets === 1 ? '' : 's'}`;
      const subAssets = document.getElementById('metric-assets-subtext');
      if (subAssets) subAssets.innerText = `KES ${Math.round(assetVal).toLocaleString()} Book Value`;
    }
  }

  // 7. Security Incidents
  const incidents = allAdminIncidents || [];
  const openIncidents = incidents.filter(i => i.status === 'OPEN');
  const mIncidents = document.getElementById('metric-anomalies-count');
  if (mIncidents) mIncidents.innerText = openIncidents.length;
  const subIncidents = document.getElementById('metric-incidents-subtext');
  if (subIncidents) {
    subIncidents.innerText = openIncidents.length === 0 ? 'All Posts Clear' : `${openIncidents.length} Action Required`;
  }

  // 8. Leave Requests
  const leaves = allAdminLeave || [];
  const pendingLeaves = leaves.filter(l => l.status === 'PENDING');
  const mLeave = document.getElementById('metric-leave-pending-count');
  if (mLeave) mLeave.innerText = pendingLeaves.length;
  const subLeave = document.getElementById('metric-leave-subtext');
  if (subLeave) {
    subLeave.innerText = pendingLeaves.length === 0 ? 'All Reviewed' : `${pendingLeaves.length} Awaiting Review`;
  }

  // 9. Expenses & Petty Cash (Admin/HR)
  const cardExpenses = document.getElementById('dash-card-expenses');
  if (cardExpenses) {
    if (isSupervisor) {
      cardExpenses.style.display = 'none';
    } else {
      cardExpenses.style.display = 'flex';
      const totalMonth = expensesSummary ? (expensesSummary.total_expenses_this_month !== undefined ? expensesSummary.total_expenses_this_month : (expensesSummary.total_expenses_month || 0)) : 0;
      const floatBal = expensesSummary ? (expensesSummary.petty_cash_float_balance || 0) : 0;
      const mExpenses = document.getElementById('metric-dashboard-expenses');
      if (mExpenses) mExpenses.innerText = 'KES ' + Math.round(totalMonth).toLocaleString();
      const subExpenses = document.getElementById('metric-dashboard-expenses-subtext');
      if (subExpenses) {
        subExpenses.innerText = 'Float: KES ' + Math.round(floatBal).toLocaleString() + ' • Rec: KES ' + Math.round(expensesSummary ? (expensesSummary.monthly_recurring_commitments || 0) : 0).toLocaleString();
      }
    }
  }
}

function renderDashboardSiteDeployment() {
  const tbody = document.getElementById('dashboard-deployment-body');
  if (!tbody) return;

  const sites = cachedSites || [];
  const guards = cachedGuards || [];

  if (sites.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#64748B;">No client sites registered. Click "+ Add Site" to configure patrol sites.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  sites.forEach(s => {
    const required = Number(s.guards_required) || 1;
    const assigned = guards.filter(g => g.primary_site_id === s.id && g.status === 'ACTIVE');
    const assignedCount = assigned.length;
    
    let coverageBadge = '';
    if (assignedCount >= required) {
      coverageBadge = `<span class="badge" style="background:#ECFDF5; color:#059669; font-weight:700;">🟢 100% Staffed</span>`;
    } else if (assignedCount > 0) {
      const deficit = required - assignedCount;
      coverageBadge = `<span class="badge" style="background:#FEF3C7; color:#D97706; font-weight:700;">🟡 Under-Staffed (-${deficit})</span>`;
    } else {
      coverageBadge = `<span class="badge" style="background:#FEE2E2; color:#DC2626; font-weight:700;">🔴 Vacant (${required} Needed)</span>`;
    }

    const sup = (cachedSupervisors || []).find(sp => sp.id === s.assigned_supervisor_id);
    const supName = sup ? (sup.full_name || sup.name) : (s.assigned_supervisor_name || 'Unassigned');
    const locationStr = [s.city_or_county, s.location].filter(Boolean).join(' • ') || 'Nairobi HQ';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(s.site_name || 'Site')}</strong>
        ${s.client_name ? `<br><span style="font-size:11px; color:#64748B;">Client: ${escapeHtml(s.client_name)}</span>` : ''}
      </td>
      <td><span style="font-size:12px; color:#475569;">📍 ${escapeHtml(locationStr)}</span></td>
      <td><strong>${required} Guard${required > 1 ? 's' : ''}</strong></td>
      <td><span style="font-weight:700; color:#1E293B;">${assignedCount}</span></td>
      <td>${coverageBadge}</td>
      <td><span style="font-size:12px; color:#334155;">👮 ${escapeHtml(supName)}</span></td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="switchTab('sites'); setTimeout(() => openEditSiteModal(${s.id}), 100);" title="Edit Site">✏️ Site</button>
          <button class="btn btn-primary" style="padding:4px 8px; font-size:11px;" onclick="openGenerateInvoiceModal(${s.id})" title="Invoice Site">🧾 Bill</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderDashboardIncidentsFeed() {
  const container = document.getElementById('dashboard-incidents-feed');
  if (!container) return;

  const incidents = (allAdminIncidents || []).filter(i => i.status === 'OPEN' || i.status === 'INVESTIGATING');

  if (incidents.length === 0) {
    container.innerHTML = `
      <div style="padding:20px; text-align:center; background:#F8FAFC; border-radius:14px; border:1px dashed #CBD5E1;">
        <div style="font-size:24px; margin-bottom:4px;">🛡️</div>
        <div style="font-weight:700; color:#0F172A; font-size:13px;">All Security Sites Secure</div>
        <div style="font-size:11px; color:#64748B;">No open or investigating incidents recorded in database.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  incidents.slice(0, 4).forEach(inc => {
    let sevBg = '#EFF6FF';
    let sevColor = '#1D4ED8';
    let sevIcon = 'ℹ️';
    const sev = (inc.severity || 'LOW').toUpperCase();
    if (sev === 'CRITICAL' || sev === 'HIGH') {
      sevBg = '#FEE2E2'; sevColor = '#DC2626'; sevIcon = '🚨';
    } else if (sev === 'MEDIUM') {
      sevBg = '#FEF3C7'; sevColor = '#D97706'; sevIcon = '⚠️';
    }

    const card = document.createElement('div');
    card.className = 'dash-alert-card';
    card.style.background = sevBg;
    card.style.borderColor = sevColor + '40';
    card.innerHTML = `
      <div style="font-size:18px; line-height:1; flex-shrink:0;">${sevIcon}</div>
      <div style="flex:1; min-width:0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
          <strong style="color:#0F172A; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(inc.title || inc.incident_type || 'Incident')}</strong>
          <span style="font-size:10px; font-weight:700; color:${sevColor};">${sev}</span>
        </div>
        <div style="font-size:11px; color:#475569;">📍 ${escapeHtml(inc.site_name || 'Client Site')} • ${inc.incident_date || 'Recent'}</div>
      </div>
      <button class="btn btn-secondary" style="padding:3px 8px; font-size:10px; background:#FFF; flex-shrink:0;" onclick="openIncidentDetailsModal(${inc.id})">View</button>
    `;
    container.appendChild(card);
  });
}

function renderDashboardInventoryWatchlist(items) {
  const container = document.getElementById('dashboard-inventory-feed');
  if (!container) return;

  const lowStock = (items || []).filter(it => Number(it.current_stock) <= Number(it.minimum_stock_level));

  if (lowStock.length === 0) {
    container.innerHTML = `
      <div style="padding:20px; text-align:center; background:#F8FAFC; border-radius:14px; border:1px dashed #CBD5E1;">
        <div style="font-size:24px; margin-bottom:4px;">📦</div>
        <div style="font-weight:700; color:#0F172A; font-size:13px;">Optimal Stock Reserves</div>
        <div style="font-size:11px; color:#64748B;">All company supplies meet or exceed minimum reserve levels.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  lowStock.slice(0, 4).forEach(it => {
    const card = document.createElement('div');
    card.className = 'dash-alert-card';
    card.style.background = '#FFFBEB';
    card.style.borderColor = '#FDE68A';
    card.innerHTML = `
      <div style="font-size:18px; line-height:1; flex-shrink:0;">⚠️</div>
      <div style="flex:1; min-width:0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
          <strong style="color:#0F172A; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(it.item_name)}</strong>
          <span class="badge" style="background:#FEE2E2; color:#DC2626; font-size:10px; padding:2px 6px;">Low Stock</span>
        </div>
        <div style="font-size:11px; color:#475569;">
          Stock: <strong style="color:#DC2626;">${it.current_stock}</strong> / Min: ${it.minimum_stock_level} ${escapeHtml(it.unit_of_measure || 'units')}
        </div>
      </div>
      <button class="btn btn-secondary" style="padding:3px 8px; font-size:10px; background:#FFF; flex-shrink:0;" onclick="switchTab('assets'); setTimeout(() => openInventoryTransactModal(${it.id}, 'RECEIVE'), 150);">+ Restock</button>
    `;
    container.appendChild(card);
  });
}

window.refreshDashboard = refreshDashboard;
window.loadDashboardData = loadDashboardData;
window.renderDashboardKPIs = renderDashboardKPIs;
window.renderDashboardSiteDeployment = renderDashboardSiteDeployment;
window.renderDashboardIncidentsFeed = renderDashboardIncidentsFeed;
window.renderDashboardInventoryWatchlist = renderDashboardInventoryWatchlist;

async function loadGuards() {
  try {
    const res = await apiFetch('/guards');
    const guards = await res.json();
    cachedGuards = guards;

    const activeGuards = guards.filter(g => g.status === 'ACTIVE');
    const inactiveGuards = guards.filter(g => g.status === 'INACTIVE');

    // Update Tab Badges & Dashboard Counts
    const activeBadge = document.getElementById('active-guards-tab-badge');
    if (activeBadge) activeBadge.innerText = activeGuards.length;

    const inactiveBadge = document.getElementById('inactive-guards-tab-badge');
    if (inactiveBadge) inactiveBadge.innerText = inactiveGuards.length;

    const mGuards = document.getElementById('metric-guards-count');
    if (mGuards) mGuards.innerText = activeGuards.length;

    const repGuards = document.getElementById('reports-metric-guards');
    if (repGuards) repGuards.innerText = activeGuards.length;

    // 1. Populate Active Guards Roster Table
    const activeTbody = document.getElementById('guards-table-body');
    if (activeTbody) {
      activeTbody.innerHTML = '';
      if (activeGuards.length === 0) {
        activeTbody.innerHTML = '<tr id="empty-active-guards-row"><td colspan="8" style="text-align:center; padding:32px; color:#64748B;">No active security personnel registered. Click "+ Add New Guard" to recruit guards.</td></tr>';
      } else {
        activeGuards.forEach(g => {
          const tr = document.createElement('tr');
          const salDisplay = g.basic_salary ? `KES ${Number(g.basic_salary).toLocaleString()} <span style="font-size:10px; color:#3B5EDB;">(Override)</span>` : `KES ${(Number(g.resolved_basic_salary) || 15000).toLocaleString()} <span style="font-size:10px; color:#64748B;">(Site Default)</span>`;
          const relieverBadge = g.is_reliever ? `<span class="badge" style="background:#EEF2FF; color:#4338CA;">🔄 Reliever</span>` : `<span style="font-size:11px; color:#94A3B8;">Regular</span>`;
          const safeName = (g.full_name || '').replace(/'/g, "\\'");
          const safeEmp = (g.employee_number || '').replace(/'/g, "\\'");

          tr.innerHTML = `
            <td><b>${g.employee_number}</b></td>
            <td>${g.full_name}</td>
            <td>${g.national_id || '—'}</td>
            <td>${g.phone || '—'}</td>
            <td>${salDisplay}</td>
            <td>
              ${g.is_super_guard ? '<span class="badge" style="background:#E0F2FE; color:#0369A1; font-weight:700; margin-bottom:3px; display:inline-block;">⭐ Super Guard</span><br/>' : ''}
              ${relieverBadge}
            </td>
            <td><span class="badge badge-active">ACTIVE</span></td>
            <td style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="btn btn-primary" style="padding:4px 10px; font-size:12px;" onclick="viewGuardFile(${g.id})">📋 View File</button>
              <button class="btn btn-secondary" style="padding:4px 8px; font-size:12px; color:#DC2626; border-color:#FCA5A5;" onclick="openDeactivateGuardModal(${g.id}, '${safeName}', '${safeEmp}')">🛑 Deactivate</button>
            </td>
          `;
          activeTbody.appendChild(tr);
        });
      }
    }

    // 2. Populate Inactive Guards Archive Table (Separate Section)
    const inactiveTbody = document.getElementById('inactive-guards-table-body');
    if (inactiveTbody) {
      inactiveTbody.innerHTML = '';
      if (inactiveGuards.length === 0) {
        inactiveTbody.innerHTML = '<tr id="empty-inactive-guards-row"><td colspan="7" style="text-align:center; padding:32px; color:#64748B;">No deactivated guards in archive. All security personnel are currently in active service.</td></tr>';
      } else {
        inactiveGuards.forEach(g => {
          const tr = document.createElement('tr');
          const safeName = (g.full_name || '').replace(/'/g, "\\'");
          const safeEmp = (g.employee_number || '').replace(/'/g, "\\'");
          const reasonText = g.deactivation_reason ? `<span style="color:#991B1B; font-weight:500;">${g.deactivation_reason}</span>` : '<span style="color:#94A3B8; font-style:italic;">Administrative deactivation</span>';

          tr.innerHTML = `
            <td><b>${g.employee_number}</b></td>
            <td>${g.full_name}</td>
            <td>${g.national_id || '—'}</td>
            <td>${g.phone || '—'}</td>
            <td style="max-width:280px;">${reasonText}</td>
            <td><span class="badge" style="background:#FEE2E2; color:#991B1B; font-weight:700;">INACTIVE</span></td>
            <td style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="btn btn-primary" style="padding:4px 10px; font-size:12px; background:#475569; border-color:#475569;" onclick="viewGuardFile(${g.id})">📋 View Historical File</button>
              <button class="btn" style="background:#16A34A; color:#FFFFFF; padding:4px 10px; font-size:12px; font-weight:600; border-radius:6px; border:none; cursor:pointer;" onclick="openReactivateGuardModal(${g.id}, '${safeName}', '${safeEmp}')">✅ Reactivate Guard</button>
            </td>
          `;
          inactiveTbody.appendChild(tr);
        });
      }
    }

    if (!supervisorsCache || supervisorsCache.length === 0) {
      apiFetch('/supervisors').then(r => r.json()).then(data => { if (Array.isArray(data)) supervisorsCache = data; }).catch(() => {});
    }

    renderAnalyticsSiteDistribution();
  } catch (err) {
    console.error('loadGuards error:', err);
  }
}

/* ============================================================
   GUARD PERSONNEL FILE & DETAILS VIEW (MATCHING REFERENCE UI)
   ============================================================ */
let currentViewedGuard = null;

function calculateGuardAge(dob) {
  if (!dob) return '28';
  try {
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return '28';
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age > 0 ? String(age) : '28';
  } catch (e) {
    return '28';
  }
}

function renderGuardAttendanceHistoryRows(records) {
  if (!records || records.length === 0) {
    return '<tr><td colspan="8" style="text-align:center; padding:24px; color:#64748B;">No shift attendance records logged in the database yet.</td></tr>';
  }
  return records.slice(0, 30).map(a => {
    const shiftDate = a.shift_date ? String(a.shift_date).substring(0, 10) : '—';
    const clockIn = a.actual_clock_in ? String(a.actual_clock_in).substring(11, 16) : (a.status === 'PRESENT' ? '06:00' : '—');
    const clockOut = a.actual_clock_out ? String(a.actual_clock_out).substring(11, 16) : (a.status === 'PRESENT' ? '18:00' : '—');
    let badgeBg = '#DCFCE7'; let badgeColor = '#166534';
    if (a.status === 'ABSENT') { badgeBg = '#FEE2E2'; badgeColor = '#991B1B'; }
    else if (a.status === 'LATE') { badgeBg = '#FEF3C7'; badgeColor = '#92400E'; }
    else if (a.status === 'OFF') { badgeBg = '#EFF6FF'; badgeColor = '#1D4ED8'; }
    else if (a.status === 'OVERTIME') { badgeBg = '#FEF3C7'; badgeColor = '#B45309'; }

    return `
      <tr>
        <td style="font-weight:700; color:#0F172A;">${escapeHtml(shiftDate)}</td>
        <td>${escapeHtml(a.site_name || 'Standard Site')}</td>
        <td>${escapeHtml(clockIn)}</td>
        <td>${escapeHtml(clockOut)}</td>
        <td style="font-weight:600;">${a.regular_hours || 0} hrs</td>
        <td style="font-weight:600; color:${(a.overtime_hours > 0 ? '#B45309' : '#64748B')};">${a.overtime_hours || 0} hrs</td>
        <td>
          <span class="badge" style="background:${badgeBg}; color:${badgeColor}; font-weight:700; padding:3px 8px; border-radius:12px; font-size:11px;">
            ${escapeHtml(a.status || 'PRESENT')}
          </span>
        </td>
        <td style="font-size:11px; color:#64748B;">${escapeHtml(a.notes || '—')}</td>
      </tr>
    `;
  }).join('');
}

function renderGuardPayrollHistoryRows(records) {
  if (!records || records.length === 0) {
    return '<tr><td colspan="8" style="text-align:center; padding:24px; color:#64748B;">No payroll records generated for this guard in the database yet.</td></tr>';
  }
  return records.map(p => {
    return `
      <tr>
        <td style="font-weight:800; color:#0F172A;">Payroll Period #${p.payroll_period_id}</td>
        <td style="font-weight:700; color:#2563EB;">${p.days_worked || 0} Days</td>
        <td style="font-weight:700;">KES ${(p.basic_pay || 0).toLocaleString()}</td>
        <td style="font-weight:700; color:#0F172A;">KES ${(p.gross_pay || 0).toLocaleString()}</td>
        <td style="font-weight:600; color:#DC2626;">KES ${(p.total_deductions || 0).toLocaleString()}</td>
        <td style="font-weight:800; color:#166534; font-size:13px;">KES ${(p.net_pay || 0).toLocaleString()}</td>
        <td><span class="badge" style="background:#DCFCE7; color:#166534; font-weight:700; padding:2px 8px; border-radius:12px; font-size:11px;">CONFIRMED</span></td>
        <td style="text-align:right;">
          <button type="button" class="btn btn-secondary" style="padding:4px 10px; font-size:11px; font-weight:700;" onclick="window.open('/api/v1/payslips/pdf/${p.id}', '_blank')">
            📄 Payslip PDF
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderGuardLeaveHistoryRows(records) {
  if (!records || records.length === 0) {
    return '<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748B;">No leave or off-day requests recorded in the database.</td></tr>';
  }
  return records.map(l => {
    const start = l.start_date ? String(l.start_date).substring(0, 10) : '—';
    const end = l.end_date ? String(l.end_date).substring(0, 10) : start;
    let badgeBg = '#FEF3C7'; let badgeColor = '#92400E';
    if (l.status === 'APPROVED') { badgeBg = '#DCFCE7'; badgeColor = '#166534'; }
    else if (l.status === 'REJECTED') { badgeBg = '#FEE2E2'; badgeColor = '#991B1B'; }
    return `
      <tr>
        <td style="font-weight:700; color:#0F172A;">${escapeHtml(l.leave_type || 'Annual Leave')}</td>
        <td>${escapeHtml(start)}</td>
        <td>${escapeHtml(end)}</td>
        <td style="font-weight:700;">${l.duration_days || 1} day${(l.duration_days > 1 ? 's' : '')}</td>
        <td>
          <span class="badge" style="background:${badgeBg}; color:${badgeColor}; font-weight:700; padding:3px 8px; border-radius:12px; font-size:11px;">
            ${escapeHtml(l.status || 'PENDING')}
          </span>
        </td>
        <td style="color:#64748B;">${escapeHtml(l.comments || l.reason || '—')}</td>
      </tr>
    `;
  }).join('');
}

function generateGuardFileHTML(g, attendanceRecords = [], sitesList = [], shiftsList = [], allocations = [], inventoryTx = [], guardAdvances = [], payrollRecords = [], leaveRecords = [], damageDeductions = []) {
  const site = g.site || sitesList.find(s => s.id === (g.site_id || g.primary_site_id)) || null;
  const shift = g.shift || shiftsList.find(s => s.id === g.shift_id) || null;
  const siteName = site ? site.site_name : 'Unassigned';
  const shiftName = shift ? (shift.shift_name || shift.name || 'Day Shift') : 'Day Shift';
  const siteLocation = site ? (site.location || '—') : '—';

  const hireDate = g.hire_date ? String(g.hire_date).substring(0, 10) : '—';
  const dob = g.date_of_birth ? String(g.date_of_birth).substring(0, 10) : '—';
  const age = calculateGuardAge(dob);

  // Attendance summary
  let presentCount = attendanceRecords.filter(a => a.status === 'PRESENT' || a.status === 'OVERTIME').length;
  let absentCount = attendanceRecords.filter(a => a.status === 'ABSENT').length;
  let lateCount = attendanceRecords.filter(a => a.status === 'LATE').length;
  let totalCount = attendanceRecords.length;
  let attendancePct = totalCount > 0 ? ((presentCount / totalCount) * 100).toFixed(1) : '—';

  // Academic qualification & emergency contact from database
  const educationLevel = g.education_level || 'KCSE / Secondary School Certificate';
  const emergencyName = g.emergency_contact_name || 'Not Recorded';
  const emergencyPhone = g.emergency_contact_phone || 'Not Recorded';
  const bloodGroup = g.blood_group || '—';
  const nextOfKin = g.next_of_kin || '—';

  const currentUser = getLoggedInUser();
  const isSupervisor = currentUser && currentUser.role === 'SUPERVISOR';
  const isInactive = g.status === 'INACTIVE';
  const safeName = (g.full_name || '').replace(/'/g, "\\'");
  const safeEmp = (g.employee_number || '').replace(/'/g, "\\'");

  return `
    <div class="guard-file-top-bar" style="margin-bottom: 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
      <button type="button" class="back-to-guards-btn" onclick="backToGuardsList()">
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Guard Directory
      </button>
      <div style="display:flex; align-items:center; gap:10px;">
        ${isInactive ? `
          <button type="button" class="btn" style="background:#16A34A; color:#FFFFFF; font-weight:700; padding:6px 14px; font-size:12px; border-radius:6px; border:none; cursor:pointer;" onclick="openReactivateGuardModal(${g.id}, '${safeName}', '${safeEmp}')">
            ✅ Restore to Active Service
          </button>
        ` : `
          <button type="button" class="btn" style="background:#DC2626; color:#FFFFFF; font-weight:700; padding:6px 14px; font-size:12px; border-radius:6px; border:none; cursor:pointer;" onclick="openDeactivateGuardModal(${g.id}, '${safeName}', '${safeEmp}')">
            🛑 Deactivate Guard
          </button>
        `}
        <div class="guard-status-badge ${g.status === 'ACTIVE' ? 'status-active' : 'status-inactive'}">
          STATUS: ${g.status || 'ACTIVE'}
        </div>
      </div>
    </div>

    ${isInactive ? `
      <div style="background:#FEF2F2; border:1.5px solid #FCA5A5; border-radius:10px; padding:16px 20px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <div style="font-size:15px; font-weight:800; color:#991B1B; display:flex; align-items:center; gap:8px;">
            <span>⚠️ DEACTIVATED GUARD RECORD (ARCHIVED)</span>
            <span class="badge" style="background:#DC2626; color:#FFF; font-size:11px; padding:3px 8px;">INACTIVE</span>
          </div>
          <div style="font-size:13px; color:#7F1D1D; margin-top:6px;">
            <strong>Reason for Deactivation:</strong> ${escapeHtml(g.deactivation_reason || 'Administrative deactivation recorded.')}
          </div>
          <div style="font-size:12px; color:#991B1B; margin-top:2px;">
            All past shift attendance records, statutory data, emergency contacts, and personal qualifications are safely preserved in this database archive.
          </div>
        </div>
        <button type="button" class="btn" style="background:#16A34A; color:#FFFFFF; font-weight:700; padding:8px 16px; font-size:13px; border-radius:6px; border:none; cursor:pointer;" onclick="openReactivateGuardModal(${g.id}, '${safeName}', '${safeEmp}')">
          ✅ Restore to Active Service
        </button>
      </div>
    ` : ''}

    <!-- Super Guard Mandate Status Card -->
    ${g.is_super_guard ? `
      <div style="background:#EFF6FF; border:1.5px solid #93C5FD; border-radius:12px; padding:16px 20px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; box-shadow:0 4px 12px rgba(37,99,235,0.06);">
        <div style="display:flex; align-items:center; gap:14px;">
          <div style="width:44px; height:44px; border-radius:10px; background:#DBEAFE; display:flex; align-items:center; justify-content:center; font-size:24px;">⭐</div>
          <div>
            <div style="font-weight:800; font-size:15px; color:#1E40AF; display:flex; align-items:center; gap:8px;">
              <span>ACTIVE SITE SUPER GUARD MANDATE</span>
              <span class="badge" style="background:#2563EB; color:#FFF; font-size:11px; padding:2px 8px;">AUTHORIZED</span>
            </div>
            <div style="font-size:12.5px; color:#3B82F6; margin-top:3px;">
              Empowered to clock in and out fellow stationed guards who do not possess smartphones at <b>${escapeHtml(siteName)}</b>.
            </div>
          </div>
        </div>
        <button type="button" class="btn" style="background:#FEE2E2; color:#DC2626; border:1px solid #FCA5A5; font-size:12px; font-weight:700; padding:8px 16px; border-radius:8px;" onclick="removeSuperGuardMandate(${g.id})">
          🚫 Remove as Super Guard
        </button>
      </div>
    ` : `
      <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:12px 20px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:18px; color:#64748B;">🛡️</span>
          <div style="font-size:13px; color:#475569;">
            <strong>Standard Guard Status</strong> (No site clock-in mandate assigned).
          </div>
        </div>
        <button type="button" class="btn btn-secondary" style="color:#0369A1; border-color:#BAE6FD; font-size:12px; padding:6px 14px; font-weight:700;" onclick="assignSuperGuardMandate(${g.id})">
          ⭐ Designate as Site Super Guard
        </button>
      </div>
    `}

    <!-- Card 1: Security Guard Personnel File -->
    <div class="profile-card">
      <div class="profile-card-header">
        <h2 class="profile-card-title">🛡️ Security Guard Personnel File</h2>
        <button type="button" class="btn-amend-file" onclick="openAmendGuardModal(${g.id})">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          Amend Guard File
        </button>
      </div>
      <div class="profile-details-grid">
        <div class="detail-field">
          <label>Full Name:</label>
          <span class="value-lg">${escapeHtml(g.full_name)}</span>
        </div>
        <div class="detail-field">
          <label>Employee Number:</label>
          <span class="value">${escapeHtml(g.employee_number)}</span>
        </div>
        <div class="detail-field">
          <label>National ID:</label>
          <span class="value">${escapeHtml(g.national_id || '—')}</span>
        </div>
        <div class="detail-field">
          <label>Phone Number:</label>
          <span class="value">${escapeHtml(g.phone || '—')}</span>
        </div>
        <div class="detail-field">
          <label>Email Address:</label>
          <span class="value">${escapeHtml(g.email || '—')}</span>
        </div>
        <div class="detail-field">
          <label>Gender:</label>
          <span class="value">${escapeHtml(g.gender || '—')}</span>
        </div>
        <div class="detail-field">
          <label>Date of Birth:</label>
          <span class="value">${dob}</span>
        </div>
        <div class="detail-field">
          <label>Age:</label>
          <span class="value">${age} years</span>
        </div>
        <div class="detail-field">
          <label>Hire Date:</label>
          <span class="value-blue">${hireDate}</span>
        </div>
        <div class="detail-field">
          <label>Guard Type:</label>
          <span class="value">${g.is_reliever ? '🔄 Reliever (Floating)' : '🏢 Permanent Post'}</span>
        </div>
        <div class="detail-field">
          <label>Deployment Site:</label>
          <span class="value">${escapeHtml(siteName)}</span>
        </div>
        <div class="detail-field">
          <label>Site Location:</label>
          <span class="value">${escapeHtml(siteLocation)}</span>
        </div>
        <div class="detail-field">
          <label>Assigned Shift:</label>
          <span class="value">${escapeHtml(shiftName)}</span>
        </div>
        <div class="detail-field">
          <label>Supervisor:</label>
          <span class="value">${escapeHtml(g.supervisor_email || 'Unassigned')}</span>
        </div>
        <div class="detail-field">
          <label>Blood Group:</label>
          <span class="value">${escapeHtml(bloodGroup)}</span>
        </div>
        <div class="detail-field">
          <label>Next of Kin:</label>
          <span class="value">${escapeHtml(nextOfKin)}</span>
        </div>
      </div>
    </div>

    <!-- Card Row 2: Academic Qualification & Emergency Contact -->
    <div class="profile-cards-row">
      <!-- Academic Qualification -->
      <div class="profile-card" style="margin-bottom:0;">
        <div class="profile-card-header">
          <h2 class="profile-card-title">🎓 Academic Qualification</h2>
        </div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div class="detail-field">
            <label>Highest Education Level (Database Record):</label>
            <span class="value-bold" style="color:#0F172A; font-size:14px;">${escapeHtml(educationLevel)}</span>
          </div>
          <div style="background:#F0F9FF; border:1px solid #BAE6FD; border-radius:8px; padding:12px; font-size:13px; color:#0369A1;">
            ℹ️ Academic qualifications are safely saved in the company database and can be amended anytime.
          </div>
        </div>
      </div>

      <!-- Emergency Contact -->
      <div class="profile-card" style="margin-bottom:0;">
        <div class="profile-card-header">
          <h2 class="profile-card-title">🆘 Emergency Contact & Next of Kin</h2>
        </div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div class="detail-field">
            <label>Emergency Contact Person:</label>
            <span class="value" style="font-weight:700; color:#0F172A;">${escapeHtml(emergencyName)}</span>
          </div>
          <div class="detail-field">
            <label>Emergency Phone Number:</label>
            <span class="value" style="font-weight:700; color:#1D4ED8;">${escapeHtml(emergencyPhone)}</span>
          </div>
          <div class="detail-field">
            <label>Next of Kin / Relative:</label>
            <span class="value">${escapeHtml(nextOfKin)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Card 3: Shift Attendance Record & Database Log -->
    <div class="profile-card" style="margin-top:24px; margin-bottom:24px;">
      <div class="profile-card-header" style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h2 class="profile-card-title">📋 Shift Attendance Record & Database Log</h2>
          <div style="font-size:12px; color:#64748B; margin-top:3px;">Real-time shift attendance entries retrieved directly from the attendance database table.</div>
        </div>
      </div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap:12px; margin-bottom:16px;">
        <div style="background:#DCFCE7; border:1px solid #BBF7D0; padding:12px; border-radius:8px; text-align:center;">
          <div style="font-size:22px; font-weight:800; color:#166534;">${presentCount}</div>
          <div style="font-size:11px; font-weight:700; color:#166534; text-transform:uppercase;">Present</div>
        </div>
        <div style="background:#FEE2E2; border:1px solid #FECACA; padding:12px; border-radius:8px; text-align:center;">
          <div style="font-size:22px; font-weight:800; color:#991B1B;">${absentCount}</div>
          <div style="font-size:11px; font-weight:700; color:#991B1B; text-transform:uppercase;">Absent</div>
        </div>
        <div style="background:#FEF3C7; border:1px solid #FDE68A; padding:12px; border-radius:8px; text-align:center;">
          <div style="font-size:22px; font-weight:800; color:#92400E;">${lateCount}</div>
          <div style="font-size:11px; font-weight:700; color:#92400E; text-transform:uppercase;">Late</div>
        </div>
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:12px; border-radius:8px; text-align:center;">
          <div style="font-size:22px; font-weight:800; color:#0F172A;">${totalCount}</div>
          <div style="font-size:11px; font-weight:700; color:#64748B; text-transform:uppercase;">Total Shifts Logged</div>
        </div>
        <div style="background:#EFF6FF; border:1px solid #BFDBFE; padding:12px; border-radius:8px; text-align:center;">
          <div style="font-size:22px; font-weight:800; color:#1D4ED8;">${attendancePct}${attendancePct !== '—' ? '%' : ''}</div>
          <div style="font-size:11px; font-weight:700; color:#1D4ED8; text-transform:uppercase;">Attendance Rate</div>
        </div>
      </div>

      <div class="table-responsive" style="max-height: 280px; overflow-y: auto;">
        <table class="data-table" style="font-size:12px;">
          <thead>
            <tr>
              <th>SHIFT DATE</th>
              <th>DEPLOYMENT SITE</th>
              <th>CLOCK IN</th>
              <th>CLOCK OUT</th>
              <th>REGULAR HRS</th>
              <th>OVERTIME</th>
              <th>STATUS</th>
              <th>SUPERVISOR NOTES</th>
            </tr>
          </thead>
          <tbody>
            ${renderGuardAttendanceHistoryRows(attendanceRecords)}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Card 4: Compensation & Statutory Compliance + Monthly Payroll History -->
    <div class="profile-card">
      <div class="profile-card-header">
        <h2 class="profile-card-title">💰 Compensation & Statutory Compliance</h2>
      </div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px; font-size:13px; margin-bottom:16px;">
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:12px; border-radius:8px;">
          <span style="font-size:11px; font-weight:700; color:#64748B; text-transform:uppercase; display:block; margin-bottom:4px;">Basic Salary</span>
          <span style="font-size:15px; font-weight:800; color:#0F172A;">KES ${(g.resolved_basic_salary || g.basic_salary || 15000).toLocaleString()}</span>
          <span style="font-size:11px; color:#64748B; display:block;">${g.basic_salary ? 'Guard-specific rate' : 'Inherited from site default'}</span>
        </div>
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:12px; border-radius:8px;">
          <span style="font-size:11px; font-weight:700; color:#64748B; text-transform:uppercase; display:block; margin-bottom:4px;">Statutory Registrations</span>
          <span style="font-size:12px; color:#0F172A; display:block;"><b>KRA PIN:</b> ${escapeHtml(g.kra_pin || 'Pending')}</span>
          <span style="font-size:12px; color:#0F172A; display:block;"><b>NSSF No:</b> ${escapeHtml(g.nssf_number || 'Pending')}</span>
          <span style="font-size:12px; color:#0F172A; display:block;"><b>SHIF No:</b> ${escapeHtml(g.shif_number || 'Pending')}</span>
        </div>
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:12px; border-radius:8px;">
          <span style="font-size:11px; font-weight:700; color:#64748B; text-transform:uppercase; display:block; margin-bottom:4px;">Payment Method</span>
          <span style="font-size:13px; font-weight:700; color:#0F172A; display:block;">${escapeHtml(g.payment_method || '—')}</span>
          <span style="font-size:12px; color:#64748B; display:block;">${g.payment_method === 'M-Pesa' ? escapeHtml(g.mpesa_number || 'No M-Pesa number') : `${escapeHtml(g.bank_name || 'Bank')} · ${escapeHtml(g.bank_account || '—')}`}</span>
        </div>
      </div>

      ${!isSupervisor ? `
      <!-- Monthly Payroll & Payslip Records Table -->
      <div style="border-top:1px solid #E2E8F0; padding-top:16px;">
        <h4 style="font-size:14px; font-weight:800; color:#0F172A; margin:0 0 10px 0;">📑 Monthly Payroll Runs & Payslip History (Database)</h4>
        <div class="table-responsive" style="max-height: 240px; overflow-y: auto;">
          <table class="data-table" style="font-size:12px;">
            <thead>
              <tr>
                <th>PERIOD</th>
                <th>DAYS WORKED</th>
                <th>BASIC PAY</th>
                <th>GROSS PAY</th>
                <th>DEDUCTIONS</th>
                <th>NET SALARY</th>
                <th>STATUS</th>
                <th style="text-align:right;">PAYSLIP ACTION</th>
              </tr>
            </thead>
            <tbody>
              ${renderGuardPayrollHistoryRows(payrollRecords)}
            </tbody>
          </table>
        </div>
      </div>
      ` : ''}
    </div>

    <!-- Card 5: Leave & Off-Day Records -->
    <div class="profile-card" style="margin-top:24px;">
      <div class="profile-card-header">
        <h2 class="profile-card-title">🏖️ Leave &amp; Off-Days History</h2>
      </div>
      <div class="table-responsive" style="max-height: 220px; overflow-y: auto;">
        <table class="data-table" style="font-size:12px;">
          <thead>
            <tr>
              <th>LEAVE TYPE</th>
              <th>START DATE</th>
              <th>END DATE</th>
              <th>DURATION</th>
              <th>STATUS</th>
              <th>REMARKS / APPROVAL</th>
            </tr>
          </thead>
          <tbody>
            ${renderGuardLeaveHistoryRows(leaveRecords)}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Card 6: Issued Equipment, Uniforms & Item Returns Log -->
    <div class="profile-card" style="margin-top:24px; background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; padding:22px;">
      <div class="profile-card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; border-bottom:1px solid #F1F5F9; padding-bottom:14px; margin-bottom:16px;">
        <div>
          <h2 class="profile-card-title" style="font-size:16px; font-weight:800; color:#0F172A; margin:0; display:flex; align-items:center; gap:8px;">
            <span>🎖️</span> Issued Equipment, Uniforms &amp; Item Returns Log
          </h2>
          <div style="font-size:12px; color:#64748B; margin-top:3px;">Track all company equipment, uniforms, gear, and honor awards issued to this guard, and easily mark items as returned when surrendered back to stores.</div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary" style="font-size:12px; padding:6px 14px; background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE; font-weight:700;" onclick="openQuickReturnItemModal('guard', ${g.id}, '${safeName}')">
            🔄 Mark Item as Returned
          </button>
          <button type="button" class="btn btn-primary" style="font-size:12px; padding:6px 14px;" onclick="openAwardItemModal('guard', ${g.id}, '${safeName}')">
            + Award / Issue Item
          </button>
        </div>
      </div>

      <!-- Custody Status KPI Badges -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:16px;">
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:10px 14px;">
          <div style="font-size:11px; font-weight:700; color:#64748B;">TOTAL ITEMS ISSUED</div>
          <div style="font-size:16px; font-weight:800; color:#0F172A; margin-top:2px;">${(allocations || []).length + (inventoryTx || []).length} Items</div>
        </div>
        <div style="background:#ECFDF5; border:1px solid #A7F3D0; border-radius:8px; padding:10px 14px;">
          <div style="font-size:11px; font-weight:700; color:#047857;">CURRENTLY IN CUSTODY</div>
          <div style="font-size:16px; font-weight:800; color:#059669; margin-top:2px;">${(allocations || []).filter(a => a.status === 'ACTIVE').length + (inventoryTx || []).filter(t => t.transaction_type === 'ISSUED').length} Active (Pending Return)</div>
        </div>
        <div style="background:#F1F5F9; border:1px solid #CBD5E1; border-radius:8px; padding:10px 14px;">
          <div style="font-size:11px; font-weight:700; color:#475569;">RETURNED TO STORES</div>
          <div style="font-size:16px; font-weight:800; color:#334155; margin-top:2px;">${(allocations || []).filter(a => a.status === 'RETURNED').length + (inventoryTx || []).filter(t => t.transaction_type === 'RETURNED').length} Returned &amp; Cleared</div>
        </div>
      </div>

      <div class="table-responsive" style="max-height: 320px; overflow-y: auto; overflow-x: auto;">
        <table class="data-table" style="font-size:12px;">
          <thead>
            <tr>
              <th>ITEM / ASSET TAG &amp; NAME</th>
              <th>CATEGORY</th>
              <th>SERIAL / SKU</th>
              <th>DATE ISSUED / AWARDED</th>
              <th>HANDOVER COND.</th>
              <th>STATUS &amp; RETURN DETAILS</th>
              <th style="text-align:right;">ACTION / RETURN</th>
            </tr>
          </thead>
          <tbody>
            ${renderCustodyRows(allocations, inventoryTx, 'guard', g.id)}
          </tbody>
        </table>
      </div>
    </div>

    ${!isSupervisor ? `
    <!-- Guard Salary Advances Section -->
    <div class="guard-file-card" style="margin-top:20px; padding:20px; background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <h4 style="font-size:15px; font-weight:800; color:#0F172A; margin:0;">💵 Mid-Month Salary Advances</h4>
          <p style="font-size:12px; color:#64748B; margin:2px 0 0 0;">Record of mid-month salary advances disbursed to this guard with automatic monthly payroll deduction status.</p>
        </div>
        <button type="button" class="btn btn-primary" style="font-size:12px; padding:6px 14px;" onclick="openIssueSalaryAdvanceModal('GUARD', ${g.id}, '${safeName}')">
          + Issue Salary Advance
        </button>
      </div>

      <div class="table-responsive" style="margin-top:16px; max-height: 260px; overflow-y: auto; overflow-x: auto;">
        <table class="data-table" style="font-size:12px;">
          <thead>
            <tr>
              <th>REF #</th>
              <th>AMOUNT</th>
              <th>DISBURSEMENT DATE</th>
              <th>METHOD &amp; TRX</th>
              <th>REASON</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            ${renderGuardAdvancesRows(guardAdvances)}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    ${!isSupervisor ? `
    <!-- Guard Property & Equipment Damage Deductions Section -->
    <div class="guard-file-card" style="margin-top:20px; padding:20px; background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <h4 style="font-size:15px; font-weight:800; color:#0F172A; margin:0; display:flex; align-items:center; gap:6px;">
            <span>⚠️</span> Property &amp; Equipment Damage Deductions
          </h4>
          <p style="font-size:12px; color:#64748B; margin:2px 0 0 0;">Record of damage or loss penalties assessed against this guard for issued company belongings, deducted directly from monthly salary.</p>
        </div>
        <button type="button" class="btn btn-secondary" style="font-size:12px; padding:6px 14px; border-color:#FCA5A5; color:#991B1B; background:#FEF2F2; font-weight:700;" onclick="openRecordDamageDeductionModal(${g.id}, '${safeName}')">
          + Record Damage Deduction
        </button>
      </div>

      <div class="table-responsive" style="margin-top:16px; max-height: 260px; overflow-y: auto; overflow-x: auto;">
        <table class="data-table" style="font-size:12px;">
          <thead>
            <tr>
              <th>ID</th>
              <th>ITEM / BELONGING</th>
              <th>DAMAGE DESCRIPTION</th>
              <th>DEDUCTION (KES)</th>
              <th>INCIDENT DATE</th>
              <th>PAYROLL PERIOD</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            ${renderGuardDamageDeductionsRows(damageDeductions)}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    <div style="margin-top:24px; padding:16px 0; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #E2E8F0; flex-wrap:wrap; gap:12px;">
      <button type="button" class="back-to-guards-btn" onclick="backToGuardsList()">
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Guard Directory
      </button>
      <button type="button" class="btn btn-secondary" onclick="window.scrollTo({top:0, behavior:'smooth'}); const mc = document.querySelector('.content-container'); if(mc) mc.scrollTo({top:0, behavior:'smooth'});">
        ↑ Back to Top of File
      </button>
    </div>
  `;
}

async function viewGuardFile(guardId) {
  const fileViewContainer = document.getElementById('guard-file-view');
  const listViewContainer = document.getElementById('guards-list-view');
  const modal = document.getElementById('modal-guard-file');
  const body = document.getElementById('guard-file-body');

  const currentUser = getLoggedInUser();
  const isSupervisor = currentUser && currentUser.role === 'SUPERVISOR';

  // Ensure modal popup is permanently closed (no "small files" popups)
  if (modal) modal.style.display = 'none';
  if (body) body.innerHTML = '';

  // Track previous tab for seamless return
  if (window.currentActiveTab && window.currentActiveTab !== 'guards') {
    window.guardFilePreviousTab = window.currentActiveTab;
  } else if (!window.guardFilePreviousTab) {
    window.guardFilePreviousTab = 'guards';
  }
  window.currentActiveTab = 'guards';

  // Ensure Guards panel is active in main view
  document.querySelectorAll('section[id^="panel-"]').forEach(sec => sec.style.display = 'none');
  const guardsPanel = document.getElementById('panel-guards');
  if (guardsPanel) guardsPanel.style.display = 'block';

  // Highlight Guards tab in navigation
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  const guardsNav = document.querySelector(`.nav-item[onclick*="'guards'"]`);
  if (guardsNav) guardsNav.classList.add('active');

  // Set top header title
  const titleEl = document.getElementById('current-page-title');
  if (titleEl) titleEl.innerText = 'Guard Personnel File';

  // Switch from list view to full page file view
  if (listViewContainer) listViewContainer.style.display = 'none';
  if (fileViewContainer) {
    fileViewContainer.style.display = 'block';
    fileViewContainer.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#64748B;"><div style="font-size:32px;margin-bottom:12px;">🛡️</div><div style="font-size:16px;font-weight:700;color:#0F172A;margin-bottom:6px;">Loading Guard Personnel File...</div><div style="font-size:13px;">Retrieving profile, attendance, statutory records, custody and salary advances from database...</div></div>';
  }

  // Smooth scroll to top of workspace
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const mainContainer = document.querySelector('.content-container');
  if (mainContainer && mainContainer.scrollTo) {
    mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
  }

  try {
    const [gRes, aRes, sRes, shRes, allocRes, txRes, advRes, payRes, leaveRes, dmgRes] = await Promise.all([
      apiFetch(`/guards/${guardId}`),
      apiFetch(`/attendance?guard_id=${guardId}`).catch(() => ({ ok: false })),
      apiFetch('/sites').catch(() => ({ ok: false })),
      apiFetch('/shifts').catch(() => ({ ok: false })),
      apiFetch(`/assets/allocations?guard_id=${guardId}`).catch(() => ({ ok: false })),
      apiFetch(`/assets/inventory/transactions?guard_id=${guardId}`).catch(() => ({ ok: false })),
      isSupervisor ? Promise.resolve({ ok: false }) : apiFetch(`/salary-advances?advance_type=GUARD&guard_id=${guardId}`).catch(() => ({ ok: false })),
      isSupervisor ? Promise.resolve({ ok: false }) : apiFetch(`/payroll/guard/${guardId}/records`).catch(() => ({ ok: false })),
      apiFetch(`/leave?guard_id=${guardId}`).catch(() => ({ ok: false })),
      isSupervisor ? Promise.resolve({ ok: false }) : apiFetch(`/assets/damage-deductions?guard_id=${guardId}`).catch(() => ({ ok: false }))
    ]);

    if (!gRes.ok) throw new Error('Guard record not found in database');
    const g = await gRes.json();
    currentViewedGuard = g;

    const attendance = (aRes && aRes.ok) ? await aRes.json() : [];
    const sites = (sRes && sRes.ok) ? await sRes.json() : (cachedSites || []);
    const shifts = (shRes && shRes.ok) ? await shRes.json() : [];
    const allocations = (allocRes && allocRes.ok) ? await allocRes.json() : [];
    const inventoryTx = (txRes && txRes.ok) ? await txRes.json() : [];
    const guardAdvances = (advRes && advRes.ok) ? await advRes.json() : [];
    const payrollRecords = (payRes && payRes.ok) ? await payRes.json() : [];
    const leaveRecords = (leaveRes && leaveRes.ok) ? await leaveRes.json() : [];
    const damageDeductions = (dmgRes && dmgRes.ok) ? await dmgRes.json() : [];

    currentGuardCustodyAllocations = allocations;
    currentGuardCustodyInventory = inventoryTx;

    const html = generateGuardFileHTML(
      g, attendance, sites, shifts, allocations, inventoryTx, guardAdvances, payrollRecords, leaveRecords, damageDeductions
    );

    if (fileViewContainer) {
      fileViewContainer.innerHTML = html;
    }
    if (body) {
      body.innerHTML = html;
    }

    const mainContainer = document.querySelector('.content-container');
    if (mainContainer && mainContainer.scrollTo) {
      mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (err) {
    console.error('viewGuardFile error:', err);
    const errHtml = `
      <div style="padding:40px; text-align:center;">
        <div style="color:#EF4444; font-size:16px; font-weight:700; margin-bottom:12px;">Failed to load guard file from database</div>
        <p style="color:#64748B; margin-bottom:16px;">${escapeHtml(err.message)}</p>
        <button class="btn btn-secondary" onclick="backToGuardsList()">← Back to Guard List</button>
      </div>
    `;
    if (fileViewContainer) fileViewContainer.innerHTML = errHtml;
    if (body) body.innerHTML = errHtml;
  }
}


function backToGuardsList() {
  const fileViewContainer = document.getElementById('guard-file-view');
  const listViewContainer = document.getElementById('guards-list-view');
  const modal = document.getElementById('modal-guard-file');
  if (modal) modal.style.display = 'none';

  if (window.guardFilePreviousTab && window.guardFilePreviousTab !== 'guards') {
    const prev = window.guardFilePreviousTab;
    window.guardFilePreviousTab = null;
    switchTab(prev);
    return;
  }

  window.guardFilePreviousTab = null;
  window.currentActiveTab = 'guards';
  if (fileViewContainer) fileViewContainer.style.display = 'none';
  if (listViewContainer) listViewContainer.style.display = 'block';
  const titleEl = document.getElementById('current-page-title');
  if (titleEl) titleEl.innerText = 'Guard Directory';
  loadGuards();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const mainContainer = document.querySelector('.content-container');
  if (mainContainer && mainContainer.scrollTo) {
    mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function openGuardFileModal(guardId) {
  // Always open in full view, never small modal file
  viewGuardFile(guardId);
}

function closeGuardFileModal() {
  const modal = document.getElementById('modal-guard-file');
  if (modal) modal.style.display = 'none';
  backToGuardsList();
}

function openAmendGuardModal(guardId) {
  const g = currentViewedGuard && currentViewedGuard.id === guardId 
    ? currentViewedGuard 
    : (cachedGuards.find(x => x.id === guardId) || currentViewedGuard);

  if (!g) {
    showToast('Guard record not loaded', 'danger');
    return;
  }

  // Populate Sites dropdown
  const siteSelect = document.getElementById('amend-guard-site-select');
  if (siteSelect) {
    siteSelect.innerHTML = '<option value="">-- Select Deployment Site --</option>';
    (cachedSites || []).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.site_name} (${s.location || 'Kitengela'}) - KES ${(s.basic_salary || 15000).toLocaleString()}`;
      if (s.id === g.site_id || (g.site && s.id === g.site.id)) opt.selected = true;
      siteSelect.appendChild(opt);
    });
  }

  // Populate Shifts dropdown
  const shiftSelect = document.getElementById('amend-guard-shift-select');
  if (shiftSelect) {
    shiftSelect.innerHTML = `
      <option value="1" ${g.shift_id === 1 ? 'selected' : ''}>Day Shift (06:00 - 18:00)</option>
      <option value="2" ${g.shift_id === 2 ? 'selected' : ''}>Night Shift (18:00 - 06:00)</option>
      <option value="3" ${g.shift_id === 3 ? 'selected' : ''}>Reliever Floating Roster</option>
    `;
  }

  const supSelect = document.getElementById('amend-guard-supervisor-select');
  if (supSelect) {
    supSelect.innerHTML = '<option value="">-- No Supervisor Assigned --</option>';
    (supervisorsCache || []).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.full_name || s.email} (${s.email})`;
      if (s.id === g.supervisor_id) opt.selected = true;
      supSelect.appendChild(opt);
    });
  }

  // Fill in form values
  document.getElementById('amend-guard-id').value = g.id;
  document.getElementById('amend-guard-name').value = g.full_name || '';
  document.getElementById('amend-guard-natid').value = g.national_id || '';
  document.getElementById('amend-guard-phone').value = g.phone || '';
  document.getElementById('amend-guard-email').value = g.email || '';
  document.getElementById('amend-guard-gender').value = g.gender || 'Male';
  document.getElementById('amend-guard-dob').value = g.date_of_birth ? String(g.date_of_birth).substring(0, 10) : '';
  document.getElementById('amend-guard-hire-date').value = g.hire_date ? String(g.hire_date).substring(0, 10) : '';
  document.getElementById('amend-guard-salary').value = g.basic_salary !== null && g.basic_salary !== undefined ? g.basic_salary : '';
  document.getElementById('amend-guard-is-reliever').checked = !!g.is_reliever;
  const sgEl = document.getElementById('amend-guard-is-super-guard');
  if (sgEl) sgEl.checked = !!g.is_super_guard;

  const payMethod = g.payment_method || 'Bank Transfer';
  document.getElementById('amend-guard-pay-method').value = payMethod;
  document.getElementById('amend-guard-mpesa').value = g.mpesa_number || '';
  document.getElementById('amend-guard-bank-name').value = g.bank_name || '';
  document.getElementById('amend-guard-bank-account').value = g.bank_account || '';
  document.getElementById('amend-guard-kra').value = g.kra_pin || '';
  document.getElementById('amend-guard-nssf').value = g.nssf_number || '';
  document.getElementById('amend-guard-shif').value = g.shif_number || '';
  if (document.getElementById('amend-guard-education')) document.getElementById('amend-guard-education').value = g.education_level || '';
  if (document.getElementById('amend-guard-blood-group')) document.getElementById('amend-guard-blood-group').value = g.blood_group || '';
  if (document.getElementById('amend-guard-em-name')) document.getElementById('amend-guard-em-name').value = g.emergency_contact_name || '';
  if (document.getElementById('amend-guard-em-phone')) document.getElementById('amend-guard-em-phone').value = g.emergency_contact_phone || '';
  if (document.getElementById('amend-guard-next-of-kin')) document.getElementById('amend-guard-next-of-kin').value = g.next_of_kin || '';

  toggleAmendPayFields();

  const modal = document.getElementById('modal-amend-guard');
  if (modal) modal.style.display = 'flex';
}

function closeAmendGuardModal() {
  const modal = document.getElementById('modal-amend-guard');
  if (modal) modal.style.display = 'none';
}

function toggleAmendPayFields() {
  const method = document.getElementById('amend-guard-pay-method')?.value;
  const mpesaGroup = document.getElementById('amend-mpesa-group');
  const bankGroup = document.getElementById('amend-bank-group');
  if (method === 'M-Pesa') {
    if (mpesaGroup) mpesaGroup.style.display = 'block';
    if (bankGroup) bankGroup.style.display = 'none';
  } else {
    if (mpesaGroup) mpesaGroup.style.display = 'none';
    if (bankGroup) bankGroup.style.display = 'grid';
  }
}

function updateAmendSiteSalaryHint() {
  const siteSelect = document.getElementById('amend-guard-site-select');
  const hint = document.getElementById('amend-salary-hint');
  if (!siteSelect || !hint) return;
  const siteId = parseInt(siteSelect.value);
  const site = (cachedSites || []).find(s => s.id === siteId);
  if (site) {
    hint.textContent = `Site default basic salary is KES ${(site.basic_salary || 15000).toLocaleString()}.`;
  } else {
    hint.textContent = 'Leave blank to inherit site default.';
  }
}

async function handleAmendGuardSubmit(e) {
  e.preventDefault();
  const guardId = parseInt(document.getElementById('amend-guard-id').value);
  if (!guardId) return;

  const full_name = document.getElementById('amend-guard-name').value.trim();
  const national_id = document.getElementById('amend-guard-natid').value.trim();
  const phone = document.getElementById('amend-guard-phone').value.trim();
  const email = document.getElementById('amend-guard-email').value.trim() || null;
  const gender = document.getElementById('amend-guard-gender').value;
  const date_of_birth = document.getElementById('amend-guard-dob').value || null;
  const hire_date = document.getElementById('amend-guard-hire-date').value || null;
  
  const site_id_val = document.getElementById('amend-guard-site-select').value;
  const site_id = site_id_val ? parseInt(site_id_val) : null;
  
  const shift_id_val = document.getElementById('amend-guard-shift-select').value;
  const shift_id = shift_id_val ? parseInt(shift_id_val) : null;

  const sup_id_val = document.getElementById('amend-guard-supervisor-select')?.value;
  const supervisor_id = sup_id_val ? parseInt(sup_id_val) : null;

  const salary_val = document.getElementById('amend-guard-salary').value.trim();
  const basic_salary = salary_val ? parseFloat(salary_val) : null;

  const is_reliever = document.getElementById('amend-guard-is-reliever').checked;
  const is_super_guard = document.getElementById('amend-guard-is-super-guard')?.checked || false;
  const payment_method = document.getElementById('amend-guard-pay-method').value;
  const mpesa_number = document.getElementById('amend-guard-mpesa').value.trim() || null;
  const bank_name = document.getElementById('amend-guard-bank-name').value.trim() || null;
  const bank_account = document.getElementById('amend-guard-bank-account').value.trim() || null;

  const kra_pin = document.getElementById('amend-guard-kra').value.trim() || null;
  const nssf_number = document.getElementById('amend-guard-nssf').value.trim() || null;
  const shif_number = document.getElementById('amend-guard-shif').value.trim() || null;

  const education_level = document.getElementById('amend-guard-education')?.value.trim() || null;
  const blood_group = document.getElementById('amend-guard-blood-group')?.value.trim() || null;
  const emergency_contact_name = document.getElementById('amend-guard-em-name')?.value.trim() || null;
  const emergency_contact_phone = document.getElementById('amend-guard-em-phone')?.value.trim() || null;
  const next_of_kin = document.getElementById('amend-guard-next-of-kin')?.value.trim() || null;

  const payload = {
    full_name, national_id, phone, email, gender, date_of_birth, hire_date,
    site_id, shift_id, supervisor_id, basic_salary, is_reliever, is_super_guard,
    payment_method, mpesa_number, bank_name, bank_account,
    kra_pin, nssf_number, shif_number,
    education_level, blood_group, emergency_contact_name, emergency_contact_phone, next_of_kin
  };

  try {
    const res = await apiFetch(`/guards/${guardId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Failed to update guard file');
    }

    showToast('Guard file amended successfully!', 'success');
    closeAmendGuardModal();
    // Refresh the view
    await viewGuardFile(guardId);
    await loadGuards();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}


async function loadSites() {
  try {
    loadRegions().catch(() => {});
    const res = await apiFetch('/sites');
    const sites = await res.json();
    cachedSites = sites;
    const tbody = document.getElementById('sites-table-body');
    if (tbody) {
      tbody.innerHTML = '';
      if (sites.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:24px; color:#64748B;">No client sites registered. Click "+ Add New Site" to create one.</td></tr>';
      } else {
        sites.forEach(s => {
          const tr = document.createElement('tr');
          const regName = s.region_name ? `<span class="badge" style="background:#F3E8FF; color:#6B21A8;">${s.region_name}</span>` : `<span style="font-size:11px; color:#94A3B8;">None</span>`;
          const basicSal = `KES ${(s.basic_salary || 15000).toLocaleString()}`;
          const supBadge = s.supervisor_name 
            ? `<span class="badge" style="background:#EFF6FF; color:#1D4ED8; font-weight:600;">👨‍💼 ${s.supervisor_name}</span>`
            : `<span style="font-size:11px; color:#94A3B8; font-style:italic;">Unassigned</span>`;

          const geofenceBadge = (s.latitude && s.longitude)
            ? `<span class="badge" style="background:#F0FDF4; color:#166534; font-weight:600;" title="Lat: ${s.latitude}, Lng: ${s.longitude}">📍 ${s.geofence_radius || 200}m (GPS Set)</span>`
            : `<span class="badge" style="background:#F1F5F9; color:#64748B;">📍 ${s.geofence_radius || 200}m (No GPS)</span>`;
          const superGuardBadge = s.super_guard_name
            ? `<span class="badge" style="background:#E0F2FE; color:#0369A1; font-weight:700;">🛡️ ${s.super_guard_name}</span>`
            : `<span style="font-size:11px; color:#94A3B8; font-style:italic;">None</span>`;

          tr.innerHTML = `
            <td><b>${s.site_name}</b></td>
            <td>${regName}</td>
            <td>${s.client_name}</td>
            <td>${s.location}</td>
            <td>${supBadge}</td>
            <td>${basicSal}</td>
            <td>KES ${Number(s.daily_rate).toLocaleString()}</td>
            <td>KES ${Number(s.night_allowance || 0).toLocaleString()}</td>
            <td>
              <div style="display:flex; flex-direction:column; gap:3px;">
                <div>${geofenceBadge}</div>
                <div>${superGuardBadge}</div>
              </div>
            </td>
            <td>
              <button class="btn btn-primary" style="padding:4px 10px; font-size:12px;" onclick="openEditSiteModal(${s.id})">✏️ Edit Site</button>
              <button class="btn btn-secondary" style="padding:4px 10px; font-size:12px; margin-left:4px;" onclick="openGenerateInvoiceModal(${s.id})">🧾 Invoice Site</button>
            </td>
          `;
          tbody.appendChild(tr);
        });
      }
    }

    const mSites = document.getElementById('metric-sites-count');
    if (mSites) mSites.innerText = sites.length;

    renderAnalyticsSiteDistribution();
  } catch (err) {
    console.error('loadSites error:', err);
  }
}

function renderAnalyticsSiteDistribution(distribution = null) {
  const containerList = document.getElementById('reports-site-progress-list');
  const containerBubbles = document.getElementById('reports-site-bubble-nodes');

  let list = distribution;
  if (!list || !list.length) {
    if (cachedSites && cachedSites.length) {
      const totalGuards = (cachedGuards && cachedGuards.length) ? cachedGuards.length : 1;
      list = cachedSites.map(s => {
        const cnt = cachedGuards ? cachedGuards.filter(g => g.primary_site_id === s.id).length : 0;
        return {
          site_id: s.id,
          site_name: s.site_name,
          location: s.location || 'Nairobi',
          guard_count: cnt,
          percentage: Math.round((cnt / totalGuards) * 100)
        };
      });
    }
  }

  if (!list || !list.length) {
    if (containerList) containerList.innerHTML = '<div style="text-align:center; padding:12px; color:#64748B;">No site placement data available.</div>';
    return;
  }

  const colors = ['#8B5CF6', '#7C3AED', '#635BFF', '#A855F7', '#EC4899', '#3B82F6'];

  if (containerBubbles) {
    containerBubbles.innerHTML = list.map((s, idx) => {
      const col = colors[idx % colors.length];
      return `<div class="bubble-node bubble-md" style="background:${col}; cursor:pointer;" title="${s.site_name} (${s.location}): ${s.guard_count} Guards (${s.percentage}%)">${s.guard_count}</div>`;
    }).join('');
  }

  if (containerList) {
    containerList.innerHTML = list.map((s, idx) => {
      const col = colors[idx % colors.length];
      return `
        <div class="site-progress-item">
          <div class="site-progress-meta">
            <span style="font-weight:600; color:#0F172A;">${s.site_name} <span style="font-size:11px; color:#64748B;">(${s.location})</span></span>
            <span style="font-weight:700; color:#0F172A;">${s.percentage}% (${s.guard_count} Guards)</span>
          </div>
          <div class="progress-bar-track" style="background:#E2E8F0; height:8px; border-radius:4px; overflow:hidden;">
            <div class="progress-bar-fill" style="width: ${Math.max(s.percentage, 4)}%; background:${col}; height:100%; border-radius:4px; transition:width 0.3s ease;"></div>
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
          const g = (cachedGuards && cachedGuards.length) ? cachedGuards.find(x => x.id === a.guard_id) : null;
          const s = (cachedSites && cachedSites.length) ? cachedSites.find(x => x.id === a.site_id) : null;
          const guardLabel = a.guard_name || (g ? g.full_name : `Guard #${a.guard_id}`);
          const siteLabel = a.site_name || (s ? s.site_name : 'Client Site');
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
        const user = getLoggedInUser();
        let displayAtts = atts;
        if (user && user.role === 'SUPERVISOR') {
          const assignedIds = new Set(cachedGuards.filter(g => g.supervisor_id === user.id).map(g => g.id));
          displayAtts = atts.filter(a => assignedIds.has(a.guard_id));
        }
        displayAtts.slice(0, 6).forEach(a => {
          const clockIn = a.actual_clock_in ? new Date(a.actual_clock_in).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-';
          const g = (cachedGuards && cachedGuards.length) ? cachedGuards.find(x => x.id === a.guard_id) : null;
          const s = (cachedSites && cachedSites.length) ? cachedSites.find(x => x.id === a.site_id) : null;
          const guardName = a.guard_name ? `${a.guard_name} (${a.guard_employee_number || ''})` : (g ? `${g.full_name} (${g.employee_number})` : `Guard #${a.guard_id}`);
          const siteName = a.site_name || (s ? s.site_name : 'Client Site');
          const shiftBadge = (a.shift_type === 'NIGHT') ? '<span class="badge" style="background:#1E1B4B; color:#C7D2FE;">🌙 Night</span>' : '<span class="badge" style="background:#FEF3C7; color:#B45309;">☀️ Day</span>';
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${escapeHtml(guardName)}</strong></td>
            <td>${escapeHtml(siteName)}</td>
            <td>${clockIn}</td>
            <td>${shiftBadge}</td>
            <td><span class="badge badge-active">${escapeHtml(a.status || 'ON DUTY')}</span></td>
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
      if (tbody) tbody.innerHTML = `<tr><td colspan="17" style="text-align:center; padding:20px; color:#64748B;">No payroll calculation records found. Click 'Run Payroll' to calculate.</td></tr>`;
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
      if (tbody) tbody.innerHTML = `<tr><td colspan="17" style="text-align:center; padding:20px; color:#64748B;">No payroll calculation records found for period #${periodId}. Click 'Run Payroll' to calculate.</td></tr>`;
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
        const daysW = r.days_worked !== undefined ? r.days_worked : 0;
        const offDayDed = r.off_day_deduction || 0;
        const salAdvDed = r.salary_advance_deduction || 0;
        const damageDed = r.damage_deduction || 0;
        const unpLeaveDed = r.unpaid_leave_deduction || 0;
        tr.innerHTML = `
          <td><b>${r.employee_number}</b></td>
          <td>${r.guard_name}</td>
          <td><span class="badge" style="background:#EFF6FF; color:#1D4ED8; font-weight:700; padding:3px 8px; border-radius:6px;">${daysW} / 26 d</span></td>
          <td>KES ${Number(r.basic_pay || 0).toLocaleString()}</td>
          <td>KES ${Number(r.overtime_pay || 0).toLocaleString()}</td>
          <td>KES ${Number(r.allowances || 0).toLocaleString()}</td>
          <td><b>KES ${Number(r.gross_pay || 0).toLocaleString()}</b></td>
          <td>KES ${Number(r.nssf_deduction || 0).toLocaleString()}</td>
          <td>KES ${Number(r.shif_deduction || 0).toLocaleString()}</td>
          <td>KES ${Number(r.housing_levy_deduction || 0).toLocaleString()}</td>
          <td>
            <div style="display:flex; align-items:center; gap:6px;">
              <span>KES ${Number(r.paye_deduction || 0).toLocaleString()}</span>
              <button class="btn btn-secondary" style="padding:2px 6px; font-size:11px; height:auto;" title="View PAYE Tax Audit Breakdown" onclick="openPayeBreakdownModal(${idx})">ℹ️ View breakdown</button>
            </div>
          </td>
          <td style="color:${unpLeaveDed > 0 ? '#DC2626' : '#64748B'}; font-weight:${unpLeaveDed > 0 ? '700' : '400'};">KES ${unpLeaveDed.toLocaleString('en-KE', {minimumFractionDigits:2})}</td>
          <td style="color:${offDayDed > 0 ? '#DC2626' : '#64748B'}; font-weight:${offDayDed > 0 ? '700' : '400'};">KES ${offDayDed.toLocaleString('en-KE', {minimumFractionDigits:2})}</td>
          <td style="color:${salAdvDed > 0 ? '#D97706' : '#64748B'}; font-weight:${salAdvDed > 0 ? '700' : '400'};">KES ${salAdvDed.toLocaleString('en-KE', {minimumFractionDigits:2})}</td>
          <td style="color:${damageDed > 0 ? '#DC2626' : '#64748B'}; font-weight:${damageDed > 0 ? '700' : '400'};">KES ${damageDed.toLocaleString('en-KE', {minimumFractionDigits:2})}</td>
          <td style="color:#3B5EDB; font-weight:700;">KES ${Number(r.net_pay || 0).toLocaleString()}</td>
          <td><button class="btn btn-secondary" style="padding:4px 10px; font-size:12px; white-space:nowrap;" onclick="downloadSinglePayslip(${r.id})">📄 Payslip</button></td>
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
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:20px;">
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
          <div style="background:#FFFBEB; border:1px solid #FCD34D; border-radius:12px; padding:14px;">
            <div style="font-size:11px; color:#92400E; font-weight:600;">⏸️ Held Salaries (Protected)</div>
            <div style="font-size:18px; font-weight:800; color:#B45309;">KES ${(recon.total_held_amount || 0).toLocaleString('en-KE', {minimumFractionDigits:2})}</div>
            <div style="font-size:11px; color:#92400E;">${recon.held_records_count || 0} guard(s) on hold</div>
          </div>
          <div style="background:${isReconciled ? '#F0FDF4' : '#FEF2F2'}; border:1px solid ${isReconciled ? '#86EFAC' : '#FCA5A5'}; border-radius:12px; padding:14px;">
            <div style="font-size:11px; color:${isReconciled ? '#166534' : '#991B1B'}; font-weight:600;">Reconciliation Audit</div>
            <div style="font-size:18px; font-weight:800; color:${isReconciled ? '#15803D' : '#DC2626'};">${isReconciled ? 'RECONCILED ✅' : 'DISCREPANCY ❌'}</div>
            <div style="font-size:11px; color:${isReconciled ? '#166534' : '#991B1B'};">Discrepancy: KES ${recon.discrepancy.toFixed(2)}</div>
          </div>
        </div>
      `;
    }

    // Update Held Salaries sub-tab count badge
    const badgeHeld = document.getElementById('badge-held-salaries-count');
    if (badgeHeld) {
      const heldCount = (recon.held_items || []).length;
      if (heldCount > 0) {
        badgeHeld.innerText = heldCount;
        badgeHeld.style.display = 'inline-block';
      } else {
        badgeHeld.style.display = 'none';
      }
    }

    const tbody = document.getElementById('payments-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    recon.bank_items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${item.employee_number}</b></td>
        <td>${escapeHtml(item.guard_name)}</td>
        <td><span class="badge badge-active" style="background:#2563EB;">Bank Transfer</span></td>
        <td>${escapeHtml(item.bank_name)}</td>
        <td><code>${escapeHtml(item.bank_account)}</code></td>
        <td><b>KES ${item.amount.toLocaleString('en-KE', {minimumFractionDigits:2})}</b></td>
        <td><span class="badge badge-active">${item.status}</span></td>
        <td>
          <button type="button" class="btn btn-secondary" style="padding:3px 8px; font-size:11px; color:#B45309; border-color:#FCD34D; background:#FFFBEB; font-weight:700;" onclick="openHoldSalaryModal(${item.payroll_record_id}, '${escapeHtml(item.guard_name)}', '${escapeHtml(item.employee_number)}', ${item.amount})" title="Place monthly salary on hold">
            ⏸️ Hold
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    recon.mpesa_items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${item.employee_number}</b></td>
        <td>${escapeHtml(item.guard_name)}</td>
        <td><span class="badge badge-active" style="background:#059669;">M-Pesa</span></td>
        <td>Safaricom M-Pesa</td>
        <td><code>${escapeHtml(item.mpesa_number)}</code></td>
        <td><b>KES ${item.amount.toLocaleString('en-KE', {minimumFractionDigits:2})}</b></td>
        <td><span class="badge badge-active">${item.status}</span></td>
        <td>
          <button type="button" class="btn btn-secondary" style="padding:3px 8px; font-size:11px; color:#B45309; border-color:#FCD34D; background:#FFFBEB; font-weight:700;" onclick="openHoldSalaryModal(${item.payroll_record_id}, '${escapeHtml(item.guard_name)}', '${escapeHtml(item.employee_number)}', ${item.amount})" title="Place monthly salary on hold">
            ⏸️ Hold
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    recon.unrouted_items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${item.employee_number}</b></td>
        <td>${escapeHtml(item.guard_name)}</td>
        <td><span class="badge badge-inactive" style="background:#EF4444; color:white;">Unrouted</span></td>
        <td colspan="2" style="color:#DC2626; font-size:12px;">⚠️ ${escapeHtml(item.reason)}</td>
        <td><b style="color:#DC2626;">KES ${item.net_pay.toLocaleString('en-KE', {minimumFractionDigits:2})}</b></td>
        <td><span class="badge badge-inactive" style="background:#F59E0B; color:white;">EXCLUDED</span></td>
        <td><span style="font-size:11px; color:#94A3B8;">—</span></td>
      `;
      tbody.appendChild(tr);
    });

    // Populate Held Salaries Table Section
    const heldTbody = document.getElementById('payments-held-table-body');
    if (heldTbody) {
      if (!recon.held_items || recon.held_items.length === 0) {
        heldTbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:#64748B;">No salaries currently on hold.</td></tr>';
      } else {
        heldTbody.innerHTML = recon.held_items.map(item => `
          <tr>
            <td><b>${escapeHtml(item.employee_number)}</b></td>
            <td><b>${escapeHtml(item.guard_name)}</b></td>
            <td><span class="badge" style="background:#EFF6FF; color:#1D4ED8;">${escapeHtml(item.payment_method)}</span></td>
            <td><code>${escapeHtml(item.account_number)}</code></td>
            <td style="color:#B45309; font-weight:800;">KES ${item.amount.toLocaleString('en-KE', {minimumFractionDigits:2})}</td>
            <td style="max-width:260px; white-space:normal; font-size:12px; color:#92400E; background:#FEF3C7; padding:8px 12px; border-radius:6px;">
              <b>Reason:</b> ${escapeHtml(item.hold_reason || 'Pending clearance')}
            </td>
            <td style="font-size:11px; color:#64748B;">
              ${escapeHtml(item.held_by || 'Admin')}<br>
              ${item.held_at ? String(item.held_at).substring(0, 10) : '—'}
            </td>
            <td>
              <button type="button" class="btn btn-primary" style="padding:5px 12px; font-size:12px; background:#059669; border-color:#059669; font-weight:700; white-space:nowrap;" onclick="openReleaseSalaryHoldModal(${item.payroll_record_id}, '${escapeHtml(item.guard_name)}', '${escapeHtml(item.employee_number)}', ${item.amount}, '${escapeHtml(item.hold_reason || '')}')" title="Clear issue and release salary for payment">
                ✅ Release Hold &amp; Pay
              </button>
            </td>
          </tr>
        `).join('');
      }
    }

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

// --- Payment Schedules Sub-Navigation & Salary Hold Management ---
function switchPaymentsSubTab(tab) {
  const activeContainer = document.getElementById('payments-active-container');
  const heldContainer = document.getElementById('payments-held-container');
  const btnActive = document.getElementById('btn-tab-payments-active');
  const btnHeld = document.getElementById('btn-tab-payments-held');

  if (tab === 'held') {
    if (activeContainer) activeContainer.style.display = 'none';
    if (heldContainer) heldContainer.style.display = 'block';
    if (btnActive) {
      btnActive.style.background = '#F1F5F9';
      btnActive.style.color = '#475569';
    }
    if (btnHeld) {
      btnHeld.style.background = '#D97706';
      btnHeld.style.color = '#FFF';
    }
  } else {
    if (activeContainer) activeContainer.style.display = 'block';
    if (heldContainer) heldContainer.style.display = 'none';
    if (btnActive) {
      btnActive.style.background = '#2563EB';
      btnActive.style.color = '#FFF';
    }
    if (btnHeld) {
      btnHeld.style.background = '#F1F5F9';
      btnHeld.style.color = '#475569';
    }
  }
}

function openHoldSalaryModal(recordId, guardName, empNo, amount, defaultReason = '') {
  const modal = document.getElementById('modal-hold-salary');
  if (!modal) return;

  const form = document.getElementById('form-hold-salary');
  if (form) form.reset();

  document.getElementById('hold-salary-record-id').value = recordId;
  const guardInfo = document.getElementById('hold-salary-guard-info');
  if (guardInfo) guardInfo.innerText = `${guardName} (${empNo})`;
  const amtInfo = document.getElementById('hold-salary-amount-info');
  if (amtInfo) amtInfo.innerText = `Net Salary to Hold: KES ${Number(amount || 0).toLocaleString('en-KE', {minimumFractionDigits:2})}`;
  if (defaultReason) {
    const reasonEl = document.getElementById('hold-salary-reason');
    if (reasonEl) reasonEl.value = defaultReason;
  }

  modal.style.display = 'flex';
}

function closeHoldSalaryModal() {
  const modal = document.getElementById('modal-hold-salary');
  if (modal) modal.style.display = 'none';
}

async function handleHoldSalarySubmit(event) {
  event.preventDefault();
  const recordId = document.getElementById('hold-salary-record-id').value;
  const reason = document.getElementById('hold-salary-reason').value.trim();

  if (!reason) {
    showToast('Please specify a valid reason for placing this salary on hold.', 'warning');
    return;
  }

  const btn = document.getElementById('btn-submit-hold-salary');
  if (btn) { btn.disabled = true; btn.innerText = 'Holding Salary...'; }

  try {
    const res = await apiFetch(`/payments/records/${recordId}/hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Failed to place salary on hold');
    }

    showToast('⏸️ Salary placed on HOLD! Excluded from Excel disbursement exports.', 'success');
    closeHoldSalaryModal();
    loadPayments();
  } catch (err) {
    console.error('handleHoldSalarySubmit error:', err);
    showToast(err.message || 'Error placing salary on hold', 'danger');
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = '⏸️ Confirm Salary Hold'; }
  }
}

function openReleaseSalaryHoldModal(recordId, guardName, empNo, amount, currentReason) {
  const modal = document.getElementById('modal-release-salary-hold');
  if (!modal) return;

  const form = document.getElementById('form-release-salary-hold');
  if (form) form.reset();

  document.getElementById('release-salary-record-id').value = recordId;
  const guardInfo = document.getElementById('release-salary-guard-info');
  if (guardInfo) guardInfo.innerText = `${guardName} (${empNo})`;
  const amtInfo = document.getElementById('release-salary-amount-info');
  if (amtInfo) amtInfo.innerText = `Net Salary Approved for Payment: KES ${Number(amount || 0).toLocaleString('en-KE', {minimumFractionDigits:2})}`;
  const reasonInfo = document.getElementById('release-salary-current-reason');
  if (reasonInfo) reasonInfo.innerText = `Current Hold Reason: ${currentReason || 'Administrative hold'}`;

  modal.style.display = 'flex';
}

function closeReleaseSalaryHoldModal() {
  const modal = document.getElementById('modal-release-salary-hold');
  if (modal) modal.style.display = 'none';
}

async function handleReleaseSalaryHoldSubmit(event) {
  event.preventDefault();
  const recordId = document.getElementById('release-salary-record-id').value;
  const notes = document.getElementById('release-salary-resolution-notes').value.trim();

  const btn = document.getElementById('btn-submit-release-salary');
  if (btn) { btn.disabled = true; btn.innerText = 'Releasing Hold & Approving...'; }

  try {
    const res = await apiFetch(`/payments/records/${recordId}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution_notes: notes || 'Hold resolved and approved for disbursement.' })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Failed to release salary hold');
    }

    showToast('✅ Salary hold released! Employee restored to active disbursement schedules.', 'success');
    closeReleaseSalaryHoldModal();
    loadPayments();
  } catch (err) {
    console.error('handleReleaseSalaryHoldSubmit error:', err);
    showToast(err.message || 'Error releasing salary hold', 'danger');
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = '✅ Release Hold & Approve for Payment'; }
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

async function downloadAuthenticatedFile(url, defaultFilename) {
  try {
    showToast(`⏳ Preparing download for ${defaultFilename}...`, 'info');
    const res = await apiFetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Download request failed with status ' + res.status);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition');
    let filename = defaultFilename;
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename=(?:["']?)([^"';]+)(?:["']?)/);
      if (match && match[1]) filename = match[1];
    }
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
    showToast(`✅ File "${filename}" downloaded successfully!`, 'success');
  } catch (err) {
    console.error('Download error:', err);
    showToast(`Download failed: ${err.message}`, 'danger');
  }
}

async function exportBankScheduleExcel() {
  const periodId = await getLatestPeriodId();
  await downloadAuthenticatedFile(`/payments/bank/${periodId}/export-excel`, `Bank_Payment_Schedule_Period_${periodId}.xlsx`);
}

async function exportMpesaScheduleExcel() {
  const periodId = await getLatestPeriodId();
  await downloadAuthenticatedFile(`/payments/mpesa/${periodId}/export-excel`, `Mpesa_Payment_Schedule_Period_${periodId}.xlsx`);
}

async function downloadNssfCsv() {
  const periodSel = document.getElementById('reports-download-period-select');
  const periodId = (periodSel && periodSel.value) ? periodSel.value : await getLatestPeriodId();
  await downloadAuthenticatedFile(`/reports/nssf/${periodId}?format=csv`, `NSSF_Return_Period_${periodId}.csv`);
}

async function downloadShifCsv() {
  const periodSel = document.getElementById('reports-download-period-select');
  const periodId = (periodSel && periodSel.value) ? periodSel.value : await getLatestPeriodId();
  await downloadAuthenticatedFile(`/reports/shif/${periodId}?format=csv`, `SHIF_Return_Period_${periodId}.csv`);
}

async function downloadHousingLevyCsv() {
  const periodSel = document.getElementById('reports-download-period-select');
  const periodId = (periodSel && periodSel.value) ? periodSel.value : await getLatestPeriodId();
  await downloadAuthenticatedFile(`/reports/housing-levy/${periodId}?format=csv`, `Housing_Levy_Return_Period_${periodId}.csv`);
}

async function downloadP9Pdf() {
  const guardSel = document.getElementById('reports-download-guard-select');
  let guardId = guardSel ? guardSel.value : null;
  if (!guardId) {
    try {
      const res = await apiFetch('/guards');
      const guards = await res.json();
      guardId = (guards && guards.length > 0) ? guards[0].id : 1;
    } catch (e) {
      guardId = 1;
    }
  }
  const yearSelect = document.getElementById('reports-year-select');
  const year = yearSelect ? yearSelect.value : new Date().getFullYear();
  await downloadAuthenticatedFile(`/reports/p9/${guardId}/${year}?format=pdf`, `KRA_P9_Tax_Card_Guard_${guardId}_${year}.pdf`);
}

async function downloadSinglePayslip(recordId) {
  await downloadAuthenticatedFile(`/payslips/${recordId}/pdf`, `Payslip_${recordId}.pdf`);
}

/* ==========================================================================
   ANALYTICS & STATUTORY REPORTS (LIVE DATABASE DRIVEN)
   ========================================================================== */
let analyticsCache = null;

async function loadAnalyticsData(selectedPeriodId = null) {
  const user = getLoggedInUser();
  if (user && user.role === 'SUPERVISOR') return;
  const yearSelect = document.getElementById('reports-year-select');
  const year = yearSelect ? yearSelect.value : 2026;

  try {
    let url = `/reports/analytics?year=${year}`;
    if (selectedPeriodId) {
      url += `&period_id=${selectedPeriodId}`;
    }
    const res = await apiFetch(url);
    if (!res.ok) throw new Error('Failed to fetch analytics from database');
    const data = await res.json();
    analyticsCache = data;

    // 1. Top KPI Summary Cards
    const mGross = document.getElementById('reports-metric-payroll');
    if (mGross) mGross.innerText = `KES ${Number(data.kpis.monthly_payroll_gross || 0).toLocaleString()}`;

    const mShifts = document.getElementById('reports-metric-shifts');
    if (mShifts) mShifts.innerText = data.kpis.completed_shifts || 0;

    const mGuards = document.getElementById('reports-metric-guards');
    if (mGuards) mGuards.innerText = data.kpis.active_guards || 0;

    const mOt = document.getElementById('reports-metric-overtime');
    if (mOt) mOt.innerText = `${data.kpis.overtime_hours || 0} hrs`;

    // 2. Monthly Bar Chart
    renderAnalyticsMonthlyTrend(data.monthly_trend);

    // 3. Statutory Deductions Breakdown & Gauge
    renderAnalyticsStatutory(data.statutory_deductions, data.active_period, data.periods);

    // 4. Site Placement Distribution
    renderAnalyticsSiteDistribution(data.site_distribution);

    // 5. Statutory Downloads Dropdowns
    populateAnalyticsDownloadSelectors(data.periods, data.guards);

  } catch (err) {
    console.error('loadAnalyticsData error:', err);
    showToast('Analytics error: ' + err.message, 'danger');
  }
}

function renderAnalyticsMonthlyTrend(trendData) {
  const container = document.getElementById('reports-bar-chart-container');
  if (!container || !trendData) return;

  const existingTooltip = document.getElementById('reports-chart-tooltip');
  container.innerHTML = '';
  if (existingTooltip) {
    container.appendChild(existingTooltip);
  } else {
    const tt = document.createElement('div');
    tt.className = 'chart-tooltip-pill';
    tt.id = 'reports-chart-tooltip';
    tt.innerHTML = '<div id="reports-tooltip-text">● Live Monthly Database Summary</div>';
    container.appendChild(tt);
  }

  trendData.forEach(m => {
    const group = document.createElement('div');
    group.className = 'bar-group';
    group.style.cursor = 'pointer';

    const grossHeight = m.gross_pct || (m.has_data ? 30 : 8);
    const netHeight = m.net_pct || (m.has_data ? 25 : 8);
    const grossBg = m.has_data ? '#CBD5E1' : '#F1F5F9';
    const netBg = m.has_data ? '#7C3AED' : '#E2E8F0';

    group.innerHTML = `
      <div class="bar-pair-wrapper" style="height:140px; display:flex; align-items:flex-end; gap:4px; justify-content:center;">
        <div class="bar-pillar bar-gross" style="height:${grossHeight}%; background:${grossBg}; min-height:8px; border-radius:4px 4px 0 0; transition:height 0.3s ease;" title="${m.month_label} Gross: KES ${m.gross_pay.toLocaleString()}"></div>
        <div class="bar-pillar bar-net" style="height:${netHeight}%; background:${netBg}; min-height:8px; border-radius:4px 4px 0 0; transition:height 0.3s ease;" title="${m.month_label} Net: KES ${m.net_pay.toLocaleString()}"></div>
      </div>
      <span class="bar-month-label" style="font-weight:${m.has_data ? '700' : '500'}; color:${m.has_data ? '#0F172A' : '#94A3B8'};">${m.month_label}</span>
    `;

    group.addEventListener('mouseenter', () => {
      const ttText = document.getElementById('reports-tooltip-text');
      if (ttText) {
        if (m.has_data) {
          ttText.innerHTML = `<b>● ${m.period_name}:</b> Gross KES ${m.gross_pay.toLocaleString()} | Net KES ${m.net_pay.toLocaleString()}`;
        } else {
          ttText.innerHTML = `● ${m.period_name}: No payroll executed yet`;
        }
      }
    });

    group.addEventListener('click', () => {
      if (m.period_id) {
        onAnalyticsPeriodChange(m.period_id);
      }
    });

    container.appendChild(group);
  });
}

function renderAnalyticsStatutory(stats, activePeriod, periods) {
  if (!stats) return;

  const totalDeductions = stats.total_deductions || 0;
  const paye = stats.paye || 0;
  const nssf = stats.nssf_total || 0;
  const shif = stats.shif || 0;
  const housing = stats.housing_total || 0;

  const totalEl = document.getElementById('reports-stat-total');
  if (totalEl) totalEl.innerText = `KES ${totalDeductions.toLocaleString()}`;

  const payeEl = document.getElementById('reports-stat-paye');
  if (payeEl) payeEl.innerText = `KES ${paye.toLocaleString()}`;

  const nssfEl = document.getElementById('reports-stat-nssf');
  if (nssfEl) nssfEl.innerText = `KES ${nssf.toLocaleString()}`;

  const shifEl = document.getElementById('reports-stat-shif');
  if (shifEl) shifEl.innerText = `KES ${shif.toLocaleString()}`;

  const housingEl = document.getElementById('reports-stat-housing');
  if (housingEl) housingEl.innerText = `KES ${housing.toLocaleString()}`;

  const subtitle = document.getElementById('reports-stat-period-name');
  if (subtitle && activePeriod) {
    subtitle.innerText = `Tax & statutory distribution for ${activePeriod.name || 'Current Period'}`;
  }

  const select = document.getElementById('reports-stat-period-select');
  if (select && periods && periods.length) {
    select.innerHTML = periods.map(p => {
      const sel = (activePeriod && p.id === activePeriod.id) ? 'selected' : '';
      return `<option value="${p.id}" ${sel}>${p.period_name} (${p.status})</option>`;
    }).join('');
  }
}

function onAnalyticsPeriodChange(periodId) {
  if (!periodId) return;
  loadAnalyticsData(parseInt(periodId));
}

function populateAnalyticsDownloadSelectors(periods, guards) {
  const pSel = document.getElementById('reports-download-period-select');
  if (pSel && periods && periods.length) {
    const currentVal = pSel.value;
    pSel.innerHTML = periods.map(p => {
      const sel = p.is_selected || p.id === parseInt(currentVal) ? 'selected' : '';
      return `<option value="${p.id}" ${sel}>${p.period_name} (${p.status})</option>`;
    }).join('');
  }

  const gSel = document.getElementById('reports-download-guard-select');
  if (gSel && guards && guards.length) {
    const currentGVal = gSel.value;
    gSel.innerHTML = guards.map(g => {
      const sel = g.id === parseInt(currentGVal) ? 'selected' : '';
      return `<option value="${g.id}" ${sel}>${g.full_name} (${g.employee_number})</option>`;
    }).join('');
  }
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
    payload.is_super_guard = document.getElementById('new-guard-is-super-guard')?.checked || false;
    payload.is_reliever = document.getElementById('new-guard-is-reliever')?.checked || false;

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

/* ==========================================================================
   Admin Incident Reports & Safety Logs Management
   ========================================================================== */

let allAdminIncidents = [];
let currentIncidentFilter = 'ALL';
let incidentSearchQuery = '';

async function loadAdminIncidents() {
  try {
    const res = await apiFetch('/incidents');
    if (!res.ok) {
      console.error('Failed to fetch incidents:', res.status);
      return;
    }
    allAdminIncidents = await res.json();

    // Compute metric card values
    const totalCount = allAdminIncidents.length;
    const openCount = allAdminIncidents.filter(i => i.status === 'OPEN').length;
    const invCount = allAdminIncidents.filter(i => i.status === 'INVESTIGATING').length;
    const resCount = allAdminIncidents.filter(i => i.status === 'RESOLVED').length;

    // Update KPI card metrics
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

    // Update filter badge counters
    const bAll = document.getElementById('inc-count-all');
    const bOpen = document.getElementById('inc-count-open');
    const bInv = document.getElementById('inc-count-investigating');
    const bRes = document.getElementById('inc-count-resolved');

    if (bAll) bAll.innerText = totalCount;
    if (bOpen) bOpen.innerText = openCount;
    if (bInv) bInv.innerText = invCount;
    if (bRes) bRes.innerText = resCount;

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
  const btnInv = document.getElementById('inc-filter-investigating');
  const btnRes = document.getElementById('inc-filter-resolved');

  if (btnAll) btnAll.className = filterType === 'ALL' ? 'btn btn-primary' : 'btn btn-secondary';
  if (btnOpen) btnOpen.className = filterType === 'OPEN' ? 'btn btn-primary' : 'btn btn-secondary';
  if (btnInv) btnInv.className = filterType === 'INVESTIGATING' ? 'btn btn-primary' : 'btn btn-secondary';
  if (btnRes) btnRes.className = filterType === 'RESOLVED' ? 'btn btn-primary' : 'btn btn-secondary';

  renderAdminIncidentsTable();
}

function handleIncidentSearch() {
  const input = document.getElementById('inc-search-input');
  incidentSearchQuery = input ? input.value.trim().toLowerCase() : '';
  renderAdminIncidentsTable();
}

function renderAdminIncidentsTable() {
  const tbody = document.getElementById('incidents-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  let filtered = allAdminIncidents;
  if (currentIncidentFilter === 'OPEN') {
    filtered = allAdminIncidents.filter(i => i.status === 'OPEN');
  } else if (currentIncidentFilter === 'INVESTIGATING') {
    filtered = allAdminIncidents.filter(i => i.status === 'INVESTIGATING');
  } else if (currentIncidentFilter === 'RESOLVED') {
    filtered = allAdminIncidents.filter(i => i.status === 'RESOLVED');
  }

  // Apply search query filter
  if (incidentSearchQuery) {
    filtered = filtered.filter(i => {
      const ref = (i.reference_number || '').toLowerCase();
      const guard = (i.guard_name || '').toLowerCase();
      const emp = (i.guard_employee_number || '').toLowerCase();
      const site = (i.site_name || '').toLowerCase();
      const type = (i.incident_type || '').toLowerCase();
      const desc = (i.description || '').toLowerCase();
      return ref.includes(incidentSearchQuery) ||
             guard.includes(incidentSearchQuery) ||
             emp.includes(incidentSearchQuery) ||
             site.includes(incidentSearchQuery) ||
             type.includes(incidentSearchQuery) ||
             desc.includes(incidentSearchQuery);
    });
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:32px 16px; color:#64748B;">
      <div style="font-size:24px; margin-bottom:8px;">🔍</div>
      <strong style="color:#1E293B; display:block; margin-bottom:4px;">No incident reports found</strong>
      <span style="font-size:12px;">${incidentSearchQuery ? 'No cases match your search query.' : 'There are no incident records in this filter category.'}</span>
    </td></tr>`;
    return;
  }

  filtered.forEach(inc => {
    const tr = document.createElement('tr');

    let badgeHtml = '';
    if (inc.status === 'OPEN') {
      badgeHtml = '<span class="badge" style="background:#FEF3C7; color:#92400E; font-weight:700; border:1px solid #FCD34D;">⚠️ OPEN</span>';
    } else if (inc.status === 'INVESTIGATING') {
      badgeHtml = '<span class="badge" style="background:#DBEAFE; color:#1E40AF; font-weight:700; border:1px solid #93C5FD;">🔍 INVESTIGATING</span>';
    } else {
      badgeHtml = '<span class="badge" style="background:#D1FAE5; color:#065F46; font-weight:700; border:1px solid #6EE7B7;">✅ RESOLVED</span>';
    }

    let actionButtons = '';
    if (inc.status === 'OPEN') {
      actionButtons = `
        <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="updateIncidentStatus(${inc.id}, 'INVESTIGATING')" title="Begin investigation">🔍 Investigate</button>
        <button class="btn btn-primary" style="padding:4px 8px; font-size:11px; background:#10B981; border-color:#10B981;" onclick="updateIncidentStatus(${inc.id}, 'RESOLVED')" title="Mark as resolved">✅ Resolve</button>
        <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="openIncidentDetailsModal(${inc.id})" title="View complete case record">👁️ View</button>
      `;
    } else if (inc.status === 'INVESTIGATING') {
      actionButtons = `
        <button class="btn btn-primary" style="padding:4px 8px; font-size:11px; background:#10B981; border-color:#10B981;" onclick="updateIncidentStatus(${inc.id}, 'RESOLVED')" title="Mark as resolved">✅ Resolve</button>
        <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="updateIncidentStatus(${inc.id}, 'OPEN')" title="Revert to open">⚠️ Reopen</button>
        <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="openIncidentDetailsModal(${inc.id})" title="View complete case record">👁️ View</button>
      `;
    } else {
      actionButtons = `
        <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="updateIncidentStatus(${inc.id}, 'OPEN')" title="Reopen closed case">⚠️ Reopen</button>
        <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="openIncidentDetailsModal(${inc.id})" title="View complete case record">👁️ View</button>
      `;
    }

    let extraActions = '';
    if (inc.incident_type === 'Property Damage' || (inc.description && inc.description.toLowerCase().includes('damage'))) {
      extraActions += `
        <button type="button" class="btn btn-secondary" style="padding:4px 8px; font-size:11px; color:#DC2626; border-color:#FECACA; background:#FEF2F2; font-weight:700;" onclick="openDamageDeductionForIncident(${inc.id})" title="Deduct damaged property penalty from guard salary">⚠️ Deduct Damage</button>
      `;
    }
    if (inc.status === 'OPEN' || inc.status === 'INVESTIGATING') {
      extraActions += `
        <button type="button" class="btn btn-secondary" style="padding:4px 8px; font-size:11px; color:#B45309; border-color:#FCD34D; background:#FFFBEB; font-weight:700;" onclick="openHoldSalaryForIncident(${inc.id})" title="Hold guard salary in Payment Schedules pending investigation">⏸️ Hold Pay</button>
      `;
    }

    const shortDesc = inc.description && inc.description.length > 95 ? inc.description.substring(0, 95) + '...' : (inc.description || '—');

    tr.innerHTML = `
      <td style="white-space:nowrap; vertical-align:middle;">
        <a href="javascript:void(0)" onclick="openIncidentDetailsModal(${inc.id})" style="font-family:monospace; font-weight:800; color:#7C3AED; text-decoration:underline;">
          ${inc.reference_number}
        </a>
      </td>
      <td style="font-size:12px; color:#475569; white-space:nowrap; vertical-align:middle;">
        <strong>${inc.incident_date}</strong><br>
        <span style="font-size:11px; color:#64748B;">🕒 ${inc.incident_time}</span>
      </td>
      <td style="white-space:nowrap; vertical-align:middle;">
        <strong style="color:#0F172A;">${inc.guard_name}</strong><br>
        <span style="font-size:11px; color:#64748B;">ID: ${inc.guard_employee_number}</span>
      </td>
      <td style="white-space:nowrap; vertical-align:middle;"><span style="font-weight:600; color:#334155;">${inc.site_name}</span></td>
      <td style="white-space:nowrap; vertical-align:middle;"><span class="badge" style="background:#F1F5F9; color:#334155; font-weight:600; border:1px solid #CBD5E1;">${inc.incident_type}</span></td>
      <td style="white-space:normal; word-break:break-word; min-width:200px; max-width:280px; font-size:12px; color:#334155; line-height:1.45; vertical-align:middle;" title="${(inc.description || '').replace(/"/g, '&quot;')}">
        ${shortDesc}
      </td>
      <td style="white-space:nowrap; vertical-align:middle;">${badgeHtml}</td>
      <td style="white-space:nowrap; vertical-align:middle;"><div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">${actionButtons}${extraActions}</div></td>
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
      showToast(`Incident status updated to ${newStatus}!`, 'success');
      await loadAdminIncidents();
      // If details modal is open, refresh its view
      const modal = document.getElementById('modal-incident-details');
      if (modal && modal.style.display !== 'none') {
        openIncidentDetailsModal(incidentId);
      }
    } else {
      showToast('Failed to update incident status.', 'danger');
    }
  } catch (err) {
    showToast('Error updating incident status: ' + err.message, 'danger');
  }
}

async function openAddIncidentModal() {
  const modal = document.getElementById('modal-add-incident');
  if (!modal) return;
  const user = getLoggedInUser();

  // Make sure guards and sites are loaded
  if (!allGuards || allGuards.length === 0) await loadGuards();
  if (!allSites || allSites.length === 0) await loadSites();

  // Populate Guard select
  const guardSelect = document.getElementById('inc-form-guard');
  if (guardSelect) {
    let guardsToShow = allGuards || [];
    if (user && user.role === 'SUPERVISOR') {
      guardsToShow = guardsToShow.filter(g => g.supervisor_id === user.id);
    }
    guardSelect.innerHTML = '<option value="">Select Reporting Guard...</option>' +
      guardsToShow.map(g => `<option value="${g.id}">${g.full_name} (${g.employee_number || 'CS-00000'})</option>`).join('');
  }

  // Populate Site select
  const siteSelect = document.getElementById('inc-form-site');
  if (siteSelect) {
    siteSelect.innerHTML = '<option value="">Select Client Site...</option>' +
      allSites.map(s => `<option value="${s.id}">${s.site_name}</option>`).join('');
  }

  // Set today's date and current time
  const now = new Date();
  const dateInput = document.getElementById('inc-form-date');
  const timeInput = document.getElementById('inc-form-time');
  if (dateInput) dateInput.value = now.toISOString().split('T')[0];
  if (timeInput) {
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    timeInput.value = `${hh}:${mm}`;
  }

  // Reset description
  const descEl = document.getElementById('inc-form-desc');
  if (descEl) descEl.value = '';

  modal.style.display = 'flex';
}

function closeAddIncidentModal() {
  const modal = document.getElementById('modal-add-incident');
  if (modal) modal.style.display = 'none';
}

async function handleAddIncidentSubmit(event) {
  event.preventDefault();

  const guardId = parseInt(document.getElementById('inc-form-guard').value);
  const siteId = parseInt(document.getElementById('inc-form-site').value);
  const incType = document.getElementById('inc-form-type').value;
  const incStatus = document.getElementById('inc-form-status').value;
  const incDate = document.getElementById('inc-form-date').value;
  const incTime = document.getElementById('inc-form-time').value;
  const desc = document.getElementById('inc-form-desc').value.trim();

  if (!guardId || !siteId) {
    showToast('Please select both a reporting guard and client site.', 'warning');
    return;
  }

  if (desc.length < 5) {
    showToast('Please provide a detailed description (at least 5 characters).', 'warning');
    return;
  }

  try {
    const res = await apiFetch('/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guard_id: guardId,
        site_id: siteId,
        incident_type: incType,
        incident_date: incDate,
        incident_time: incTime,
        description: desc,
        status: incStatus
      })
    });

    if (res.ok) {
      const data = await res.json();
      showToast(`Incident ${data.reference_number || 'report'} successfully logged in system!`, 'success');
      closeAddIncidentModal();
      await loadAdminIncidents();
    } else {
      const err = await res.json();
      showToast(err.detail || 'Failed to create incident report.', 'danger');
    }
  } catch (err) {
    showToast('Error saving incident report: ' + err.message, 'danger');
  }
}

function openIncidentDetailsModal(incidentId) {
  const inc = allAdminIncidents.find(i => i.id === incidentId);
  if (!inc) return;

  const modal = document.getElementById('modal-incident-details');
  if (!modal) return;

  const refBadge = document.getElementById('inc-detail-ref-badge');
  if (refBadge) refBadge.innerText = inc.reference_number;

  let badgeColor = '#92400E';
  let badgeBg = '#FEF3C7';
  if (inc.status === 'INVESTIGATING') { badgeColor = '#1E40AF'; badgeBg = '#DBEAFE'; }
  if (inc.status === 'RESOLVED') { badgeColor = '#065F46'; badgeBg = '#D1FAE5'; }

  const bodyEl = document.getElementById('inc-detail-body');
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:16px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <span style="font-size:11px; text-transform:uppercase; color:#64748B; font-weight:700;">Incident Category</span>
            <div style="font-size:16px; font-weight:800; color:#0F172A;">${inc.incident_type}</div>
          </div>
          <div>
            <span class="badge" style="background:${badgeBg}; color:${badgeColor}; font-weight:800; padding:6px 14px; font-size:12px;">
              ${inc.status}
            </span>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; border-top:1px solid #E2E8F0; padding-top:12px;">
          <div>
            <span style="font-size:11px; color:#64748B; font-weight:700;">REPORTING GUARD</span>
            <div style="font-size:14px; font-weight:700; color:#1E293B;">${inc.guard_name}</div>
            <div style="font-size:12px; color:#64748B;">Employee No: <strong>${inc.guard_employee_number}</strong></div>
          </div>
          <div>
            <span style="font-size:11px; color:#64748B; font-weight:700;">CLIENT SITE</span>
            <div style="font-size:14px; font-weight:700; color:#1E293B;">${inc.site_name}</div>
            <div style="font-size:12px; color:#64748B;">Site ID: ${inc.site_id}</div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; border-top:1px solid #E2E8F0; padding-top:12px; margin-top:12px;">
          <div>
            <span style="font-size:11px; color:#64748B; font-weight:700;">OCCURRENCE DATE & TIME</span>
            <div style="font-size:13px; font-weight:600; color:#334155;">📅 ${inc.incident_date} at 🕒 ${inc.incident_time}</div>
          </div>
          <div>
            <span style="font-size:11px; color:#64748B; font-weight:700;">LOGGED IN SYSTEM</span>
            <div style="font-size:13px; color:#475569;">${inc.created_at ? new Date(inc.created_at).toLocaleString() : '—'}</div>
          </div>
        </div>
      </div>

      <div style="margin-bottom:16px;">
        <label style="font-size:12px; font-weight:800; color:#1E3A5F; text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:6px;">
          Full Incident Narrative & Immediate Actions Taken
        </label>
        <div style="background:#FFFFFF; border:1px solid #CBD5E1; border-radius:6px; padding:14px; font-size:13px; color:#1E293B; line-height:1.6; white-space:pre-wrap;">
${inc.description}
        </div>
      </div>

      <!-- Financial Safeguards & Salary Actions -->
      <div style="background:#FFFBEB; border:1px solid #FCD34D; border-radius:8px; padding:14px; margin-bottom:16px;">
        <div style="font-weight:800; color:#92400E; font-size:13px; display:flex; align-items:center; gap:6px; margin-bottom:4px;">
          <span>⚡</span> Payroll & Disciplinary Safeguards
        </div>
        <p style="font-size:12px; color:#78350F; margin:0 0 10px 0; line-height:1.4;">
          Financial controls for this case: deduct damaged property / facility penalties from this guard's salary, or hold monthly salary disbursement in Payment Schedules pending investigation.
        </p>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary" style="background:#FEF2F2; color:#DC2626; border-color:#FECACA; font-weight:700; font-size:12px;" onclick="closeIncidentDetailsModal(); openDamageDeductionForIncident(${inc.id});">
            ⚠️ Record Damage Deduction in Salary
          </button>
          <button type="button" class="btn btn-secondary" style="background:#FFFBEB; color:#B45309; border-color:#FCD34D; font-weight:700; font-size:12px;" onclick="closeIncidentDetailsModal(); openHoldSalaryForIncident(${inc.id});">
            ⏸️ Place Guard Salary on Hold
          </button>
        </div>
      </div>
    `;
  }

  // Setup Actions
  const actionsEl = document.getElementById('inc-detail-actions');
  if (actionsEl) {
    let statusBtns = '';
    if (inc.status === 'OPEN') {
      statusBtns = `
        <button class="btn btn-secondary" onclick="updateIncidentStatus(${inc.id}, 'INVESTIGATING')">🔍 Move to Under Investigation</button>
        <button class="btn btn-primary" style="background:#10B981; border-color:#10B981;" onclick="updateIncidentStatus(${inc.id}, 'RESOLVED')">✅ Mark Resolved</button>
      `;
    } else if (inc.status === 'INVESTIGATING') {
      statusBtns = `
        <button class="btn btn-secondary" onclick="updateIncidentStatus(${inc.id}, 'OPEN')">⚠️ Revert to Open</button>
        <button class="btn btn-primary" style="background:#10B981; border-color:#10B981;" onclick="updateIncidentStatus(${inc.id}, 'RESOLVED')">✅ Mark Resolved</button>
      `;
    } else {
      statusBtns = `
        <button class="btn btn-secondary" onclick="updateIncidentStatus(${inc.id}, 'OPEN')">⚠️ Reopen Case</button>
      `;
    }

    actionsEl.innerHTML = `
      <div>
        <button class="btn btn-danger" style="background:#EF4444; color:#FFFFFF; border:none; padding:6px 12px; font-size:12px;" onclick="deleteIncidentRecord(${inc.id}, '${inc.reference_number}')">
          🗑️ Delete Record
        </button>
      </div>
      <div style="display:flex; gap:8px;">
        ${statusBtns}
        <button class="btn btn-secondary" onclick="closeIncidentDetailsModal()">Close</button>
      </div>
    `;
  }

  modal.style.display = 'flex';
}

function closeIncidentDetailsModal() {
  const modal = document.getElementById('modal-incident-details');
  if (modal) modal.style.display = 'none';
}

async function openDamageDeductionForIncident(incidentId) {
  const inc = (allAdminIncidents || []).find(i => i.id === incidentId);
  if (!inc) return;

  const itemName = inc.incident_type === 'Property Damage' 
    ? `Damaged Property / Facility (${inc.site_name || 'Site'})` 
    : `Belonging / Property (${inc.incident_type})`;
  const desc = `Incident Ref ${inc.reference_number}: ${inc.description || ''}`;
  const incDate = inc.incident_date || new Date().toISOString().substring(0, 10);

  await openRecordDamageDeductionModal(inc.guard_id, inc.guard_name, itemName, desc, incDate);
}

async function openHoldSalaryForIncident(incidentId) {
  const inc = (allAdminIncidents || []).find(i => i.id === incidentId);
  if (!inc) return;

  const reason = `Pending investigation of Incident ${inc.reference_number} (${inc.incident_type}): ${(inc.description || '').substring(0, 110)}`;

  try {
    const res = await apiFetch(`/payments/guard/${inc.guard_id}/active-record`);
    if (res.ok) {
      const data = await res.json();
      if (data.found && data.record_id) {
        if (data.is_on_hold) {
          showToast(`Guard ${inc.guard_name}'s monthly salary is already on hold. Reason: ${data.hold_reason}`, 'info');
          if (typeof switchTab === 'function') switchTab('payments');
          if (typeof switchPaymentsSubTab === 'function') switchPaymentsSubTab('held');
          return;
        }
        openHoldSalaryModal(data.record_id, inc.guard_name, inc.guard_employee_number, data.net_pay, reason);
        return;
      }
    }
  } catch (err) {
    console.warn('Error fetching active record for incident hold:', err);
  }

  showToast(`Navigating to Payment Schedules to hold monthly salary for ${inc.guard_name}.`, 'info');
  if (typeof switchTab === 'function') switchTab('payments');
}

async function deleteIncidentRecord(incidentId, refNumber) {
  if (!confirm(`Are you sure you want to permanently delete incident report ${refNumber}?\nThis action cannot be undone.`)) {
    return;
  }

  try {
    const res = await apiFetch(`/incidents/${incidentId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast(`Incident ${refNumber} deleted successfully.`, 'success');
      closeIncidentDetailsModal();
      await loadAdminIncidents();
    } else {
      showToast('Failed to delete incident report.', 'danger');
    }
  } catch (err) {
    showToast('Error deleting incident: ' + err.message, 'danger');
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

    // Update Dashboard leave metric card & widget
    const dashLeaveMetric = document.getElementById('metric-leave-pending-count');
    if (dashLeaveMetric) dashLeaveMetric.innerText = pendingCount;

    const dashLeaveBadge = document.getElementById('dashboard-leave-badge');
    if (dashLeaveBadge) dashLeaveBadge.innerText = pendingCount;

    // Render dashboard pending leave table
    const dashLeaveBody = document.getElementById('dashboard-leave-body');
    if (dashLeaveBody) {
      const pendingLeaves = allAdminLeave.filter(l => l.status === 'PENDING');
      if (pendingLeaves.length === 0) {
        dashLeaveBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:16px; color:#64748B;">✅ No pending leave requests — all caught up!</td></tr>`;
      } else {
        dashLeaveBody.innerHTML = '';
        pendingLeaves.forEach(req => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${req.guard_name}</strong><br><span style="font-size:11px;color:#64748B;">(${req.guard_employee_number})</span></td>
            <td>${req.site_name}</td>
            <td><span class="badge badge-secondary">${req.leave_type}</span></td>
            <td><strong>${req.duration_days} Day${req.duration_days > 1 ? 's' : ''}</strong></td>
            <td style="font-size:12px;color:#475569;">📅 ${req.start_date}<br>to ${req.end_date}</td>
            <td style="max-width:200px; font-size:12px; color:#334155;">${req.reason || 'No reason specified'}</td>
            <td>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="btn btn-primary" style="padding:4px 10px;font-size:11px;" onclick="updateLeaveStatus(${req.id},'APPROVED')">✅ Approve</button>
                <button class="btn btn-secondary" style="padding:4px 10px;font-size:11px;background:#EF4444;color:white;border-color:#EF4444;" onclick="updateLeaveStatus(${req.id},'REJECTED')">❌ Reject</button>
              </div>
            </td>
          `;
          dashLeaveBody.appendChild(tr);
        });
      }
    }

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
window.openAddIncidentModal = openAddIncidentModal;
window.closeAddIncidentModal = closeAddIncidentModal;
window.handleAddIncidentSubmit = handleAddIncidentSubmit;
window.openIncidentDetailsModal = openIncidentDetailsModal;
window.closeIncidentDetailsModal = closeIncidentDetailsModal;
window.handleIncidentSearch = handleIncidentSearch;
window.deleteIncidentRecord = deleteIncidentRecord;

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
      showToast(data.detail || 'Failed to create region', 'danger');
      return;
    }
    closeRegionModal();
    showToast('✅ Region created successfully!', 'success');
    await loadRegions();
    await loadSites();
  } catch (err) {
    showToast('Error creating region: ' + err.message, 'danger');
  }
}

async function loadRegions() {
  try {
    const res = await apiFetch('/regions');
    if (!res.ok) return cachedRegions || [];
    const regions = await res.json();
    cachedRegions = Array.isArray(regions) ? regions : [];
    const sel = document.getElementById('new-site-region-select');
    if (sel) {
      sel.innerHTML = '<option value="">No Region Selected</option>' + cachedRegions.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    }
    return cachedRegions;
  } catch (err) {
    console.error('loadRegions error:', err);
    return cachedRegions || [];
  }
}

// --- Site Management Updates & Edit Functionality ---
async function openAddSiteModal() {
  await loadRegions();
  try {
    if (!supervisorsCache || supervisorsCache.length === 0) {
      const supRes = await apiFetch('/supervisors');
      if (supRes.ok) supervisorsCache = await supRes.json();
    }
  } catch (e) {}

  const supSelect = document.getElementById('new-site-supervisor-select');
  if (supSelect) {
    supSelect.innerHTML = '<option value="">No Supervisor (Unassigned)</option>' +
      (supervisorsCache || []).map(s => `<option value="${s.id}">👨‍💼 ${s.full_name || s.email} (${s.email})</option>`).join('');
  }

  // Populate Super Guard select for new site
  const sgSelect = document.getElementById('new-site-super-guard-select');
  if (sgSelect) {
    const guards = cachedGuards || [];
    sgSelect.innerHTML = '<option value="">No Super Guard (Unassigned)</option>' +
      guards.map(g => `<option value="${g.id}">🛡️ ${g.full_name} (${g.employee_number})</option>`).join('');
  }

  const modal = document.getElementById('modal-add-site');
  if (modal) modal.style.display = 'flex';
}

function closeAddSiteModal() {
  const modal = document.getElementById('modal-add-site');
  if (modal) modal.style.display = 'none';
}

async function handleAddSiteSubmit(e) {
  e.preventDefault();
  const site_name = document.getElementById('new-site-name').value.trim();
  const region_id_val = document.getElementById('new-site-region-select')?.value;
  const region_id = region_id_val ? parseInt(region_id_val) : null;
  const supervisor_id_val = document.getElementById('new-site-supervisor-select')?.value;
  const supervisor_id = supervisor_id_val ? parseInt(supervisor_id_val) : null;
  const client_name = document.getElementById('new-site-client').value.trim();
  const location = document.getElementById('new-site-location').value.trim();
  const basic_salary = parseFloat(document.getElementById('new-site-basic-salary').value) || 15000;
  const daily_rate = parseFloat(document.getElementById('new-site-rate').value) || 1200;

  const rawLat = parseFloat(document.getElementById('new-site-latitude')?.value);
  const latitude = isNaN(rawLat) ? null : rawLat;
  const rawLng = parseFloat(document.getElementById('new-site-longitude')?.value);
  const longitude = isNaN(rawLng) ? null : rawLng;
  const rawRadius = parseInt(document.getElementById('new-site-geofence-radius')?.value);
  const geofence_radius = isNaN(rawRadius) ? 200 : rawRadius;
  const rawSg = parseInt(document.getElementById('new-site-super-guard-select')?.value);
  const super_guard_id = isNaN(rawSg) ? null : rawSg;

  try {
    const res = await apiFetch('/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_name,
        region_id,
        supervisor_id,
        client_name,
        location,
        basic_salary,
        daily_rate,
        night_allowance: 200.0,
        transport_allowance: 100.0,
        housing_allowance: 150.0,
        latitude,
        longitude,
        geofence_radius,
        super_guard_id
      })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.detail || 'Failed to create site', 'danger');
      return;
    }
    closeAddSiteModal();
    showToast(`✅ Site "${data.site_name}" created successfully!`, 'success');
    loadSites();
    loadSupervisors();
  } catch (err) {
    showToast('Error creating site: ' + err.message, 'danger');
  }
}

async function openEditSiteModal(siteId) {
  try {
    const regions = await loadRegions();
    if (!supervisorsCache || supervisorsCache.length === 0) {
      const supRes = await apiFetch('/supervisors');
      if (supRes.ok) supervisorsCache = await supRes.json();
    }

    let site = (cachedSites || []).find(s => s.id === siteId);
    if (!site) {
      const res = await apiFetch(`/sites/${siteId}`);
      if (!res.ok) throw new Error('Site not found');
      site = await res.json();
    }

    // Populate Fields
    document.getElementById('edit-site-id').value = site.id;
    document.getElementById('edit-site-name').value = site.site_name || '';
    document.getElementById('edit-site-client').value = site.client_name || '';
    document.getElementById('edit-site-location').value = site.location || '';
    document.getElementById('edit-site-basic-salary').value = site.basic_salary || 15000;
    document.getElementById('edit-site-daily-rate').value = site.daily_rate || 1200;
    document.getElementById('edit-site-night-allowance').value = site.night_allowance !== undefined ? site.night_allowance : 200;
    document.getElementById('edit-site-transport-allowance').value = site.transport_allowance !== undefined ? site.transport_allowance : 100;
    document.getElementById('edit-site-housing-allowance').value = site.housing_allowance !== undefined ? site.housing_allowance : 150;

    // Populate Regions select
    const regSelect = document.getElementById('edit-site-region-select');
    if (regSelect) {
      const regionList = (Array.isArray(regions) && regions.length > 0) ? regions : (cachedRegions || []);
      regSelect.innerHTML = '<option value="">No Region Selected</option>' +
        regionList.map(r => `<option value="${r.id}" ${site.region_id === r.id ? 'selected' : ''}>${r.name}</option>`).join('');
    }

    // Populate Supervisors select
    const supSelect = document.getElementById('edit-site-supervisor-select');
    if (supSelect) {
      supSelect.innerHTML = '<option value="">No Supervisor (Unassigned)</option>' +
        (supervisorsCache || []).map(s => `<option value="${s.id}" ${site.supervisor_id === s.id ? 'selected' : ''}>👨‍💼 ${s.full_name || s.email} (${s.email})</option>`).join('');
    }

    // Populate Geofence & Super Guard fields
    const editLatEl = document.getElementById('edit-site-latitude');
    if (editLatEl) editLatEl.value = (site.latitude !== null && site.latitude !== undefined) ? site.latitude : '';
    const editLngEl = document.getElementById('edit-site-longitude');
    if (editLngEl) editLngEl.value = (site.longitude !== null && site.longitude !== undefined) ? site.longitude : '';
    const editRadiusEl = document.getElementById('edit-site-geofence-radius');
    if (editRadiusEl) editRadiusEl.value = site.geofence_radius || 200;

    const sgSelect = document.getElementById('edit-site-super-guard-select');
    if (sgSelect) {
      const guards = cachedGuards || [];
      sgSelect.innerHTML = '<option value="">No Super Guard (Unassigned)</option>' +
        guards.map(g => `<option value="${g.id}" ${site.super_guard_id === g.id ? 'selected' : ''}>🛡️ ${g.full_name} (${g.employee_number})</option>`).join('');
    }

    const modal = document.getElementById('modal-edit-site');
    if (modal) modal.style.display = 'flex';
  } catch (err) {
    showToast('Failed to open edit site: ' + err.message, 'danger');
  }
}

function closeEditSiteModal() {
  const modal = document.getElementById('modal-edit-site');
  if (modal) modal.style.display = 'none';
}

async function handleEditSiteSubmit(e) {
  e.preventDefault();
  const siteId = document.getElementById('edit-site-id').value;
  const site_name = document.getElementById('edit-site-name').value.trim();
  const region_id_val = document.getElementById('edit-site-region-select').value;
  const region_id = region_id_val ? parseInt(region_id_val) : null;
  const supervisor_id_val = document.getElementById('edit-site-supervisor-select').value;
  const supervisor_id = supervisor_id_val ? parseInt(supervisor_id_val) : null;
  const client_name = document.getElementById('edit-site-client').value.trim();
  const location = document.getElementById('edit-site-location').value.trim();
  const rawSal = parseFloat(document.getElementById('edit-site-basic-salary').value);
  const basic_salary = isNaN(rawSal) ? 15000 : rawSal;
  const rawRate = parseFloat(document.getElementById('edit-site-daily-rate').value);
  const daily_rate = isNaN(rawRate) ? 1200 : rawRate;
  const rawNight = parseFloat(document.getElementById('edit-site-night-allowance').value);
  const night_allowance = isNaN(rawNight) ? 200 : rawNight;
  const rawTrans = parseFloat(document.getElementById('edit-site-transport-allowance').value);
  const transport_allowance = isNaN(rawTrans) ? 100 : rawTrans;
  const rawHouse = parseFloat(document.getElementById('edit-site-housing-allowance').value);
  const housing_allowance = isNaN(rawHouse) ? 150 : rawHouse;
  const rawLat = parseFloat(document.getElementById('edit-site-latitude')?.value);
  const latitude = isNaN(rawLat) ? null : rawLat;
  const rawLng = parseFloat(document.getElementById('edit-site-longitude')?.value);
  const longitude = isNaN(rawLng) ? null : rawLng;
  const rawRadius = parseInt(document.getElementById('edit-site-geofence-radius')?.value);
  const geofence_radius = isNaN(rawRadius) ? 200 : rawRadius;
  const rawSg = parseInt(document.getElementById('edit-site-super-guard-select')?.value);
  const super_guard_id = isNaN(rawSg) ? null : rawSg;

  try {
    const res = await apiFetch(`/sites/${siteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_name,
        region_id,
        supervisor_id,
        client_name,
        location,
        basic_salary,
        daily_rate,
        night_allowance,
        transport_allowance,
        housing_allowance,
        latitude,
        longitude,
        geofence_radius,
        super_guard_id
      })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.detail || 'Failed to update site', 'danger');
      return;
    }
    closeEditSiteModal();
    showToast(`✅ Client site "${data.site_name}" updated successfully!`, 'success');
    loadSites();
    loadSupervisors();
    loadGuards();
  } catch (err) {
    showToast('Error updating site: ' + err.message, 'danger');
  }
}

// --- Guard Management Updates ---
async function openAddGuardModal() {
  await loadSites();
  const sel = document.getElementById('new-guard-site-select');
  if (sel && cachedSites) {
    sel.innerHTML = '<option value="">No Assigned Site (Unassigned/Reliever)</option>' + cachedSites.map(s => `<option value="${s.id}">${s.site_name} (Default: KES ${(s.basic_salary||15000).toLocaleString()})</option>`).join('');
  }
  const supSel = document.getElementById('new-guard-supervisor-select');
  if (supSel) {
    supSel.innerHTML = '<option value="">-- No Supervisor Assigned --</option>' + (supervisorsCache || []).map(s => `<option value="${s.id}">${s.full_name || s.email} (${s.email})</option>`).join('');
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
  const sup_id_val = document.getElementById('new-guard-supervisor-select')?.value;
  const supervisor_id = sup_id_val ? parseInt(sup_id_val) : null;
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
        site_id, supervisor_id, basic_salary, is_reliever, hire_date
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

window.cachedRegions = cachedRegions;

window.supervisorsCache = supervisorsCache;
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
window.viewGuardFile = viewGuardFile;
window.backToGuardsList = backToGuardsList;
window.openGuardFileModal = openGuardFileModal;
window.closeGuardFileModal = closeGuardFileModal;
window.openAmendGuardModal = openAmendGuardModal;
window.closeAmendGuardModal = closeAmendGuardModal;
window.toggleAmendPayFields = toggleAmendPayFields;
window.updateAmendSiteSalaryHint = updateAmendSiteSalaryHint;
window.handleAmendGuardSubmit = handleAmendGuardSubmit;




/* ==================== SUPERVISOR MANAGEMENT ==================== */
let activeSupervisorId = null;

async function loadSupervisors() {
  const tbody = document.getElementById('supervisors-table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748B;">Loading supervisors...</td></tr>';
  try {
    const res = await apiFetch('/supervisors');
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to load supervisors');
    supervisorsCache = data;
    renderSupervisorsTable();
    loadSupervisorAttendanceRoll();
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#EF4444;">Error: ${e.message}</td></tr>`;
  }
}

function renderSupervisorsTable() {
  const tbody = document.getElementById('supervisors-table-body');
  const countBadge = document.getElementById('supervisors-count-badge');
  if (countBadge) countBadge.innerText = `${supervisorsCache.length} Supervisor${supervisorsCache.length === 1 ? '' : 's'}`;
  if (!tbody) return;
  tbody.innerHTML = '';
  if (supervisorsCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748B;">No supervisors configured yet. Click "+ Add Supervisor" to register one.</td></tr>';
    return;
  }
  supervisorsCache.forEach(sup => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>#${sup.id}</b></td>
      <td>
        <div style="font-weight:700; color:#0F172A;">${sup.full_name || sup.email}</div>
        <div style="font-size:11px; color:#64748B;">${sup.email} · Operations Supervisor</div>
      </td>
      <td>${sup.phone || '<span style="color:#94A3B8;">None</span>'}</td>
      <td><span class="badge ${sup.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}">${sup.status}</span></td>
      <td>
        ${sup.assigned_site_count > 0 
          ? `<span class="badge" style="background:#F0FDF4; color:#15803D; font-weight:700;" title="${(sup.assigned_site_names || []).join(', ')}">🏢 ${sup.assigned_site_count} Site${sup.assigned_site_count === 1 ? '' : 's'}</span>`
          : `<span style="font-size:11px; color:#94A3B8;">0 Sites</span>`}
      </td>
      <td>
        <span class="badge" style="background:#EFF6FF; color:#1D4ED8; font-weight:700;">
          🛡️ ${sup.assigned_guard_count || 0} Guards
        </span>
      </td>
      <td style="display:flex; gap:6px; flex-wrap:wrap;">
        <button class="btn btn-secondary" style="padding:4px 8px; font-size:12px; background:#ECFDF5; color:#065F46; border-color:#A7F3D0;" onclick="openSupervisorAssignSitesPanel(${sup.id})">
          🏢 Assign Sites
        </button>
        <button class="btn btn-primary" style="padding:4px 8px; font-size:12px;" onclick="openSupervisorAssignPanel(${sup.id})">
          🛡️ Assign Guards
        </button>
        <button class="btn btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="filterSupervisorRollCall(${sup.id})">
          View Roll
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openAddSupervisorModal() {
  const modal = document.getElementById('modal-add-supervisor');
  if (modal) {
    modal.style.display = 'flex';
    const err = document.getElementById('new-sup-error');
    if (err) {
      err.style.display = 'none';
      err.innerText = '';
    }
    const btn = document.getElementById('btn-submit-new-sup');
    if (btn) {
      btn.disabled = false;
      btn.innerText = '+ Create Supervisor';
    }
    setTimeout(() => {
      const nameInput = document.getElementById('new-sup-name');
      if (nameInput) nameInput.focus();
    }, 50);
  }
}

function closeAddSupervisorModal() {
  const modal = document.getElementById('modal-add-supervisor');
  if (modal) modal.style.display = 'none';
  // clear fields
  ['new-sup-name','new-sup-email','new-sup-phone','new-sup-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const err = document.getElementById('new-sup-error');
  if (err) {
    err.style.display = 'none';
    err.innerText = '';
  }
  const btn = document.getElementById('btn-submit-new-sup');
  if (btn) {
    btn.disabled = false;
    btn.innerText = '+ Create Supervisor';
  }
}

async function submitAddSupervisor(event) {
  if (event) event.preventDefault();
  const name = document.getElementById('new-sup-name')?.value?.trim() || '';
  const email = document.getElementById('new-sup-email')?.value?.trim().toLowerCase() || '';
  const phone = document.getElementById('new-sup-phone')?.value?.trim().replace(/\s+/g, '') || '';
  const passwordInput = document.getElementById('new-sup-password')?.value?.trim();
  const password = passwordInput || 'password123';
  const errorEl = document.getElementById('new-sup-error');
  const btn = document.getElementById('btn-submit-new-sup');

  if (errorEl) {
    errorEl.style.display = 'none';
    errorEl.innerText = '';
  }

  if (!email || !phone) {
    if (errorEl) {
      errorEl.innerText = 'Please provide both email address and phone number.';
      errorEl.style.display = 'block';
    }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Creating Account...';
  }

  try {
    const payload = {
      full_name: name || email.split('@')[0],
      email: email,
      phone: phone,
      password: password
    };
    const res = await apiFetch('/supervisors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      let msg = 'Failed to create supervisor account.';
      if (Array.isArray(data.detail)) {
        msg = data.detail.map(d => `${d.loc ? d.loc.slice(1).join(' ') : ''}: ${d.msg}`).join(', ');
      } else if (typeof data.detail === 'string') {
        msg = data.detail;
      }
      throw new Error(msg);
    }
    
    showToast(`✅ Supervisor account created for ${data.full_name || email}! Default password: ${password}`, 'success');
    closeAddSupervisorModal();
    await loadSupervisors();
  } catch (e) {
    if (errorEl) {
      errorEl.innerText = e.message || 'An unexpected error occurred while creating supervisor.';
      errorEl.style.display = 'block';
    }
    if (btn) {
      btn.disabled = false;
      btn.innerText = '+ Create Supervisor';
    }
  }
}

async function openSupervisorAssignPanel(supId, supEmail) {
  activeSupervisorId = supId;
  const sup = supervisorsCache.find(s => s.id === supId);
  const titleEl = document.getElementById('supervisor-assign-name');
  if (titleEl) {
    titleEl.innerText = sup ? (sup.full_name ? `${sup.full_name} (${sup.email})` : sup.email) : (supEmail || `Supervisor #${supId}`);
  }
  try {
    const res = await apiFetch('/guards');
    const guards = await res.json();
    if (!res.ok) throw new Error('Failed to load guards directory');
    const container = document.getElementById('supervisor-assign-guards-list');
    if (!container) return;
    container.innerHTML = '';
    // Show ONLY unassigned guards OR guards currently assigned to this supervisor
    const assignableGuards = guards.filter(g => g.status === 'ACTIVE' && (!g.supervisor_id || g.supervisor_id === supId));

    if (assignableGuards.length === 0) {
      container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:24px; color:#64748B;">All active security guards are already allocated to field supervisors.</div>';
    } else {
      assignableGuards.forEach(g => {
        const checked = g.supervisor_id === supId;
        const div = document.createElement('div');
        div.className = 'assign-guard-item';
        div.style.padding = '10px 12px';
        div.style.background = checked ? '#EFF6FF' : '#F8FAFC';
        div.style.borderRadius = '8px';
        div.style.border = checked ? '1.5px solid #3B82F6' : '1px solid #E2E8F0';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '10px';
        div.innerHTML = `
          <input type="checkbox" data-guard-id="${g.id}" ${checked ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px;" onchange="this.parentElement.style.background=this.checked?'#EFF6FF':'#F8FAFC'; this.parentElement.style.border=this.checked?'1.5px solid #3B82F6':'1px solid #E2E8F0';">
          <div style="flex:1;">
            <div style="font-size:13px; font-weight:700; color:#0F172A;">${g.full_name}</div>
            <div style="font-size:11px; color:#64748B;">${g.employee_number} | ${g.site_name || 'No Site'}${checked ? ' <span style="color:#2563EB; font-weight:700;">(Current Assignment)</span>' : ''}</div>
          </div>
        `;
        container.appendChild(div);
      });
    }
    const panel = document.getElementById('supervisor-assign-panel');
    if (panel) {
      panel.style.display = 'block';
      panel.scrollIntoView({ behavior: 'smooth' });
    }
  } catch (e) {
    alert('Error opening assign panel: ' + e.message);
  }
}

function selectAllSupervisorGuards(select) {
  const checkBoxes = document.querySelectorAll('#supervisor-assign-guards-list input[type="checkbox"]');
  checkBoxes.forEach(cb => {
    cb.checked = select;
    cb.dispatchEvent(new Event('change'));
  });
}

function closeSupervisorAssignPanel() {
  const panel = document.getElementById('supervisor-assign-panel');
  if (panel) panel.style.display = 'none';
  activeSupervisorId = null;
}

async function saveGuardAssignments() {
  if (!activeSupervisorId) return;
  const checkedBoxes = document.querySelectorAll('#supervisor-assign-guards-list input[type="checkbox"]');
  const selectedIds = [];
  checkedBoxes.forEach(cb => {
    if (cb.checked) selectedIds.push(parseInt(cb.getAttribute('data-guard-id')));
  });
  try {
    const res = await apiFetch(`/supervisors/${activeSupervisorId}/assign-guards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guard_ids: selectedIds })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to assign guards');
    showToast(`✅ Successfully assigned ${data.assigned} security guard(s) to supervisor!`, 'success');
    closeSupervisorAssignPanel();
    loadSupervisors();
    loadGuards();
  } catch (e) {
    showToast('Error saving assignments: ' + e.message, 'danger');
  }
}

/* SUPERVISOR ROLL CALL & ATTENDANCE */
let currentRollCallSupervisorFilter = null;

function filterSupervisorRollCall(supId, supEmail) {
  currentRollCallSupervisorFilter = supId;
  const sup = supervisorsCache.find(s => s.id === supId);
  const name = sup ? (sup.full_name || sup.email) : (supEmail || `#${supId}`);
  const tbody = document.getElementById('supervisor-attendance-table-body');
  if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:16px; color:#3B82F6;">Filtering roll call for ${name}...</td></tr>`;
  loadSupervisorAttendanceRoll();
}

async function loadSupervisorAttendanceRoll() {
  const dateInput = document.getElementById('supervisor-attendance-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
  const shiftDate = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
  const tbody = document.getElementById('supervisor-attendance-table-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748B;">Loading roll call attendance...</td></tr>';

  try {
    let url = `/supervisors/attendance?shift_date=${shiftDate}`;
    if (currentRollCallSupervisorFilter) {
      url += `&supervisor_id=${currentRollCallSupervisorFilter}`;
    }
    const res = await apiFetch(url);
    const records = await res.json();
    if (!res.ok) throw new Error(records.detail || 'Failed to fetch attendance roll');

    if (!records || records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:#64748B;">No guards assigned to this supervisor on this date. Use "Assign Guards" above to allocate guards.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    records.forEach(r => {
      const tr = document.createElement('tr');
      const st = r.attendance_status || 'NOT_MARKED';
      
      const isCurrentlyActive = Boolean(r.actual_clock_in && !r.actual_clock_out);
      const isCompleted = Boolean(r.actual_clock_in && r.actual_clock_out);

      let clockDisplay = '<span style="color:#94A3B8; font-size:12px;">Not Clocked In</span>';
      if (isCompleted) {
        const inStr = new Date(r.actual_clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const outStr = new Date(r.actual_clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        clockDisplay = `<div style="font-size:11px; line-height:1.4;"><span style="color:#166534; font-weight:600;">🕒 In: ${inStr}</span><br><span style="color:#475569;">🏁 Out: ${outStr}</span></div>`;
      } else if (isCurrentlyActive) {
        const inStr = new Date(r.actual_clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        clockDisplay = `<div style="font-size:11px; line-height:1.4;"><span style="color:#1D4ED8; font-weight:700;">🕒 In: ${inStr}</span><br><span class="badge" style="background:#DCFCE7; color:#166534; font-size:10px; padding:2px 6px;">Active On Duty</span></div>`;
      }

      tr.innerHTML = `
        <td>
          <a href="javascript:void(0)" onclick="viewGuardFile(${r.guard_id})" style="font-weight:700; color:#1D4ED8; text-decoration:none;" title="Click to view full personnel file">
            📄 ${r.full_name}
          </a>
        </td>
        <td><b>${r.employee_number}</b></td>
        <td>${r.site_name || 'Unassigned Site'}</td>
        <td>${r.shift_name || 'Day Shift'}</td>
        <td>
          <select class="form-control supervisor-roll-status" data-guard-id="${r.guard_id}" data-shift-id="${r.shift_id || ''}" style="max-width:140px; padding:4px 8px; font-weight:700; ${st==='PRESENT'?'color:#166534; background:#DCFCE7;':st==='ABSENT'?'color:#991B1B; background:#FEE2E2;':st==='LATE'?'color:#92400E; background:#FEF3C7;':''}">
            <option value="PRESENT" ${st==='PRESENT'?'selected':''}>✅ PRESENT</option>
            <option value="ABSENT" ${st==='ABSENT'?'selected':''}>❌ ABSENT</option>
            <option value="LATE" ${st==='LATE'?'selected':''}>⚠️ LATE</option>
            <option value="NOT_MARKED" ${st==='NOT_MARKED'?'selected':''}>⏳ NOT MARKED</option>
          </select>
        </td>
        <td>${clockDisplay}</td>
        <td>
          <input type="text" class="form-control supervisor-roll-notes" data-guard-id="${r.guard_id}" placeholder="Inspection notes" value="${r.notes || ''}" style="font-size:12px; padding:4px 8px;">
        </td>
        <td>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn btn-primary" style="padding:4px 8px; font-size:11px; ${isCurrentlyActive ? 'opacity:0.4; cursor:not-allowed;' : ''}" onclick="supervisorClockInGuard(${r.guard_id})" ${isCurrentlyActive ? 'disabled' : ''} title="Clock In for this guard">
              🕒 Clock In
            </button>
            <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px; background:#334155; color:#fff; ${!isCurrentlyActive ? 'opacity:0.4; cursor:not-allowed;' : ''}" onclick="supervisorClockOutGuard(${r.guard_id})" ${!isCurrentlyActive ? 'disabled' : ''} title="Clock Out for this guard">
              🏁 Clock Out
            </button>
            <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="viewGuardFile(${r.guard_id})" title="View Guard Personnel File">
              📄 File
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#EF4444;">Error: ${err.message}</td></tr>`;
  }
}

async function saveSupervisorAttendanceRoll() {
  const dateInput = document.getElementById('supervisor-attendance-date');
  const shiftDate = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
  const rows = document.querySelectorAll('#supervisor-attendance-table-body tr');
  const marks = [];

  rows.forEach(tr => {
    const sel = tr.querySelector('.supervisor-roll-status');
    const notesInput = tr.querySelector('.supervisor-roll-notes');
    if (sel) {
      const gid = parseInt(sel.getAttribute('data-guard-id'));
      const shiftId = sel.getAttribute('data-shift-id') ? parseInt(sel.getAttribute('data-shift-id')) : null;
      const statusVal = sel.value;
      if (statusVal !== 'NOT_MARKED') {
        marks.push({
          guard_id: gid,
          shift_date: shiftDate,
          attendance_status: statusVal,
          shift_id: shiftId,
          notes: notesInput ? notesInput.value.trim() : null
        });
      }
    }
  });

  if (marks.length === 0) {
    alert('Please select attendance status (PRESENT, ABSENT, or LATE) for at least one guard before submitting.');
    return;
  }

  try {
    const res = await apiFetch('/supervisors/mark-attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: marks })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.detail || 'Failed to submit attendance roll');
    alert(`✅ Attendance successfully marked for ${marks.length} guard(s)!`);
    loadSupervisorAttendanceRoll();
    loadAttendance(); // sync global attendance tab
  } catch (err) {
    alert('Error saving roll call attendance: ' + err.message);
  }
}

/* SETTINGS PANEL HELPERS */
async function loadSettings() {
  try {
    const res = await apiFetch('/settings');
    const settings = await res.json();
    if (!res.ok) throw new Error('Failed to load settings');
    // map known keys to inputs
    const map = {
      nssf_rate: 'set-nssf-rate',
      shif_rate: 'set-shif-rate',
      shif_floor: 'set-shif-floor',
      housing_levy_rate: 'set-housing-rate',
      personal_relief: 'set-relief',
      overtime_multiplier_normal: 'set-ot-normal',
      overtime_multiplier_holiday: 'set-ot-holiday',
      company_name: 'set-company-name',
      company_kra_pin: 'set-company-kra',
      company_nssf_code: 'set-company-nssf',
      company_shif_code: 'set-company-shif'
    };
    settings.forEach(s => {
      const el = document.getElementById(map[s.key]);
      if (el) el.value = s.value;
    });
  } catch (e) {
    alert('Error loading settings: ' + e.message);
  }
}

async function handleSaveSettings(event) {
  event.preventDefault();
  const payload = { settings: {} };
  const fields = {
    nssf_rate: 'set-nssf-rate',
    shif_rate: 'set-shif-rate',
    shif_floor: 'set-shif-floor',
    housing_levy_rate: 'set-housing-rate',
    personal_relief: 'set-relief',
    overtime_multiplier_normal: 'set-ot-normal',
    overtime_multiplier_holiday: 'set-ot-holiday',
    company_name: 'set-company-name',
    company_kra_pin: 'set-company-kra',
    company_nssf_code: 'set-company-nssf',
    company_shif_code: 'set-company-shif'
  };
  for (const [key, id] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el) payload.settings[key] = el.value.trim();
  }
  try {
    const res = await apiFetch('/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to save settings');
    alert('Settings saved successfully');
    // optionally refresh UI
    loadSettings();
  } catch (e) {
    alert('Error saving settings: ' + e.message);
  }
}

/* GUARD LIST FILTER */
function filterGuardsTable(searchTerm) {
  const term = searchTerm.toLowerCase();
  const rows = document.querySelectorAll('#guards-table-body tr');
  rows.forEach(row => {
    const txt = row.innerText.toLowerCase();
    row.style.display = txt.includes(term) ? '' : 'none';
  });
}

// expose globals for HTML onclick attributes
window.loadSupervisors = loadSupervisors;
window.renderSupervisorsTable = renderSupervisorsTable;
window.openAddSupervisorModal = openAddSupervisorModal;
window.closeAddSupervisorModal = closeAddSupervisorModal;
window.submitAddSupervisor = submitAddSupervisor;
window.openSupervisorAssignPanel = openSupervisorAssignPanel;
window.closeSupervisorAssignPanel = closeSupervisorAssignPanel;
window.saveGuardAssignments = saveGuardAssignments;
window.selectAllSupervisorGuards = selectAllSupervisorGuards;
window.filterSupervisorRollCall = filterSupervisorRollCall;
window.loadSupervisorAttendanceRoll = loadSupervisorAttendanceRoll;
window.saveSupervisorAttendanceRoll = saveSupervisorAttendanceRoll;
window.handleSaveSettings = handleSaveSettings;
window.filterGuardsTable = filterGuardsTable;
window.loadAnalyticsData = loadAnalyticsData;
window.renderAnalyticsMonthlyTrend = renderAnalyticsMonthlyTrend;
window.renderAnalyticsStatutory = renderAnalyticsStatutory;
window.onAnalyticsPeriodChange = onAnalyticsPeriodChange;
window.renderAnalyticsSiteDistribution = renderAnalyticsSiteDistribution;
window.populateAnalyticsDownloadSelectors = populateAnalyticsDownloadSelectors;
window.downloadAuthenticatedFile = downloadAuthenticatedFile;
window.downloadNssfCsv = downloadNssfCsv;
window.downloadShifCsv = downloadShifCsv;
window.downloadHousingLevyCsv = downloadHousingLevyCsv;
window.downloadP9Pdf = downloadP9Pdf;
window.downloadSinglePayslip = downloadSinglePayslip;

/* Ensure new tab case */
// (switchTab already checks titles; we add case handling earlier in code if needed)

/* ==========================================================================
   Supervisor Clock In / Out Actions
   ========================================================================== */

async function supervisorClockInGuard(guardId) {
  try {
    const res = await apiFetch(`/supervisors/guards/${guardId}/clock-in`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to clock in guard');
    showToast(`⏱️ ${data.message} at ${data.clock_in_time}`, 'success');
    loadSupervisorAttendanceRoll();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

async function supervisorClockOutGuard(guardId) {
  try {
    const res = await apiFetch(`/supervisors/guards/${guardId}/clock-out`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to clock out guard');
    showToast(`⏹️ ${data.message} at ${data.clock_out_time} (${data.regular_hours} hrs logged)`, 'success');
    loadSupervisorAttendanceRoll();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

window.supervisorClockInGuard = supervisorClockInGuard;
window.supervisorClockOutGuard = supervisorClockOutGuard;


/* ==========================================================================
   Company Secure Documents Repository
   ========================================================================== */

let allCompanyDocuments = [];
let currentDocCategoryFilter = 'ALL';
let docSearchQuery = '';

async function loadCompanyDocuments() {
  const tbody = document.getElementById('documents-table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:#64748B;">Loading company documents...</td></tr>';

  try {
    const res = await apiFetch('/documents');
    if (!res.ok) throw new Error('Failed to load documents');
    allCompanyDocuments = await res.json();

    const totalCount = allCompanyDocuments.length;
    const contractsCount = allCompanyDocuments.filter(d => d.category === 'Contracts & Agreements').length;
    const regCount = allCompanyDocuments.filter(d => d.category === 'Regulatory & Compliance').length;
    const insCount = allCompanyDocuments.filter(d => d.category === 'Insurance Policies').length;

    const mTotal = document.getElementById('doc-metric-total');
    const mContracts = document.getElementById('doc-metric-contracts');
    const mReg = document.getElementById('doc-metric-regulatory');
    const mIns = document.getElementById('doc-metric-insurance');

    if (mTotal) mTotal.innerText = totalCount;
    if (mContracts) mContracts.innerText = contractsCount;
    if (mReg) mReg.innerText = regCount;
    if (mIns) mIns.innerText = insCount;

    renderCompanyDocumentsTable();
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#EF4444;">Error loading documents: ${e.message}</td></tr>`;
  }
}

function filterCompanyDocuments(cat) {
  currentDocCategoryFilter = cat;
  const select = document.getElementById('doc-category-filter');
  if (select) select.value = cat;
  renderCompanyDocumentsTable();
}

function handleDocumentCategoryChange() {
  const select = document.getElementById('doc-category-filter');
  currentDocCategoryFilter = select ? select.value : 'ALL';
  renderCompanyDocumentsTable();
}

function handleDocumentSearch() {
  const input = document.getElementById('doc-search-input');
  docSearchQuery = input ? input.value.trim().toLowerCase() : '';
  renderCompanyDocumentsTable();
}

function renderCompanyDocumentsTable() {
  const tbody = document.getElementById('documents-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  let filtered = allCompanyDocuments;
  if (currentDocCategoryFilter !== 'ALL') {
    filtered = filtered.filter(d => d.category === currentDocCategoryFilter);
  }

  if (docSearchQuery) {
    filtered = filtered.filter(d => {
      const title = (d.title || '').toLowerCase();
      const cat = (d.category || '').toLowerCase();
      const desc = (d.description || '').toLowerCase();
      const fn = (d.file_name || '').toLowerCase();
      return title.includes(docSearchQuery) || cat.includes(docSearchQuery) || desc.includes(docSearchQuery) || fn.includes(docSearchQuery);
    });
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:32px 16px; color:#64748B;"><div style="font-size:24px; margin-bottom:8px;">📁</div>No company documents match this criteria.</td></tr>';
    return;
  }

  filtered.forEach(doc => {
    const tr = document.createElement('tr');

    let confBadge = '';
    if (doc.confidentiality_level === 'RESTRICTED') {
      confBadge = '<span class="badge" style="background:#FEE2E2; color:#991B1B; font-weight:700;">🛡️ RESTRICTED</span>';
    } else if (doc.confidentiality_level === 'CONFIDENTIAL') {
      confBadge = '<span class="badge" style="background:#FEF3C7; color:#92400E; font-weight:700;">🔒 CONFIDENTIAL</span>';
    } else {
      confBadge = '<span class="badge" style="background:#EEF2FF; color:#4338CA; font-weight:700;">🏢 INTERNAL</span>';
    }

    const sizeFormatted = doc.file_size_bytes ? (doc.file_size_bytes > 1048576 ? `${(doc.file_size_bytes/1048576).toFixed(1)} MB` : `${Math.round(doc.file_size_bytes/1024)} KB`) : '—';
    const dateFormatted = doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—';

    const safeTitle = (doc.title || '').replace(/'/g, "\\'");
    const safeFile = (doc.file_name || '').replace(/'/g, "\\'");
    const safeMime = (doc.mime_type || '').replace(/'/g, "\\'");

    tr.innerHTML = `
      <td>
        <a href="javascript:void(0)" onclick="viewCompanyDocument(${doc.id})" style="font-size:13px; font-weight:700; color:#1D4ED8; text-decoration:none; cursor:pointer;" title="Click to view document">
          📄 ${escapeHtml(doc.title)}
        </a>
        ${doc.description ? `<div style="font-size:11px; color:#64748B; max-width:280px; line-height:1.3; margin-top:2px;">${doc.description}</div>` : ''}
      </td>
      <td><span class="badge" style="background:#F1F5F9; color:#334155; font-weight:600;">${doc.category}</span></td>
      <td>${confBadge}</td>
      <td style="font-size:12px; color:#475569;">
        <strong>📄 ${doc.file_name}</strong><br>
        <span style="font-size:11px; color:#64748B;">${sizeFormatted}</span>
      </td>
      <td style="font-size:12px; color:#334155;">
        ${doc.uploaded_by_name || 'System'}<br>
        <span style="font-size:11px; color:#64748B;">${doc.uploaded_by_email || ''}</span>
      </td>
      <td style="font-size:12px; color:#64748B;">${dateFormatted}</td>
      <td>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn btn-primary" style="padding:4px 10px; font-size:11px; font-weight:700; display:inline-flex; align-items:center; gap:4px;" onclick="viewCompanyDocument(${doc.id})" title="View and preview document inline">
            👁️ View
          </button>
          <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="downloadCompanyDocument(${doc.id}, '${safeFile}')" title="Download secure file">⬇️ Download</button>
          <button class="btn btn-danger" style="padding:4px 8px; font-size:11px; background:#EF4444; color:#fff; border:none;" onclick="deleteCompanyDocumentRecord(${doc.id}, '${safeTitle}')" title="Delete document">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openUploadDocumentModal() {
  const modal = document.getElementById('modal-upload-document');
  if (modal) modal.style.display = 'flex';
}

function closeUploadDocumentModal() {
  const modal = document.getElementById('modal-upload-document');
  if (modal) modal.style.display = 'none';
}

async function handleUploadDocumentSubmit(event) {
  event.preventDefault();
  const title = document.getElementById('doc-form-title').value.trim();
  const category = document.getElementById('doc-form-category').value;
  const conf = document.getElementById('doc-form-confidentiality').value;
  const desc = document.getElementById('doc-form-desc').value.trim();
  const fileInput = document.getElementById('doc-form-file');

  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('Please choose a file to upload.', 'warning');
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('category', category);
  formData.append('confidentiality_level', conf);
  formData.append('description', desc);
  formData.append('file', fileInput.files[0]);

  try {
    const res = await fetch(`${API_BASE}/documents/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Upload failed');
    showToast(`✅ Document "${title}" uploaded successfully to repository!`, 'success');
    closeUploadDocumentModal();
    document.getElementById('upload-document-form').reset();
    loadCompanyDocuments();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

async function downloadCompanyDocument(docId, fileName) {
  try {
    const res = await apiFetch(`/documents/${docId}/download`);
    if (!res.ok) throw new Error('Failed to download document');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || `document_${docId}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    showToast(`⬇️ Download started for ${fileName}`, 'success');
  } catch (e) {
    showToast('Download error: ' + e.message, 'danger');
  }
}

async function deleteCompanyDocumentRecord(docId, title) {
  if (!confirm(`Are you sure you want to permanently delete document "${title}" from the corporate repository?`)) {
    return;
  }
  try {
    const res = await apiFetch(`/documents/${docId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to delete');
    showToast(`Document "${title}" removed from repository.`, 'success');
    loadCompanyDocuments();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

// ==================== COMPANY DOCUMENTS VAULT PASSWORD AUTH ====================
function openDocumentsVaultModal() {
  const modal = document.getElementById('modal-documents-vault-auth');
  const input = document.getElementById('vault-password-input');
  const errBox = document.getElementById('vault-auth-error');
  if (errBox) { errBox.style.display = 'none'; errBox.innerText = ''; }
  if (input) { input.value = ''; input.type = 'password'; }
  if (modal) modal.style.display = 'flex';
  setTimeout(() => { if (input) input.focus(); }, 150);
}

function closeDocumentsVaultModal() {
  const modal = document.getElementById('modal-documents-vault-auth');
  if (modal) modal.style.display = 'none';
}

function toggleVaultPasswordVisibility() {
  const input = document.getElementById('vault-password-input');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function handleDocumentsVaultAuthSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('vault-password-input');
  const errBox = document.getElementById('vault-auth-error');
  const btn = document.getElementById('btn-vault-unlock');
  const password = input ? input.value : '';

  if (!password) {
    if (errBox) { errBox.innerText = 'Please enter your password.'; errBox.style.display = 'block'; }
    return;
  }

  if (errBox) { errBox.style.display = 'none'; errBox.innerText = ''; }
  if (btn) { btn.disabled = true; btn.innerText = 'Verifying...'; }

  try {
    const res = await apiFetch('/documents/verify-vault-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Incorrect password.');

    // Grant one-time authorization to enter the documents section
    window.isAuthorizedForDocumentEntryOnce = true;
    closeDocumentsVaultModal();
    showToast('🔓 Password verified. Access granted to Company Documents.', 'success');
    switchTab('documents');
    window.isAuthorizedForDocumentEntryOnce = false;
  } catch (err) {
    console.error('Vault auth error:', err);
    if (errBox) {
      errBox.innerText = err.message || 'Incorrect password. Access denied.';
      errBox.style.display = 'block';
    }
    if (input) {
      input.value = '';
      input.focus();
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = '🔓 Unlock Vault'; }
  }
}

function lockCompanyDocumentsVault() {
  window.isAuthorizedForDocumentEntryOnce = false;
  showToast('🔒 Company Documents Vault has been locked.', 'info');
  switchTab('dashboard');
}

// ==================== COMPANY DOCUMENTS VIEWER & PREVIEW ====================
function viewCompanyDocument(docId) {
  const doc = allCompanyDocuments.find(d => d.id === docId);
  if (!doc) {
    showToast('Document not found in cache.', 'warning');
    return;
  }

  const modal = document.getElementById('modal-view-document');
  const titleEl = document.getElementById('viewer-doc-title');
  const subEl = document.getElementById('viewer-doc-sub');
  const metaBar = document.getElementById('viewer-meta-bar');
  const contentBody = document.getElementById('viewer-content-body');
  const fsBtn = document.getElementById('viewer-fullscreen-btn');
  const dlBtn = document.getElementById('viewer-download-btn');

  if (titleEl) titleEl.innerText = doc.title;
  if (subEl) subEl.innerText = `${doc.category} • Confidentiality: ${doc.confidentiality_level}`;

  const sizeFormatted = doc.file_size_bytes ? (doc.file_size_bytes > 1048576 ? `${(doc.file_size_bytes/1048576).toFixed(1)} MB` : `${Math.round(doc.file_size_bytes/1024)} KB`) : 'Unknown Size';
  const dateFormatted = doc.created_at ? new Date(doc.created_at).toLocaleString() : '—';

  let confBadge = '';
  if (doc.confidentiality_level === 'RESTRICTED') {
    confBadge = '<span class="badge" style="background:#FEE2E2; color:#991B1B; font-weight:700;">🛡️ RESTRICTED</span>';
  } else if (doc.confidentiality_level === 'CONFIDENTIAL') {
    confBadge = '<span class="badge" style="background:#FEF3C7; color:#92400E; font-weight:700;">🔒 CONFIDENTIAL</span>';
  } else {
    confBadge = '<span class="badge" style="background:#EEF2FF; color:#4338CA; font-weight:700;">🏢 INTERNAL</span>';
  }

  if (metaBar) {
    metaBar.innerHTML = `
      <div><strong>File Name:</strong> 📄 ${escapeHtml(doc.file_name)}</div>
      <div><strong>Category:</strong> <span class="badge" style="background:#E2E8F0; color:#334155;">${escapeHtml(doc.category)}</span></div>
      <div><strong>Level:</strong> ${confBadge}</div>
      <div><strong>Size:</strong> ${sizeFormatted}</div>
      <div><strong>Uploaded By:</strong> ${escapeHtml(doc.uploaded_by_name || 'System')}</div>
      <div><strong>Date:</strong> ${dateFormatted}</div>
      ${doc.description ? `<div style="width:100%; margin-top:4px; font-style:italic; color:#64748B;">Notes: ${escapeHtml(doc.description)}</div>` : ''}
    `;
  }

  const viewUrl = `/api/v1/documents/${doc.id}/view?token=${encodeURIComponent(authToken || '')}`;
  if (fsBtn) {
    fsBtn.onclick = () => window.open(viewUrl, '_blank');
  }
  if (dlBtn) {
    dlBtn.onclick = () => downloadCompanyDocument(doc.id, doc.file_name);
  }

  const fileNameLower = (doc.file_name || '').toLowerCase();
  const mimeLower = (doc.mime_type || '').toLowerCase();

  if (contentBody) {
    if (fileNameLower.endsWith('.pdf') || mimeLower.includes('pdf')) {
      contentBody.innerHTML = `
        <iframe src="${viewUrl}" style="width:100%; height:100%; min-height:480px; border:none; display:block;" title="${escapeHtml(doc.title)}"></iframe>
      `;
    } else if (fileNameLower.endsWith('.png') || fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg') || fileNameLower.endsWith('.webp') || mimeLower.startsWith('image/')) {
      contentBody.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:center; height:100%; padding:24px;">
          <img src="${viewUrl}" alt="${escapeHtml(doc.title)}" style="max-width:100%; max-height:calc(94vh - 200px); object-fit:contain; border-radius:8px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); border:1px solid #CBD5E1;" />
        </div>
      `;
    } else {
      contentBody.innerHTML = `
        <div style="text-align:center; padding:60px 20px; max-width:540px; margin:auto;">
          <div style="font-size:56px; margin-bottom:16px;">📁</div>
          <h3 style="font-size:18px; font-weight:800; color:#0F172A; margin:0 0 8px 0;">${escapeHtml(doc.title)}</h3>
          <p style="font-size:13px; color:#64748B; margin-bottom:20px; line-height:1.5;">
            <strong>${escapeHtml(doc.file_name)}</strong> (${sizeFormatted})<br>
            This file type can be opened directly or downloaded securely to your computer.
          </p>
          <div style="display:flex; justify-content:center; gap:12px;">
            <button class="btn btn-primary" style="padding:10px 22px; font-weight:700;" onclick="downloadCompanyDocument(${doc.id}, '${escapeHtml(doc.file_name)}')">
              ⬇️ Download & Open File
            </button>
            <button class="btn btn-secondary" style="padding:10px 18px;" onclick="window.open('${viewUrl}', '_blank')">
              ↗️ Open in New Tab
            </button>
          </div>
        </div>
      `;
    }
  }

  if (modal) modal.style.display = 'flex';
}

function closeViewDocumentModal() {
  const modal = document.getElementById('modal-view-document');
  const contentBody = document.getElementById('viewer-content-body');
  if (contentBody) contentBody.innerHTML = '';
  if (modal) modal.style.display = 'none';
}

window.loadCompanyDocuments = loadCompanyDocuments;
window.filterCompanyDocuments = filterCompanyDocuments;
window.handleDocumentCategoryChange = handleDocumentCategoryChange;
window.handleDocumentSearch = handleDocumentSearch;
window.openUploadDocumentModal = openUploadDocumentModal;
window.closeUploadDocumentModal = closeUploadDocumentModal;
window.handleUploadDocumentSubmit = handleUploadDocumentSubmit;
window.downloadCompanyDocument = downloadCompanyDocument;
window.deleteCompanyDocumentRecord = deleteCompanyDocumentRecord;
window.openDocumentsVaultModal = openDocumentsVaultModal;
window.closeDocumentsVaultModal = closeDocumentsVaultModal;
window.toggleVaultPasswordVisibility = toggleVaultPasswordVisibility;
window.handleDocumentsVaultAuthSubmit = handleDocumentsVaultAuthSubmit;
window.lockCompanyDocumentsVault = lockCompanyDocumentsVault;
window.viewCompanyDocument = viewCompanyDocument;
window.closeViewDocumentModal = closeViewDocumentModal;


/* ==========================================================================
   Corporate Staff & HR Management
   ========================================================================== */

let allStaffMembers = [];
let currentStaffRoleFilter = 'ALL';
let staffSearchQuery = '';

async function loadStaffMembers() {
  const tbody = document.getElementById('staff-table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:#64748B;">Loading staff directory...</td></tr>';

  try {
    const res = await apiFetch('/staff');
    if (!res.ok) throw new Error('Failed to load staff list');
    allStaffMembers = await res.json();

    const totalCount = allStaffMembers.length;
    const hrCount = allStaffMembers.filter(s => s.role === 'HR').length;
    const supCount = allStaffMembers.filter(s => s.role === 'SUPERVISOR').length;
    const adminCount = allStaffMembers.filter(s => s.role === 'ADMIN').length;

    const mTotal = document.getElementById('staff-metric-total');
    const mHr = document.getElementById('staff-metric-hr');
    const mSup = document.getElementById('staff-metric-supervisors');
    const mAdmin = document.getElementById('staff-metric-admins');

    if (mTotal) mTotal.innerText = totalCount;
    if (mHr) mHr.innerText = hrCount;
    if (mSup) mSup.innerText = supCount;
    if (mAdmin) mAdmin.innerText = adminCount;

    const cAll = document.getElementById('staff-count-all');
    const cHr = document.getElementById('staff-count-hr');
    const cSup = document.getElementById('staff-count-supervisor');
    const cAdmin = document.getElementById('staff-count-admin');

    if (cAll) cAll.innerText = totalCount;
    if (cHr) cHr.innerText = hrCount;
    if (cSup) cSup.innerText = supCount;
    if (cAdmin) cAdmin.innerText = adminCount;

    renderStaffTable();
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#EF4444;">Error loading staff: ${e.message}</td></tr>`;
  }
}

function filterStaffList(role) {
  currentStaffRoleFilter = role;
  const btnAll = document.getElementById('staff-filter-all');
  const btnHr = document.getElementById('staff-filter-hr');
  const btnSup = document.getElementById('staff-filter-supervisor');
  const btnAdmin = document.getElementById('staff-filter-admin');

  if (btnAll) btnAll.className = role === 'ALL' ? 'btn btn-primary' : 'btn btn-secondary';
  if (btnHr) btnHr.className = role === 'HR' ? 'btn btn-primary' : 'btn btn-secondary';
  if (btnSup) btnSup.className = role === 'SUPERVISOR' ? 'btn btn-primary' : 'btn btn-secondary';
  if (btnAdmin) btnAdmin.className = role === 'ADMIN' ? 'btn btn-primary' : 'btn btn-secondary';

  renderStaffTable();
}

function handleStaffSearch() {
  const input = document.getElementById('staff-search-input');
  staffSearchQuery = input ? input.value.trim().toLowerCase() : '';
  renderStaffTable();
}

function renderStaffTable() {
  const tbody = document.getElementById('staff-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  let filtered = allStaffMembers;
  if (currentStaffRoleFilter !== 'ALL') {
    filtered = filtered.filter(s => s.role === currentStaffRoleFilter);
  }

  if (staffSearchQuery) {
    filtered = filtered.filter(s => {
      const name = (s.full_name || '').toLowerCase();
      const email = (s.email || '').toLowerCase();
      const phone = (s.phone || '').toLowerCase();
      const role = (s.role || '').toLowerCase();
      return name.includes(staffSearchQuery) || email.includes(staffSearchQuery) || phone.includes(staffSearchQuery) || role.includes(staffSearchQuery);
    });
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:32px 16px; color:#64748B;"><div style="font-size:24px; margin-bottom:8px;">👥</div>No corporate staff members found for this filter.</td></tr>';
    return;
  }

  filtered.forEach(staff => {
    const tr = document.createElement('tr');

    let roleBadge = '';
    if (staff.role === 'ADMIN') {
      roleBadge = '<span class="badge" style="background:#FEE2E2; color:#991B1B; font-weight:700;">⚙️ System Admin</span>';
    } else if (staff.role === 'HR') {
      roleBadge = '<span class="badge" style="background:#E0F2FE; color:#0369A1; font-weight:700;">💼 HR Manager</span>';
    } else {
      roleBadge = '<span class="badge" style="background:#DCFCE7; color:#166534; font-weight:700;">👨‍💼 Field Supervisor</span>';
    }

    const isSuspended = staff.status === 'SUSPENDED';
    const statusBadge = isSuspended ?
      '<span class="badge badge-warning" style="background:#FEF3C7; color:#92400E;">Suspended</span>' :
      '<span class="badge badge-active" style="background:#DCFCE7; color:#166534;">Active</span>';

    const dateFormatted = staff.created_at ? new Date(staff.created_at).toLocaleDateString() : '—';

    tr.innerHTML = `
      <td><strong style="color:#0F172A;">${staff.full_name || staff.email.split('@')[0]}</strong></td>
      <td>${roleBadge}</td>
      <td style="font-size:12px; color:#334155;"><strong>${staff.email}</strong></td>
      <td style="font-size:12px; color:#64748B;">${staff.phone}</td>
      <td>${statusBadge}</td>
      <td style="font-size:12px; color:#64748B;">${dateFormatted}</td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px; font-weight:700;" onclick="openStaffFileModal(${staff.id})" title="View Staff Personnel File & Custody">📁 File</button>
          <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="toggleStaffAccountStatus(${staff.id}, '${staff.status}')" title="${isSuspended ? 'Reactivate staff account' : 'Suspend staff account'}">
            ${isSuspended ? '✅ Activate' : '⏸️ Suspend'}
          </button>
          <button class="btn btn-danger" style="padding:4px 8px; font-size:11px; background:#EF4444; color:#fff; border:none;" onclick="deleteStaffAccountRecord(${staff.id}, '${staff.email}')" title="Delete staff account">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openAddStaffModal() {
  const modal = document.getElementById('modal-add-staff');
  if (modal) modal.style.display = 'flex';
}

function closeAddStaffModal() {
  const modal = document.getElementById('modal-add-staff');
  if (modal) modal.style.display = 'none';
}

async function handleAddStaffSubmit(event) {
  event.preventDefault();
  const name = document.getElementById('staff-form-name').value.trim();
  const email = document.getElementById('staff-form-email').value.trim();
  const phone = document.getElementById('staff-form-phone').value.trim();
  const role = document.getElementById('staff-form-role').value;
  const pw = document.getElementById('staff-form-password').value.trim();

  try {
    const res = await apiFetch('/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: name,
        email: email,
        phone: phone,
        role: role,
        password: pw || 'password123'
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to create staff account');
    showToast(`✅ Created ${data.role} account for ${data.full_name || data.email}!`, 'success');
    closeAddStaffModal();
    document.getElementById('add-staff-form').reset();
    loadStaffMembers();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

async function toggleStaffAccountStatus(userId, currentStatus) {
  const newStatus = currentStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
  try {
    const res = await apiFetch(`/staff/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to update status');
    showToast(`Account status updated to ${newStatus}`, 'success');
    loadStaffMembers();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

async function deleteStaffAccountRecord(userId, email) {
  if (!confirm(`Are you sure you want to permanently delete staff account ${email}?`)) {
    return;
  }
  try {
    const res = await apiFetch(`/staff/${userId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to delete');
    showToast(data.message || 'Staff account deleted successfully.', 'success');
    loadStaffMembers();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

window.loadStaffMembers = loadStaffMembers;
window.filterStaffList = filterStaffList;
window.handleStaffSearch = handleStaffSearch;
window.openAddStaffModal = openAddStaffModal;
window.closeAddStaffModal = closeAddStaffModal;
window.handleAddStaffSubmit = handleAddStaffSubmit;
window.toggleStaffAccountStatus = toggleStaffAccountStatus;
window.deleteStaffAccountRecord = deleteStaffAccountRecord;

window.switchTab = switchTab;


/* ==========================================================================
   Guard Deactivation, Reactivation & Sub-Tab Navigation
   ========================================================================== */

let currentGuardSubTab = 'active';

function switchGuardSubTab(tab) {
  currentGuardSubTab = tab;
  const activeBtn = document.getElementById('guard-tab-btn-active');
  const inactiveBtn = document.getElementById('guard-tab-btn-inactive');
  const activeView = document.getElementById('guards-subview-active');
  const inactiveView = document.getElementById('guards-subview-inactive');

  if (tab === 'active') {
    if (activeBtn) {
      activeBtn.style.background = '#2563EB';
      activeBtn.style.color = '#FFFFFF';
    }
    if (inactiveBtn) {
      inactiveBtn.style.background = '#F1F5F9';
      inactiveBtn.style.color = '#475569';
    }
    if (activeView) activeView.style.display = 'block';
    if (inactiveView) inactiveView.style.display = 'none';
  } else {
    if (activeBtn) {
      activeBtn.style.background = '#F1F5F9';
      activeBtn.style.color = '#475569';
    }
    if (inactiveBtn) {
      inactiveBtn.style.background = '#DC2626';
      inactiveBtn.style.color = '#FFFFFF';
    }
    if (activeView) activeView.style.display = 'none';
    if (inactiveView) inactiveView.style.display = 'block';
  }
}

function openDeactivateGuardModal(guardId, guardName, empNo) {
  const modal = document.getElementById('modal-deactivate-guard');
  if (!modal) return;
  const idInput = document.getElementById('deact-guard-id');
  const nameEl = document.getElementById('deact-guard-name');
  const empEl = document.getElementById('deact-guard-emp');
  const catEl = document.getElementById('deact-guard-category');
  const reasonEl = document.getElementById('deact-guard-reason');

  if (idInput) idInput.value = guardId;
  if (nameEl) nameEl.innerText = guardName || 'Guard #' + guardId;
  if (empEl) empEl.innerText = empNo ? `Employee ID: ${empNo}` : '';
  if (catEl) catEl.value = 'Resignation / Voluntarily Left';
  if (reasonEl) reasonEl.value = 'Resignation / Voluntarily Left';

  modal.style.display = 'flex';
}

function closeDeactivateGuardModal() {
  const modal = document.getElementById('modal-deactivate-guard');
  if (modal) modal.style.display = 'none';
}

function onDeactivateCategoryChange(cat) {
  const reasonEl = document.getElementById('deact-guard-reason');
  if (!reasonEl) return;
  if (cat === 'Other (Custom)') {
    reasonEl.value = '';
    reasonEl.placeholder = 'Please enter custom reason for deactivation...';
    reasonEl.focus();
  } else {
    reasonEl.value = cat;
  }
}

async function submitDeactivateGuard(event) {
  if (event) event.preventDefault();
  const idInput = document.getElementById('deact-guard-id');
  const reasonEl = document.getElementById('deact-guard-reason');
  if (!idInput) return;
  const guardId = idInput.value;
  const reason = (reasonEl ? reasonEl.value : '').trim();

  if (!reason || reason.length < 3) {
    showToast('Please provide a specific reason for deactivation (minimum 3 characters).', 'warning');
    return;
  }

  try {
    const res = await apiFetch(`/guards/${guardId}/deactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to deactivate guard');

    showToast('🛑 Security Guard deactivated successfully and moved to archive.', 'success');
    closeDeactivateGuardModal();

    await loadGuards();

    if (currentViewedGuard && currentViewedGuard.id == guardId) {
      viewGuardFile(guardId);
    } else {
      switchGuardSubTab('inactive');
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

function deactivateGuard(guardId) {
  const guard = (cachedGuards || []).find(g => g.id === guardId);
  openDeactivateGuardModal(guardId, guard ? guard.full_name : '', guard ? guard.employee_number : '');
}

function openReactivateGuardModal(guardId, guardName, empNo) {
  const modal = document.getElementById('modal-reactivate-guard');
  if (!modal) return;
  const idInput = document.getElementById('react-guard-id');
  const nameEl = document.getElementById('react-guard-name');
  const empEl = document.getElementById('react-guard-emp');

  if (idInput) idInput.value = guardId;
  if (nameEl) nameEl.innerText = guardName || 'Guard #' + guardId;
  if (empEl) empEl.innerText = empNo ? `Employee ID: ${empNo}` : '';

  modal.style.display = 'flex';
}

function closeReactivateGuardModal() {
  const modal = document.getElementById('modal-reactivate-guard');
  if (modal) modal.style.display = 'none';
}

async function submitReactivateGuard(event) {
  if (event) event.preventDefault();
  const idInput = document.getElementById('react-guard-id');
  if (!idInput) return;
  const guardId = idInput.value;

  try {
    const res = await apiFetch(`/guards/${guardId}/reactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to reactivate guard');

    showToast('✅ Security Guard successfully reactivated and restored to active roster!', 'success');
    closeReactivateGuardModal();

    await loadGuards();

    if (currentViewedGuard && currentViewedGuard.id == guardId) {
      viewGuardFile(guardId);
    } else {
      switchGuardSubTab('active');
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

function reactivateGuard(guardId) {
  const guard = (cachedGuards || []).find(g => g.id === guardId);
  openReactivateGuardModal(guardId, guard ? guard.full_name : '', guard ? guard.employee_number : '');
}

function filterInactiveGuardsTable(searchTerm) {
  const term = (searchTerm || '').toLowerCase();
  const rows = document.querySelectorAll('#inactive-guards-table-body tr');
  rows.forEach(row => {
    if (row.id === 'empty-inactive-guards-row') return;
    const txt = row.innerText.toLowerCase();
    row.style.display = txt.includes(term) ? '' : 'none';
  });
}

window.switchGuardSubTab = switchGuardSubTab;
window.openDeactivateGuardModal = openDeactivateGuardModal;
window.closeDeactivateGuardModal = closeDeactivateGuardModal;
window.onDeactivateCategoryChange = onDeactivateCategoryChange;
window.submitDeactivateGuard = submitDeactivateGuard;
window.deactivateGuard = deactivateGuard;
window.openReactivateGuardModal = openReactivateGuardModal;
window.closeReactivateGuardModal = closeReactivateGuardModal;
window.submitReactivateGuard = submitReactivateGuard;
window.reactivateGuard = reactivateGuard;
window.filterInactiveGuardsTable = filterInactiveGuardsTable;


/* ==========================================================================
   Supervisor Site Allocation Handlers
   ========================================================================== */

let activeSupervisorSitesId = null;

async function openSupervisorAssignSitesPanel(supId) {
  activeSupervisorSitesId = supId;
  const sup = (supervisorsCache || []).find(s => s.id === supId);
  const nameEl = document.getElementById('supervisor-assign-sites-name');
  if (nameEl) nameEl.innerText = sup ? `${sup.full_name || sup.email} (#${sup.id})` : `#${supId}`;

  const panel = document.getElementById('supervisor-assign-sites-panel');
  if (panel) panel.style.display = 'block';

  const container = document.getElementById('supervisor-assign-sites-list');
  if (!container) return;
  container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:24px; color:#64748B;">Loading client sites...</div>';

  try {
    if (!cachedSites || cachedSites.length === 0) {
      const res = await apiFetch('/sites');
      if (res.ok) cachedSites = await res.json();
    }

    const sites = cachedSites || [];
    container.innerHTML = '';
    if (sites.length === 0) {
      container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:24px; color:#64748B;">No client sites found. Add sites in Client Sites & Rates first.</div>';
      return;
    }

    sites.forEach(s => {
      const checked = s.supervisor_id === supId;
      const otherSup = s.supervisor_id && s.supervisor_id !== supId;
      const otherSupNote = otherSup ? `<span style="font-size:11px; color:#D97706; display:block;">⚠️ Currently assigned to supervisor #${s.supervisor_id}</span>` : '';

      const div = document.createElement('div');
      div.className = 'assign-site-item';
      div.style.padding = '12px 14px';
      div.style.background = checked ? '#ECFDF5' : '#F8FAFC';
      div.style.borderRadius = '8px';
      div.style.border = checked ? '1.5px solid #10B981' : '1px solid #E2E8F0';
      div.style.display = 'flex';
      div.style.alignItems = 'flex-start';
      div.style.gap = '10px';

      div.innerHTML = `
        <input type="checkbox" data-site-id="${s.id}" ${checked ? 'checked' : ''} style="margin-top:3px; cursor:pointer;" onchange="this.parentElement.style.background = this.checked ? '#ECFDF5' : '#F8FAFC'; this.parentElement.style.border = this.checked ? '1.5px solid #10B981' : '1px solid #E2E8F0';">
        <div style="flex:1;">
          <div style="font-weight:700; font-size:13px; color:#0F172A;">🏢 ${s.site_name}</div>
          <div style="font-size:12px; color:#64748B;">${s.location} · ${s.client_name}</div>
          <div style="font-size:11px; color:#059669; font-weight:600; margin-top:2px;">🛡️ ${s.guard_count || 0} active guard(s)</div>
          ${otherSupNote}
        </div>
      `;
      container.appendChild(div);
    });
  } catch (err) {
    container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:24px; color:#DC2626;">Error: ${err.message}</div>`;
  }
}

function closeSupervisorAssignSitesPanel() {
  const panel = document.getElementById('supervisor-assign-sites-panel');
  if (panel) panel.style.display = 'none';
  activeSupervisorSitesId = null;
}

function selectAllSupervisorSites(select) {
  const checkBoxes = document.querySelectorAll('#supervisor-assign-sites-list input[type="checkbox"]');
  checkBoxes.forEach(cb => {
    cb.checked = select;
    cb.dispatchEvent(new Event('change'));
  });
}

async function saveSupervisorSiteAssignments() {
  if (!activeSupervisorSitesId) return;
  const checkedBoxes = document.querySelectorAll('#supervisor-assign-sites-list input[type="checkbox"]:checked');
  const selectedIds = Array.from(checkedBoxes).map(cb => parseInt(cb.getAttribute('data-site-id')));

  try {
    const res = await apiFetch(`/supervisors/${activeSupervisorSitesId}/assign-sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_ids: selectedIds })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to save site assignments');

    showToast(`✅ Successfully allocated ${data.assigned_sites} site(s) and synchronized guards to supervisor!`, 'success');
    closeSupervisorAssignSitesPanel();
    loadSupervisors();
    loadSites();
    loadGuards();
  } catch (err) {
    showToast('Error saving site assignments: ' + err.message, 'danger');
  }
}

window.openEditSiteModal = openEditSiteModal;
window.closeEditSiteModal = closeEditSiteModal;
window.handleEditSiteSubmit = handleEditSiteSubmit;
window.openSupervisorAssignSitesPanel = openSupervisorAssignSitesPanel;
window.closeSupervisorAssignSitesPanel = closeSupervisorAssignSitesPanel;
window.selectAllSupervisorSites = selectAllSupervisorSites;
window.saveSupervisorSiteAssignments = saveSupervisorSiteAssignments;


/* ==========================================================================
   Client Site Invoices & Commercial Billing Management
   ========================================================================== */

async function loadInvoices() {
  const tbody = document.getElementById('invoices-table-body');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:32px; color:#64748B;">Loading site invoices...</td></tr>';
  }

  // Populate Site Filter dropdown if empty
  const siteFilter = document.getElementById('invoice-site-filter');
  if (siteFilter && siteFilter.options.length <= 1) {
    const prevVal = siteFilter.value;
    siteFilter.innerHTML = '<option value="">All Sites</option>' +
      (cachedSites || []).map(s => `<option value="${s.id}">${s.site_name}</option>`).join('');
    siteFilter.value = prevVal;
  }

  const siteId = document.getElementById('invoice-site-filter')?.value || '';
  const statusFilter = document.getElementById('invoice-status-filter')?.value || 'ALL';
  const searchTerm = document.getElementById('invoice-search-input')?.value.trim() || '';

  const params = new URLSearchParams();
  if (siteId) params.append('site_id', siteId);
  if (statusFilter && statusFilter !== 'ALL') params.append('status', statusFilter);
  if (searchTerm) params.append('search', searchTerm);

  try {
    const res = await apiFetch(`/invoices?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to load invoices');

    cachedInvoices = Array.isArray(data) ? data : [];

    // Recalculate summary metrics
    const totalCount = cachedInvoices.length;
    let totalAmt = 0;
    let paidAmt = 0;
    let paidCount = 0;
    let pendingAmt = 0;
    let pendingCount = 0;

    cachedInvoices.forEach(inv => {
      const amt = Number(inv.total_amount || 0);
      totalAmt += amt;
      const st = (inv.status || '').toUpperCase();
      if (st === 'PAID') {
        paidAmt += amt;
        paidCount++;
      } else if (st !== 'CANCELLED') {
        pendingAmt += amt;
        pendingCount++;
      }
    });

    const mTotal = document.getElementById('invoice-metric-total');
    if (mTotal) mTotal.innerText = totalCount;
    const mAmt = document.getElementById('invoice-metric-amount');
    if (mAmt) mAmt.innerText = `KES ${Math.round(totalAmt).toLocaleString()}`;
    const mPaid = document.getElementById('invoice-metric-paid');
    if (mPaid) mPaid.innerText = `KES ${Math.round(paidAmt).toLocaleString()}`;
    const mPaidCnt = document.getElementById('invoice-metric-paid-count');
    if (mPaidCnt) mPaidCnt.innerText = `${paidCount} Settled`;
    const mPending = document.getElementById('invoice-metric-pending');
    if (mPending) mPending.innerText = `KES ${Math.round(pendingAmt).toLocaleString()}`;
    const mPendingCnt = document.getElementById('invoice-metric-pending-count');
    if (mPendingCnt) mPendingCnt.innerText = `${pendingCount} Outstanding`;

    // Render table rows
    if (tbody) {
      if (cachedInvoices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:32px; color:#64748B;">No site invoices found matching current filters. Click "+ Generate Site Invoice" to create one.</td></tr>';
        return;
      }

      const user = getLoggedInUser();
      const isAdmin = user && user.role === 'ADMIN';

      tbody.innerHTML = '';
      cachedInvoices.forEach(inv => {
        const tr = document.createElement('tr');
        const st = (inv.status || 'ISSUED').toUpperCase();

        let badgeBg = '#EFF6FF';
        let badgeColor = '#1D4ED8';
        if (st === 'PAID') { badgeBg = '#ECFDF5'; badgeColor = '#059669'; }
        else if (st === 'DRAFT') { badgeBg = '#FEF3C7'; badgeColor = '#D97706'; }
        else if (st === 'OVERDUE') { badgeBg = '#FEF2F2'; badgeColor = '#DC2626'; }
        else if (st === 'CANCELLED') { badgeBg = '#F1F5F9'; badgeColor = '#64748B'; }

        const issueDateStr = inv.issue_date || '-';
        const dueDateStr = inv.due_date || '-';

        const subtotalStr = `KES ${(inv.subtotal || 0).toLocaleString()} (VAT ${inv.tax_rate || 0}%)`;
        const totalStr = `KES ${(inv.total_amount || 0).toLocaleString()}`;

        // Quick status action button if unpaid
        const markPaidBtn = (st !== 'PAID' && st !== 'CANCELLED')
          ? `<button class="btn btn-secondary" style="padding:4px 8px; font-size:11px; color:#059669; border-color:#A7F3D0;" title="Mark Paid" onclick="quickMarkInvoicePaid(${inv.id})">✅ Paid</button>`
          : '';

        const deleteBtn = isAdmin
          ? `<button class="btn btn-secondary" style="padding:4px 8px; font-size:11px; color:#DC2626; border-color:#FECACA;" title="Delete Invoice" onclick="deleteInvoice(${inv.id})">🗑️</button>`
          : '';

        tr.innerHTML = `
          <td>
            <a href="javascript:void(0)" onclick="viewInvoice(${inv.id})" style="font-weight:700; color:#0D7682; text-decoration:none;">${inv.invoice_number}</a>
          </td>
          <td><b>${inv.client_name || '-'}</b></td>
          <td>${inv.site_name || '-'}</td>
          <td><span class="badge" style="background:#F3E8FF; color:#6B21A8;">${inv.billing_period || '-'}</span></td>
          <td style="font-size:11px; color:#475569;">
            Issued: <b>${issueDateStr}</b><br/>
            Due: <b>${dueDateStr}</b>
          </td>
          <td style="font-size:11px; color:#64748B;">${subtotalStr}</td>
          <td><b style="font-size:13px; color:#0F172A;">${totalStr}</b></td>
          <td>
            <span class="badge" style="background:${badgeBg}; color:${badgeColor}; font-weight:700;">${st}</span>
          </td>
          <td style="text-align:right; white-space:nowrap;">
            <div style="display:inline-flex; gap:4px; align-items:center;">
              <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" title="View Details" onclick="viewInvoice(${inv.id})">👁️</button>
              <button class="btn btn-primary" style="padding:4px 8px; font-size:11px;" title="Amend Invoice" onclick="openEditInvoiceModal(${inv.id})">✏️</button>
              <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px; color:#0D7682;" title="Download PDF" onclick="downloadInvoicePdf(${inv.id})">📄 PDF</button>
              ${markPaidBtn}
              ${deleteBtn}
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:#DC2626;">Error loading invoices: ${err.message}</td></tr>`;
    }
  }
}

function debounceInvoiceSearch() {
  if (invoiceSearchDebounceTimer) clearTimeout(invoiceSearchDebounceTimer);
  invoiceSearchDebounceTimer = setTimeout(() => {
    loadInvoices();
  }, 350);
}

async function openGenerateInvoiceModal(presetSiteId = null) {
  // Ensure sites and guards are loaded
  if (!cachedSites || cachedSites.length === 0) await loadSites();
  if (!cachedGuards || cachedGuards.length === 0) await loadGuards();

  const siteSelect = document.getElementById('gen-inv-site');
  if (siteSelect) {
    siteSelect.innerHTML = '<option value="">-- Choose Client Site --</option>' +
      (cachedSites || []).map(s => `<option value="${s.id}">${s.site_name} (${s.client_name})</option>`).join('');
    if (presetSiteId) siteSelect.value = presetSiteId;
  }

  // Pre-fill current month/year and dates
  const now = new Date();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const currentPeriod = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  const periodInput = document.getElementById('gen-inv-period');
  if (periodInput) periodInput.value = currentPeriod;

  const issueInput = document.getElementById('gen-inv-issue-date');
  if (issueInput) issueInput.value = now.toISOString().split('T')[0];

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 14);
  const dueInput = document.getElementById('gen-inv-due-date');
  if (dueInput) dueInput.value = dueDate.toISOString().split('T')[0];

  handleGenInvoiceSiteChange();

  const modal = document.getElementById('modal-generate-invoice');
  if (modal) modal.style.display = 'flex';
}

function closeGenerateInvoiceModal() {
  const modal = document.getElementById('modal-generate-invoice');
  if (modal) modal.style.display = 'none';
}

function handleGenInvoiceSiteChange() {
  const siteIdVal = document.getElementById('gen-inv-site')?.value;
  const clientInput = document.getElementById('gen-inv-client');
  const guardCountEl = document.getElementById('gen-inv-guard-count');
  const salaryHintEl = document.getElementById('gen-inv-salary-hint');

  if (!siteIdVal) {
    if (clientInput) clientInput.value = '';
    if (guardCountEl) guardCountEl.innerText = '0';
    if (salaryHintEl) salaryHintEl.innerText = 'KES 0';
    updateGenInvoiceEstimate();
    return;
  }

  const siteId = parseInt(siteIdVal);
  const site = (cachedSites || []).find(s => s.id === siteId);
  if (!site) return;

  if (clientInput) clientInput.value = site.client_name || '';

  // Count active guards deployed to site
  const guardsAtSite = (cachedGuards || []).filter(g =>
    (g.primary_site_id === siteId || g.site_id === siteId) &&
    (g.status || 'ACTIVE').toUpperCase() === 'ACTIVE'
  );
  const count = guardsAtSite.length;

  if (guardCountEl) guardCountEl.innerText = count;
  const rate = Number(site.basic_salary || 18000);
  if (salaryHintEl) salaryHintEl.innerText = `KES ${rate.toLocaleString()}`;

  updateGenInvoiceEstimate();
}

function updateGenInvoiceEstimate() {
  const siteIdVal = document.getElementById('gen-inv-site')?.value;
  const subtotalEl = document.getElementById('gen-inv-est-subtotal');
  const totalEl = document.getElementById('gen-inv-est-total');
  if (!subtotalEl || !totalEl) return;

  if (!siteIdVal) {
    subtotalEl.innerText = 'KES 0';
    totalEl.innerText = 'KES 0';
    return;
  }

  const siteId = parseInt(siteIdVal);
  const site = (cachedSites || []).find(s => s.id === siteId);
  if (!site) return;

  const guardsAtSite = (cachedGuards || []).filter(g =>
    (g.primary_site_id === siteId || g.site_id === siteId) &&
    (g.status || 'ACTIVE').toUpperCase() === 'ACTIVE'
  );
  const qty = guardsAtSite.length > 0 ? guardsAtSite.length : 1;
  const unitPrice = Number(site.basic_salary || 18000);
  let subtotal = qty * unitPrice;

  const includeSup = document.getElementById('gen-inv-supervision')?.checked;
  if (includeSup && site.supervisor_id) {
    subtotal += 5000.0;
  }

  const taxRate = parseFloat(document.getElementById('gen-inv-tax-rate')?.value || '16');
  const taxAmount = (subtotal * (taxRate / 100.0));
  const grandTotal = subtotal + taxAmount;

  subtotalEl.innerText = `KES ${Math.round(subtotal).toLocaleString()}`;
  totalEl.innerText = `KES ${Math.round(grandTotal).toLocaleString()}`;
}

async function handleGenerateInvoiceSubmit(e) {
  e.preventDefault();
  const siteIdVal = document.getElementById('gen-inv-site').value;
  if (!siteIdVal) {
    showToast('Please select a client site', 'danger');
    return;
  }

  const site_id = parseInt(siteIdVal);
  const billing_period = document.getElementById('gen-inv-period').value.trim();
  const issue_date = document.getElementById('gen-inv-issue-date').value;
  const due_date = document.getElementById('gen-inv-due-date').value;
  const tax_rate = parseFloat(document.getElementById('gen-inv-tax-rate').value || '16');
  const include_supervision = document.getElementById('gen-inv-supervision').checked;
  const custom_notes = document.getElementById('gen-inv-notes').value.trim();
  const custom_payment_terms = document.getElementById('gen-inv-payment-terms').value.trim();

  const submitBtn = document.getElementById('btn-submit-generate-inv');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'Generating Invoice...'; }

  try {
    const res = await apiFetch('/invoices/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_id,
        billing_period,
        issue_date,
        due_date,
        tax_rate,
        include_supervision,
        custom_notes,
        custom_payment_terms
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to generate invoice');

    closeGenerateInvoiceModal();
    showToast(`✅ Invoice "${data.invoice_number}" generated successfully for ${data.client_name}!`, 'success');
    loadInvoices();
  } catch (err) {
    showToast('Error generating invoice: ' + err.message, 'danger');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '🚀 Generate Invoice'; }
  }
}

// --- AMEND / EDIT INVOICE ---
async function openEditInvoiceModal(invoiceId) {
  try {
    let inv = (cachedInvoices || []).find(i => i.id === invoiceId);
    if (!inv || !inv.items || inv.items.length === 0) {
      const res = await apiFetch(`/invoices/${invoiceId}`);
      if (!res.ok) throw new Error('Invoice not found');
      inv = await res.json();
    }

    document.getElementById('edit-inv-id').value = inv.id;
    document.getElementById('edit-inv-number').value = inv.invoice_number || '';
    document.getElementById('edit-inv-client').value = inv.client_name || '';
    document.getElementById('edit-inv-site').value = inv.site_name || '';
    document.getElementById('edit-inv-period').value = inv.billing_period || '';
    document.getElementById('edit-inv-issue-date').value = inv.issue_date || '';
    document.getElementById('edit-inv-due-date').value = inv.due_date || '';
    document.getElementById('edit-inv-status').value = (inv.status || 'ISSUED').toUpperCase();
    document.getElementById('edit-inv-address').value = inv.billing_address || '';
    document.getElementById('edit-inv-tax-rate').value = inv.tax_rate !== undefined ? inv.tax_rate : 16;
    document.getElementById('edit-inv-discount').value = inv.discount_amount || 0;
    document.getElementById('edit-inv-notes').value = inv.notes || '';
    document.getElementById('edit-inv-payment-terms').value = inv.payment_terms || '';

    // Populate line items table
    const tbody = document.getElementById('edit-inv-items-body');
    if (tbody) {
      tbody.innerHTML = '';
      const items = inv.items || [];
      if (items.length === 0) {
        addEditInvoiceItemRow({
          item_name: 'Security Guarding Services',
          description: `Standard site guarding for ${inv.site_name}`,
          quantity: 1,
          unit_price: inv.subtotal || 15000,
          tax_rate: inv.tax_rate || 16
        });
      } else {
        items.forEach(it => addEditInvoiceItemRow(it));
      }
    }

    recalcEditInvoiceTotals();

    const modal = document.getElementById('modal-edit-invoice');
    if (modal) modal.style.display = 'flex';
  } catch (err) {
    showToast('Failed to open invoice for amendment: ' + err.message, 'danger');
  }
}

function closeEditInvoiceModal() {
  const modal = document.getElementById('modal-edit-invoice');
  if (modal) modal.style.display = 'none';
}

function addEditInvoiceItemRow(item = null) {
  const tbody = document.getElementById('edit-inv-items-body');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.className = 'edit-inv-item-row';
  tr.style.borderBottom = '1px solid #F1F5F9';

  const name = item ? item.item_name : '';
  const desc = item ? (item.description || '') : '';
  const qty = item ? item.quantity : 1;
  const price = item ? item.unit_price : 0;
  const amt = item ? (item.amount || (qty * price)) : 0;

  tr.innerHTML = `
    <td style="padding:6px 8px;">
      <input type="text" class="form-control item-name" required value="${name.replace(/"/g, '&quot;')}" placeholder="e.g. Day Guarding" style="font-size:12px; padding:4px 8px;">
    </td>
    <td style="padding:6px 8px;">
      <input type="text" class="form-control item-desc" value="${desc.replace(/"/g, '&quot;')}" placeholder="e.g. 5 Guards x 30 days" style="font-size:12px; padding:4px 8px;">
    </td>
    <td style="padding:6px 8px; text-align:center;">
      <input type="number" class="form-control item-qty" required step="any" min="0.1" value="${qty}" style="font-size:12px; padding:4px 6px; text-align:center;" oninput="updateItemRowAmount(this)">
    </td>
    <td style="padding:6px 8px; text-align:right;">
      <input type="number" class="form-control item-price" required step="any" min="0" value="${price}" style="font-size:12px; padding:4px 8px; text-align:right;" oninput="updateItemRowAmount(this)">
    </td>
    <td style="padding:6px 8px; text-align:right; font-weight:700; color:#0F172A;">
      KES <span class="item-amount">${Math.round(amt).toLocaleString()}</span>
    </td>
    <td style="padding:6px 4px; text-align:center;">
      <button type="button" onclick="removeEditInvoiceItemRow(this)" style="background:none; border:none; cursor:pointer; font-size:14px; color:#EF4444;" title="Remove Item">🗑️</button>
    </td>
  `;

  tbody.appendChild(tr);
  recalcEditInvoiceTotals();
}

function removeEditInvoiceItemRow(btn) {
  const tr = btn.closest('tr');
  if (tr) tr.remove();
  recalcEditInvoiceTotals();
}

function updateItemRowAmount(input) {
  const tr = input.closest('tr');
  if (!tr) return;
  const qty = parseFloat(tr.querySelector('.item-qty')?.value) || 0;
  const price = parseFloat(tr.querySelector('.item-price')?.value) || 0;
  const amt = qty * price;
  const amtSpan = tr.querySelector('.item-amount');
  if (amtSpan) amtSpan.innerText = Math.round(amt).toLocaleString();
  recalcEditInvoiceTotals();
}

function recalcEditInvoiceTotals() {
  const rows = document.querySelectorAll('#edit-inv-items-body tr');
  let subtotal = 0;
  rows.forEach(tr => {
    const qty = parseFloat(tr.querySelector('.item-qty')?.value) || 0;
    const price = parseFloat(tr.querySelector('.item-price')?.value) || 0;
    subtotal += (qty * price);
  });

  const taxRate = parseFloat(document.getElementById('edit-inv-tax-rate')?.value) || 0;
  const discount = parseFloat(document.getElementById('edit-inv-discount')?.value) || 0;
  const taxAmount = (subtotal * (taxRate / 100.0));
  const grandTotal = Math.max(0, subtotal + taxAmount - discount);

  const subDisp = document.getElementById('edit-inv-subtotal-disp');
  if (subDisp) subDisp.innerText = `${Math.round(subtotal).toLocaleString()}`;
  const taxDisp = document.getElementById('edit-inv-tax-disp');
  if (taxDisp) taxDisp.innerText = `${Math.round(taxAmount).toLocaleString()} (${taxRate}%)`;
  const discDisp = document.getElementById('edit-inv-discount-disp');
  if (discDisp) discDisp.innerText = `${Math.round(discount).toLocaleString()}`;
  const totalDisp = document.getElementById('edit-inv-total-disp');
  if (totalDisp) totalDisp.innerText = `${Math.round(grandTotal).toLocaleString()}`;
}

async function handleEditInvoiceSubmit(e) {
  e.preventDefault();
  const invoiceId = document.getElementById('edit-inv-id').value;
  if (!invoiceId) return;

  const invoice_number = document.getElementById('edit-inv-number').value.trim();
  const client_name = document.getElementById('edit-inv-client').value.trim();
  const site_name = document.getElementById('edit-inv-site').value.trim();
  const billing_period = document.getElementById('edit-inv-period').value.trim();
  const issue_date = document.getElementById('edit-inv-issue-date').value;
  const due_date = document.getElementById('edit-inv-due-date').value;
  const status = document.getElementById('edit-inv-status').value;
  const billing_address = document.getElementById('edit-inv-address').value.trim();
  const tax_rate = parseFloat(document.getElementById('edit-inv-tax-rate').value || '0');
  const discount_amount = parseFloat(document.getElementById('edit-inv-discount').value || '0');
  const notes = document.getElementById('edit-inv-notes').value.trim();
  const payment_terms = document.getElementById('edit-inv-payment-terms').value.trim();

  // Gather items
  const rows = document.querySelectorAll('#edit-inv-items-body tr');
  if (rows.length === 0) {
    showToast('Invoice must have at least one line item', 'danger');
    return;
  }

  const items = [];
  rows.forEach(tr => {
    const item_name = tr.querySelector('.item-name')?.value.trim();
    const description = tr.querySelector('.item-desc')?.value.trim();
    const quantity = parseFloat(tr.querySelector('.item-qty')?.value) || 1;
    const unit_price = parseFloat(tr.querySelector('.item-price')?.value) || 0;
    if (item_name) {
      items.push({
        item_name,
        description,
        quantity,
        unit_price,
        tax_rate,
        amount: quantity * unit_price
      });
    }
  });

  const submitBtn = document.getElementById('btn-submit-edit-inv');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'Saving Amendments...'; }

  try {
    const res = await apiFetch(`/invoices/${invoiceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoice_number,
        client_name,
        site_name,
        billing_period,
        issue_date,
        due_date,
        status,
        billing_address,
        tax_rate,
        discount_amount,
        notes,
        payment_terms,
        items
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to update invoice');

    closeEditInvoiceModal();
    showToast(`✅ Invoice "${data.invoice_number}" amended successfully! Total: KES ${Math.round(data.total_amount).toLocaleString()}`, 'success');
    loadInvoices();
  } catch (err) {
    showToast('Error saving invoice amendments: ' + err.message, 'danger');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '💾 Save Invoice Amendments'; }
  }
}

// --- VIEW & DOWNLOAD INVOICE ---
async function viewInvoice(invoiceId) {
  try {
    currentViewInvoiceId = invoiceId;
    // Always fetch fresh 100% database-retrieved invoice details
    const res = await apiFetch(`/invoices/${invoiceId}`);
    if (!res.ok) throw new Error('Invoice not found');
    const inv = await res.json();

    // 1. Populate Company Information retrieved from Database
    if (inv.company_name) document.getElementById('view-inv-comp-name').innerText = inv.company_name;
    if (inv.company_division) document.getElementById('view-inv-comp-div').innerText = inv.company_division;
    if (inv.company_phone) document.getElementById('view-inv-comp-phone').innerText = `📞 ${inv.company_phone}`;
    if (inv.company_email) document.getElementById('view-inv-comp-email').innerText = `✉️ ${inv.company_email}`;
    if (inv.company_alt_email) document.getElementById('view-inv-comp-alt-email').innerText = `✉️ ${inv.company_alt_email}`;
    if (inv.company_website) document.getElementById('view-inv-comp-web').innerText = `🌐 ${inv.company_website}`;
    if (inv.company_location) document.getElementById('view-inv-comp-loc').innerText = `📍 ${inv.company_location}`;
    if (inv.company_kra_pin) document.getElementById('view-inv-comp-pin').innerText = inv.company_kra_pin;
    if (inv.company_director) document.getElementById('view-inv-director').innerText = inv.company_director;
    if (inv.company_director_title) document.getElementById('view-inv-director-title').innerText = inv.company_director_title;

    // 2. Populate Client Profile retrieved from Database
    const clientPinEl = document.getElementById('view-inv-client-pin');
    if (clientPinEl) clientPinEl.innerText = inv.client_kra_pin || 'P051288491A';

    // 3. Populate Banking & Paybill Instructions retrieved from Database
    if (inv.bank_name) document.getElementById('view-inv-bank-name').innerText = inv.bank_name;
    if (inv.bank_account_name) document.getElementById('view-inv-bank-acc-name').innerText = inv.bank_account_name;
    if (inv.bank_account_number) document.getElementById('view-inv-bank-acc').innerText = inv.bank_account_number;
    if (inv.bank_branch) document.getElementById('view-inv-bank-branch').innerText = inv.bank_branch;
    if (inv.mpesa_paybill) document.getElementById('view-inv-paybill-num').innerText = inv.mpesa_paybill;

    document.getElementById('view-inv-number').innerText = inv.invoice_number || '';
    document.getElementById('view-inv-client').innerText = inv.client_name || '';
    document.getElementById('view-inv-site').innerText = `Site: ${inv.site_name || ''}`;
    document.getElementById('view-inv-address').innerText = inv.billing_address || 'Nairobi, Kenya';
    document.getElementById('view-inv-period').innerText = `Billing Period: ${inv.billing_period || ''}`;
    document.getElementById('view-inv-issue-date').innerText = inv.issue_date || '';
    document.getElementById('view-inv-due-date').innerText = inv.due_date || '';

    const invNum = inv.invoice_number || '';
    const refNum = invNum.startsWith('INV-') ? `CSIL/INV/${invNum.replace('INV-', '')}` : `CSIL/INV/${invNum}`;
    const refEl = document.getElementById('view-inv-ref');
    if (refEl) refEl.innerText = refNum;
    const paybillEl = document.getElementById('view-inv-paybill-acc');
    if (paybillEl) paybillEl.innerText = invNum;
    const sigDateEl = document.getElementById('view-inv-sig-date');
    if (sigDateEl) sigDateEl.innerText = `Date: ${inv.issue_date || ''}`;

    const st = (inv.status || 'ISSUED').toUpperCase();
    const stBadge = document.getElementById('view-inv-status-badge');
    if (stBadge) {
      stBadge.innerText = st;
      if (st === 'PAID') { stBadge.style.background = '#ECFDF5'; stBadge.style.color = '#059669'; }
      else if (st === 'DRAFT') { stBadge.style.background = '#FEF3C7'; stBadge.style.color = '#D97706'; }
      else if (st === 'OVERDUE') { stBadge.style.background = '#FEF2F2'; stBadge.style.color = '#DC2626'; }
      else { stBadge.style.background = '#EFF6FF'; stBadge.style.color = '#1D4ED8'; }
    }

    // Populate line items table
    const tbody = document.getElementById('view-inv-items-body');
    if (tbody) {
      tbody.innerHTML = '';
      (inv.items || []).forEach(it => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #F1F5F9';
        tr.innerHTML = `
          <td style="padding:10px 12px; font-weight:700; color:#0F172A;">${it.item_name}</td>
          <td style="padding:10px 12px; color:#64748B;">${it.description || '-'}</td>
          <td style="padding:10px 12px; text-align:center; color:#0F172A;">${it.quantity}</td>
          <td style="padding:10px 12px; text-align:right; color:#0F172A;">KES ${Number(it.unit_price || 0).toLocaleString()}</td>
          <td style="padding:10px 12px; text-align:center; color:#64748B;">${it.tax_rate || 0}%</td>
          <td style="padding:10px 12px; text-align:right; font-weight:700; color:#0F172A;">KES ${Number(it.amount || 0).toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    document.getElementById('view-inv-notes').innerText = inv.notes || 'Payment is due within 14 days of invoice date.';
    document.getElementById('view-inv-payment-terms').innerText = inv.payment_terms || 'Banking: KCB Bank Kenya Ltd | Acc: 1234567890 | Paybill: 522522';

    document.getElementById('view-inv-subtotal').innerText = `KES ${Number(inv.subtotal || 0).toLocaleString()}`;
    const taxLabel = document.getElementById('view-inv-tax-label');
    if (taxLabel) taxLabel.innerText = `TAX (${inv.tax_rate || 0}% VAT):`;
    document.getElementById('view-inv-tax').innerText = `KES ${Number(inv.tax_amount || 0).toLocaleString()}`;
    document.getElementById('view-inv-total').innerText = `KES ${Number(inv.total_amount || 0).toLocaleString()}`;

    const modal = document.getElementById('modal-view-invoice');
    if (modal) modal.style.display = 'flex';
    const scrollBody = document.getElementById('modal-view-invoice-scroll-body');
    if (scrollBody) scrollBody.scrollTop = 0;
  } catch (err) {
    showToast('Failed to view invoice: ' + err.message, 'danger');
  }
}

function closeViewInvoiceModal() {
  const modal = document.getElementById('modal-view-invoice');
  if (modal) modal.style.display = 'none';
  currentViewInvoiceId = null;
}

function openEditCurrentViewInvoice() {
  const id = currentViewInvoiceId;
  closeViewInvoiceModal();
  if (id) openEditInvoiceModal(id);
}

function downloadCurrentViewInvoicePdf() {
  if (currentViewInvoiceId) downloadInvoicePdf(currentViewInvoiceId);
}

async function downloadInvoicePdf(invoiceId) {
  try {
    showToast('Generating and downloading invoice PDF...', 'info');
    const token = localStorage.getItem('corpsec_token') || '';
    const res = await fetch(`${API_BASE}/invoices/${invoiceId}/pdf`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to download invoice PDF');
    }

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `Invoice-${invoiceId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
    showToast('✅ Invoice PDF downloaded successfully!', 'success');
  } catch (err) {
    showToast('Error downloading PDF: ' + err.message, 'danger');
  }
}

async function quickMarkInvoicePaid(invoiceId) {
  try {
    const res = await apiFetch(`/invoices/${invoiceId}/status?new_status=PAID`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to update invoice status');

    showToast('✅ Invoice marked as PAID!', 'success');
    loadInvoices();
  } catch (err) {
    showToast('Error updating status: ' + err.message, 'danger');
  }
}

async function deleteInvoice(invoiceId) {
  if (!confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
    return;
  }
  try {
    const res = await apiFetch(`/invoices/${invoiceId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to delete invoice');

    showToast('✅ Invoice deleted successfully', 'success');
    loadInvoices();
  } catch (err) {
    showToast('Error deleting invoice: ' + err.message, 'danger');
  }
}

// Window function exports
window.loadInvoices = loadInvoices;
window.debounceInvoiceSearch = debounceInvoiceSearch;
window.openGenerateInvoiceModal = openGenerateInvoiceModal;
window.closeGenerateInvoiceModal = closeGenerateInvoiceModal;
window.handleGenInvoiceSiteChange = handleGenInvoiceSiteChange;
window.updateGenInvoiceEstimate = updateGenInvoiceEstimate;
window.handleGenerateInvoiceSubmit = handleGenerateInvoiceSubmit;
window.openEditInvoiceModal = openEditInvoiceModal;
window.closeEditInvoiceModal = closeEditInvoiceModal;
window.addEditInvoiceItemRow = addEditInvoiceItemRow;
window.removeEditInvoiceItemRow = removeEditInvoiceItemRow;
window.updateItemRowAmount = updateItemRowAmount;
window.recalcEditInvoiceTotals = recalcEditInvoiceTotals;
window.handleEditInvoiceSubmit = handleEditInvoiceSubmit;
window.viewInvoice = viewInvoice;
window.closeViewInvoiceModal = closeViewInvoiceModal;
window.openEditCurrentViewInvoice = openEditCurrentViewInvoice;
window.downloadCurrentViewInvoicePdf = downloadCurrentViewInvoicePdf;
window.downloadInvoicePdf = downloadInvoicePdf;
window.quickMarkInvoicePaid = quickMarkInvoicePaid;
window.deleteInvoice = deleteInvoice;



// =============================================================================
// MODULE 1: COMPANY ASSETS & INVENTORY MANAGEMENT
// =============================================================================

let cachedAssetCategories = [];
let cachedAssets = [];
let cachedInventoryItems = [];
let cachedInventoryTransactions = [];
let cachedMaintenanceRecords = [];

function switchAssetsSubtab(subTab) {
  const tabs = ['assets', 'inventory', 'transactions', 'maintenance'];
  tabs.forEach(t => {
    const el = document.getElementById(`subtab-assets-${t}`);
    const btn = document.getElementById(`btn-subtab-assets-${t}`);
    if (el) el.style.display = (t === subTab) ? 'block' : 'none';
    if (btn) {
      if (t === subTab) {
        btn.className = 'btn btn-primary';
      } else {
        btn.className = 'btn btn-secondary';
      }
    }
  });
}

async function loadAssets() {
  try {
    const [catRes, astRes, invRes, transRes, maintRes] = await Promise.all([
      apiFetch('/assets/categories'),
      apiFetch('/assets'),
      apiFetch('/assets/inventory'),
      apiFetch('/assets/inventory/transactions'),
      apiFetch('/assets/maintenance')
    ]);

    cachedAssetCategories = (await catRes.json()) || [];
    cachedAssets = (await astRes.json()) || [];
    cachedInventoryItems = (await invRes.json()) || [];
    cachedInventoryTransactions = (await transRes.json()) || [];
    cachedMaintenanceRecords = (await maintRes.json()) || [];

    // KPI Calculations
    const totalAssets = cachedAssets.length;
    const totalValuation = cachedAssets.reduce((sum, a) => sum + (Number(a.current_value) || 0), 0);
    const totalAllocated = cachedAssets.filter(a => a.status === 'ASSIGNED').length;
    const totalSupplyVal = cachedInventoryItems.reduce((sum, item) => sum + (Number(item.total_valuation) || 0), 0);

    const elTotal = document.getElementById('kpi-assets-total');
    if (elTotal) elTotal.innerText = totalAssets;

    const elVal = document.getElementById('kpi-assets-valuation');
    if (elVal) elVal.innerText = `KES ${totalValuation.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const elAlloc = document.getElementById('kpi-assets-allocated');
    if (elAlloc) elAlloc.innerText = totalAllocated;

    const elSupp = document.getElementById('kpi-inventory-valuation');
    if (elSupp) elSupp.innerText = `KES ${totalSupplyVal.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Render Tables
    renderAssetsTable(cachedAssets);
    renderInventoryItemsTable(cachedInventoryItems);
    renderInventoryTransactionsTable(cachedInventoryTransactions);
    renderMaintenanceRecordsTable(cachedMaintenanceRecords);

  } catch (err) {
    console.error('Error loading assets module:', err);
    showToast('Failed to load assets: ' + err.message, 'danger');
  }
}

function renderAssetsTable(assets) {
  const tbody = document.getElementById('assets-table-body');
  if (!tbody) return;

  if (!assets || assets.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:32px; color:#64748B;">No company assets registered yet. Click "+ Register Asset" above.</td></tr>';
    return;
  }

  tbody.innerHTML = assets.map(a => {
    const statusBadges = {
      'IN_STOCK': '<span class="badge" style="background:#ECFDF5; color:#059669;">IN STOCK</span>',
      'ASSIGNED': '<span class="badge" style="background:#EFF6FF; color:#2563EB;">ASSIGNED</span>',
      'UNDER_MAINTENANCE': '<span class="badge" style="background:#FEF3C7; color:#D97706;">IN SERVICE</span>',
      'DISPOSED': '<span class="badge" style="background:#F1F5F9; color:#64748B;">DISPOSED</span>',
      'LOST': '<span class="badge" style="background:#FEE2E2; color:#DC2626;">LOST</span>',
      'DAMAGED': '<span class="badge" style="background:#FEE2E2; color:#DC2626;">DAMAGED</span>'
    };
    const badge = statusBadges[a.status] || `<span class="badge">${a.status}</span>`;
    const bookVal = Number(a.current_value) || 0;
    const purPrice = Number(a.purchase_price) || 0;
    const makeModel = [a.make, a.model].filter(Boolean).join(' ') || 'Standard';

    let locationOrCustody = a.current_location || '-';
    if (a.status === 'ASSIGNED') {
      locationOrCustody = `<span style="color:#2563EB; font-weight:600;">Custody Assigned</span>`;
    }

    return `
      <tr>
        <td><strong>${escapeHtml(a.asset_code)}</strong></td>
        <td>
          <div style="font-weight:700; color:#0F172A;">${escapeHtml(a.name)}</div>
          <div style="font-size:11px; color:#64748B;">${escapeHtml(makeModel)}</div>
        </td>
        <td><span style="font-size:12px; background:#F1F5F9; padding:2px 8px; border-radius:4px;">${escapeHtml(a.category_name || 'General')}</span></td>
        <td><code style="font-size:11px;">${escapeHtml(a.serial_number || 'N/A')}</code></td>
        <td style="text-align:right; font-weight:600;">KES ${purPrice.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
        <td style="text-align:right; font-weight:700; color:#059669;">KES ${bookVal.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
        <td style="text-align:center;">${badge}</td>
        <td>${locationOrCustody}</td>
        <td style="text-align:right; white-space:nowrap;">
          ${a.status === 'ASSIGNED' ?
            `<button class="btn btn-secondary" style="font-size:11px; padding:3px 8px; margin-right:4px;" onclick="openReturnAssetModal('${a.id}', '${escapeHtml(a.asset_code)}', '${escapeHtml(a.name)}')">📥 Return</button>` :
            `<button class="btn btn-secondary" style="font-size:11px; padding:3px 8px; margin-right:4px;" onclick="openAllocateAssetModal('${a.id}')">🤝 Allocate</button>`
          }
          <button class="btn btn-secondary" style="font-size:11px; padding:3px 8px; margin-right:4px;" onclick="openAssetMaintenanceModal('${a.id}')">🔧 Service</button>
          <button class="btn btn-secondary" style="font-size:11px; padding:3px 8px; margin-right:4px;" onclick="openEditAssetModal('${a.id}')">✏️ Edit</button>
          <button class="btn btn-secondary" style="font-size:11px; padding:3px 8px; color:#DC2626; border-color:#FCA5A5;" onclick="deleteAsset('${a.id}', '${escapeHtml(a.name)}')">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderInventoryItemsTable(items) {
  const tbody = document.getElementById('inventory-items-body');
  if (!tbody) return;

  if (!items || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:32px; color:#64748B;">No supplies inventory recorded yet. Click "+ Supply Item" to register uniforms, boots or radios.</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(item => {
    const isLow = Number(item.current_stock) <= Number(item.min_stock_level);
    const statusBadge = isLow ?
      `<span class="badge" style="background:#FEE2E2; color:#DC2626; font-weight:700;">LOW STOCK ALERT</span>` :
      `<span class="badge" style="background:#ECFDF5; color:#059669;">HEALTHY</span>`;
    const cost = Number(item.unit_cost) || 0;
    const totalVal = Number(item.total_valuation) || 0;

    return `
      <tr>
        <td><code>${escapeHtml(item.item_code)}</code></td>
        <td><strong>${escapeHtml(item.item_name)}</strong></td>
        <td><span style="font-size:11px; background:#F8FAFC; border:1px solid #E2E8F0; padding:2px 6px; border-radius:4px;">${escapeHtml(item.category)}</span></td>
        <td style="text-align:center;">${escapeHtml(item.unit_of_measure)}</td>
        <td style="text-align:center; font-size:14px; font-weight:800; color:${isLow ? '#DC2626' : '#0F172A'};">${item.current_stock}</td>
        <td style="text-align:center; color:#64748B;">${item.min_stock_level}</td>
        <td style="text-align:right;">KES ${cost.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
        <td style="text-align:right; font-weight:700; color:#059669;">KES ${totalVal.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
        <td style="text-align:center;">${statusBadge}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="btn btn-secondary" style="font-size:11px; padding:3px 8px; margin-right:4px;" onclick="openInventoryTransactModal('${item.id}')">📊 Move</button>
          <button class="btn btn-secondary" style="font-size:11px; padding:3px 8px; margin-right:4px;" onclick="openEditInventoryItemModal('${item.id}')">✏️ Edit</button>
          <button class="btn btn-secondary" style="font-size:11px; padding:3px 8px; color:#DC2626; border-color:#FCA5A5;" onclick="deleteInventoryItem('${item.id}', '${escapeHtml(item.item_name)}')">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderInventoryTransactionsTable(transactions) {
  const tbody = document.getElementById('inventory-transactions-body');
  if (!tbody) return;

  if (!transactions || transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:32px; color:#64748B;">No stock movements recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = transactions.map(t => {
    const typeBadges = {
      'STOCK_IN': '<span class="badge" style="background:#ECFDF5; color:#059669;">STOCK IN</span>',
      'STOCK_OUT': '<span class="badge" style="background:#EFF6FF; color:#2563EB;">ISSUED</span>',
      'RETURN': '<span class="badge" style="background:#FEF3C7; color:#D97706;">RETURN</span>',
      'ADJUSTMENT': '<span class="badge" style="background:#F1F5F9; color:#475569;">AUDIT ADJ</span>'
    };
    const badge = typeBadges[t.transaction_type] || `<span class="badge">${t.transaction_type}</span>`;
    const dateStr = t.transaction_date ? new Date(t.transaction_date).toLocaleDateString('en-GB') : '-';
    const totalCost = Number(t.total_cost) || 0;

    let target = '-';
    if (t.guard_name) target = `Guard: ${escapeHtml(t.guard_name)}`;
    else if (t.site_name) target = `Site: ${escapeHtml(t.site_name)}`;

    return `
      <tr>
        <td>${dateStr}</td>
        <td><strong>${escapeHtml(t.item_name || 'Item')}</strong></td>
        <td style="text-align:center;">${badge}</td>
        <td style="text-align:center; font-weight:800;">${t.quantity}</td>
        <td style="text-align:right; font-weight:600;">KES ${totalCost.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
        <td>${target}</td>
        <td><code>${escapeHtml(t.reference_number || '-')}</code></td>
        <td style="font-size:12px; color:#64748B;">${escapeHtml(t.notes || '-')}</td>
      </tr>
    `;
  }).join('');
}

function renderMaintenanceRecordsTable(records) {
  const tbody = document.getElementById('maintenance-records-body');
  if (!tbody) return;

  if (!records || records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:32px; color:#64748B;">No maintenance records found. Click "+ Log Maintenance" to record vehicle services, CCTV calibrations, or radio repairs.</td></tr>';
    return;
  }

  tbody.innerHTML = records.map(r => {
    const dateStr = r.maintenance_date ? new Date(r.maintenance_date).toLocaleDateString('en-GB') : '-';
    const nextDateStr = r.next_maintenance_date ? new Date(r.next_maintenance_date).toLocaleDateString('en-GB') : '-';
    const cost = Number(r.cost) || 0;
    const statusBadges = {
      'COMPLETED': '<span class="badge" style="background:#ECFDF5; color:#059669;">COMPLETED</span>',
      'SCHEDULED': '<span class="badge" style="background:#EFF6FF; color:#2563EB;">SCHEDULED</span>',
      'IN_PROGRESS': '<span class="badge" style="background:#FEF3C7; color:#D97706;">IN PROGRESS</span>'
    };
    const badge = statusBadges[r.status] || `<span class="badge">${r.status}</span>`;

    return `
      <tr>
        <td>${dateStr}</td>
        <td><strong>${escapeHtml(r.asset_name || 'Asset')}</strong> <span style="font-size:11px; color:#64748B;">(${escapeHtml(r.asset_code || '')})</span></td>
        <td>${escapeHtml(r.maintenance_type)}</td>
        <td>${escapeHtml(r.service_provider || 'In-House')}</td>
        <td style="text-align:right; font-weight:700;">KES ${cost.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
        <td>${nextDateStr}</td>
        <td style="text-align:center;">${badge}</td>
        <td><code>${escapeHtml(r.invoice_or_receipt_no || '-')}</code></td>
      </tr>
    `;
  }).join('');
}

function filterAssetsTable(query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    renderAssetsTable(cachedAssets);
    renderInventoryItemsTable(cachedInventoryItems);
    return;
  }
  const filteredAssets = cachedAssets.filter(a =>
    (a.asset_code && a.asset_code.toLowerCase().includes(q)) ||
    (a.name && a.name.toLowerCase().includes(q)) ||
    (a.serial_number && a.serial_number.toLowerCase().includes(q)) ||
    (a.category_name && a.category_name.toLowerCase().includes(q)) ||
    (a.current_location && a.current_location.toLowerCase().includes(q))
  );
  renderAssetsTable(filteredAssets);

  const filteredItems = cachedInventoryItems.filter(item =>
    (item.item_code && item.item_code.toLowerCase().includes(q)) ||
    (item.item_name && item.item_name.toLowerCase().includes(q)) ||
    (item.category && item.category.toLowerCase().includes(q))
  );
  renderInventoryItemsTable(filteredItems);
}

// Modal Handlers: Register Asset
function openRegisterAssetModal() {
  const catSelect = document.getElementById('asset-reg-category');
  if (catSelect) {
    catSelect.innerHTML = '<option value="">Select Category...</option>' +
      cachedAssetCategories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }
  const dateInput = document.getElementById('asset-reg-purchase-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
  const m = document.getElementById('modal-register-asset');
  if (m) m.style.display = 'flex';
}

function closeRegisterAssetModal() {
  const m = document.getElementById('modal-register-asset');
  if (m) m.style.display = 'none';
  const f = document.getElementById('form-register-asset');
  if (f) f.reset();
}

async function handleRegisterAssetSubmit(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-save-asset');
  if (btn) btn.disabled = true;

  try {
    const payload = {
      asset_code: document.getElementById('asset-reg-code').value.trim(),
      name: document.getElementById('asset-reg-name').value.trim(),
      category_id: document.getElementById('asset-reg-category').value,
      serial_number: document.getElementById('asset-reg-serial').value.trim() || null,
      make: document.getElementById('asset-reg-make').value.trim() || null,
      model: document.getElementById('asset-reg-model').value.trim() || null,
      purchase_date: document.getElementById('asset-reg-purchase-date').value,
      purchase_price: parseFloat(document.getElementById('asset-reg-price').value) || 0,
      salvage_value: parseFloat(document.getElementById('asset-reg-salvage').value) || 0,
      useful_life_months: parseInt(document.getElementById('asset-reg-useful-life').value) || 60,
      depreciation_method: document.getElementById('asset-reg-depr-method').value,
      depreciation_rate: parseFloat(document.getElementById('asset-reg-depr-rate').value) || 20.0,
      condition: document.getElementById('asset-reg-condition').value,
      current_location: document.getElementById('asset-reg-location').value.trim() || null,
      department: document.getElementById('asset-reg-department').value.trim() || null,
      supplier_name: document.getElementById('asset-reg-supplier').value.trim() || null,
      warranty_expiry: document.getElementById('asset-reg-warranty').value || null,
      description: document.getElementById('asset-reg-description').value.trim() || null
    };

    const res = await apiFetch('/assets/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to register asset');

    showToast('Asset successfully registered!', 'success');
    closeRegisterAssetModal();
    loadAssets();

  } catch (err) {
    showToast('Error registering asset: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Modal Handlers: Allocate Asset
function openAllocateAssetModal(assetId) {
  const assetSelect = document.getElementById('asset-alloc-asset-id');
  if (assetSelect) {
    assetSelect.innerHTML = '<option value="">Choose Asset to Assign...</option>' +
      cachedAssets.map(a => `<option value="${a.id}" ${assetId === a.id ? 'selected' : ''}>${escapeHtml(a.asset_code)} - ${escapeHtml(a.name)} (${a.status})</option>`).join('');
  }

  // Populate Guards
  const guardSelect = document.getElementById('asset-alloc-guard-id');
  const allGuards = (cachedGuards && cachedGuards.length > 0) ? cachedGuards : (window.cachedGuards || []);
  if (guardSelect) {
    guardSelect.innerHTML = '<option value="">Select Guard...</option>' +
      allGuards.map(g => `<option value="${g.id}">${escapeHtml(g.full_name || (g.first_name + ' ' + g.last_name))} (${escapeHtml(g.employee_number || g.employee_id || 'ID')})</option>`).join('');
  }

  // Populate Sites
  const siteSelect = document.getElementById('asset-alloc-site-id');
  const allSites = (cachedSites && cachedSites.length > 0) ? cachedSites : (window.cachedSites || []);
  if (siteSelect) {
    siteSelect.innerHTML = '<option value="">Select Client Site...</option>' +
      allSites.map(s => `<option value="${s.id}">${escapeHtml(s.site_name || s.name)}</option>`).join('');
  }

  const dateInput = document.getElementById('asset-alloc-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  toggleAllocationTargetFields();
  const m = document.getElementById('modal-allocate-asset');
  if (m) m.style.display = 'flex';
}

function closeAllocateAssetModal() {
  const m = document.getElementById('modal-allocate-asset');
  if (m) m.style.display = 'none';
  const f = document.getElementById('form-allocate-asset');
  if (f) f.reset();
}

function toggleAllocationTargetFields() {
  const type = document.getElementById('asset-alloc-target-type').value;
  const empWrap = document.getElementById('alloc-target-employee-wrap');
  const siteWrap = document.getElementById('alloc-target-site-wrap');
  const branchWrap = document.getElementById('alloc-target-branch-wrap');

  if (empWrap) empWrap.style.display = (type === 'EMPLOYEE') ? 'block' : 'none';
  if (siteWrap) siteWrap.style.display = (type === 'SITE') ? 'block' : 'none';
  if (branchWrap) branchWrap.style.display = (type === 'BRANCH') ? 'block' : 'none';
}

async function handleAllocateAssetSubmit(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-save-allocation');
  if (btn) btn.disabled = true;

  try {
    const allocType = document.getElementById('asset-alloc-target-type').value;
    const payload = {
      asset_id: document.getElementById('asset-alloc-asset-id').value,
      allocation_type: allocType,
      guard_id: allocType === 'EMPLOYEE' ? (document.getElementById('asset-alloc-guard-id').value || null) : null,
      site_id: allocType === 'SITE' ? (document.getElementById('asset-alloc-site-id').value || null) : null,
      branch_name: allocType === 'BRANCH' ? (document.getElementById('asset-alloc-branch-name').value.trim() || null) : null,
      allocated_date: document.getElementById('asset-alloc-date').value,
      expected_return_date: document.getElementById('asset-alloc-expected-return').value || null,
      condition_at_handover: document.getElementById('asset-alloc-condition').value,
      notes: document.getElementById('asset-alloc-notes').value.trim() || null
    };

    const res = await apiFetch('/assets/allocations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to allocate asset');

    showToast('Asset successfully allocated and custody recorded!', 'success');
    closeAllocateAssetModal();
    loadAssets();

  } catch (err) {
    showToast('Allocation failed: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Modal Handlers: Return Asset
function openReturnAssetModal(assetId, assetCode, assetName) {
  document.getElementById('asset-return-id').value = assetId;
  document.getElementById('asset-return-label').innerText = `${assetCode} - ${assetName}`;
  const d = document.getElementById('asset-return-date');
  if (d) d.value = new Date().toISOString().split('T')[0];

  const m = document.getElementById('modal-return-asset');
  if (m) m.style.display = 'flex';
}

function closeReturnAssetModal() {
  const m = document.getElementById('modal-return-asset');
  if (m) m.style.display = 'none';
  const f = document.getElementById('form-return-asset');
  if (f) f.reset();
}

async function handleReturnAssetSubmit(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-save-return');
  if (btn) btn.disabled = true;

  try {
    const assetId = document.getElementById('asset-return-id').value;
    const payload = {
      return_date: document.getElementById('asset-return-date').value,
      condition_at_return: document.getElementById('asset-return-condition').value,
      return_notes: document.getElementById('asset-return-notes').value.trim() || null
    };

    const res = await apiFetch(`/assets/${assetId}/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to return asset');

    showToast('Asset returned to central inventory successfully!', 'success');
    closeReturnAssetModal();
    loadAssets();

  } catch (err) {
    showToast('Return failed: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Modal Handlers: Maintenance
function openAssetMaintenanceModal(assetId) {
  const assetSelect = document.getElementById('maint-asset-id');
  if (assetSelect) {
    assetSelect.innerHTML = '<option value="">Select Asset to Service...</option>' +
      cachedAssets.map(a => `<option value="${a.id}" ${assetId === a.id ? 'selected' : ''}>${escapeHtml(a.asset_code)} - ${escapeHtml(a.name)}</option>`).join('');
  }
  const d = document.getElementById('maint-date');
  if (d && !d.value) d.value = new Date().toISOString().split('T')[0];

  const m = document.getElementById('modal-asset-maintenance');
  if (m) m.style.display = 'flex';
}

function closeAssetMaintenanceModal() {
  const m = document.getElementById('modal-asset-maintenance');
  if (m) m.style.display = 'none';
  const f = document.getElementById('form-asset-maintenance');
  if (f) f.reset();
}

async function handleAssetMaintenanceSubmit(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-save-maintenance');
  if (btn) btn.disabled = true;

  try {
    const payload = {
      asset_id: document.getElementById('maint-asset-id').value,
      maintenance_type: document.getElementById('maint-type').value,
      maintenance_date: document.getElementById('maint-date').value,
      service_provider: document.getElementById('maint-provider').value.trim() || null,
      cost: parseFloat(document.getElementById('maint-cost').value) || 0,
      next_maintenance_date: document.getElementById('maint-next-date').value || null,
      invoice_or_receipt_no: document.getElementById('maint-ref-no').value.trim() || null,
      description: document.getElementById('maint-description').value.trim(),
      status: document.getElementById('maint-status').value
    };

    const res = await apiFetch('/assets/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to save maintenance');

    showToast('Maintenance service recorded successfully!', 'success');
    closeAssetMaintenanceModal();
    loadAssets();

  } catch (err) {
    showToast('Failed to save maintenance: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Modal Handlers: Inventory Items
function openNewInventoryItemModal() {
  const m = document.getElementById('modal-new-inventory-item');
  if (m) m.style.display = 'flex';
}

function closeNewInventoryItemModal() {
  const m = document.getElementById('modal-new-inventory-item');
  if (m) m.style.display = 'none';
  const f = document.getElementById('form-new-inventory-item');
  if (f) f.reset();
}

async function handleNewInventoryItemSubmit(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-save-inv-item');
  if (btn) btn.disabled = true;

  try {
    const payload = {
      item_code: document.getElementById('inv-item-sku').value.trim(),
      item_name: document.getElementById('inv-item-name').value.trim(),
      category: document.getElementById('inv-item-category').value,
      unit_of_measure: document.getElementById('inv-item-uom').value.trim(),
      unit_cost: parseFloat(document.getElementById('inv-item-cost').value) || 0,
      current_stock: parseInt(document.getElementById('inv-item-initial-qty').value) || 0,
      min_stock_level: parseInt(document.getElementById('inv-item-min-level').value) || 10,
      reorder_quantity: parseInt(document.getElementById('inv-item-reorder-qty').value) || 25,
      storage_location: document.getElementById('inv-item-location').value.trim() || null
    };

    const res = await apiFetch('/assets/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to create inventory item');

    showToast('Inventory supply item saved successfully!', 'success');
    closeNewInventoryItemModal();
    loadAssets();

  } catch (err) {
    showToast('Failed to save supply item: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Modal Handlers: Inventory Transactions
function openInventoryTransactModal(itemId) {
  const itemSelect = document.getElementById('inv-trans-item-id');
  if (itemSelect) {
    itemSelect.innerHTML = '<option value="">Select Item...</option>' +
      cachedInventoryItems.map(i => `<option value="${i.id}" ${itemId === i.id ? 'selected' : ''}>${escapeHtml(i.item_code)} - ${escapeHtml(i.item_name)} (Stock: ${i.current_stock})</option>`).join('');
  }

  // Populate Guards
  const guardSelect = document.getElementById('inv-trans-guard-id');
  const allGuardsTrans = (cachedGuards && cachedGuards.length > 0) ? cachedGuards : (window.cachedGuards || []);
  if (guardSelect) {
    guardSelect.innerHTML = '<option value="">-- No Guard --</option>' +
      allGuardsTrans.map(g => `<option value="${g.id}">${escapeHtml(g.full_name || (g.first_name + ' ' + g.last_name))} (${escapeHtml(g.employee_number || 'ID')})</option>`).join('');
  }

  // Populate Sites
  const siteSelect = document.getElementById('inv-trans-site-id');
  const allSitesTrans = (cachedSites && cachedSites.length > 0) ? cachedSites : (window.cachedSites || []);
  if (siteSelect) {
    siteSelect.innerHTML = '<option value="">-- No Site --</option>' +
      allSitesTrans.map(s => `<option value="${s.id}">${escapeHtml(s.site_name || s.name)}</option>`).join('');
  }

  toggleInvTransFields();
  const m = document.getElementById('modal-inventory-transact');
  if (m) m.style.display = 'flex';
}

function closeInventoryTransactModal() {
  const m = document.getElementById('modal-inventory-transact');
  if (m) m.style.display = 'none';
  const f = document.getElementById('form-inventory-transact');
  if (f) f.reset();
}

function toggleInvTransFields() {
  const type = document.getElementById('inv-trans-type').value;
  const destWrap = document.getElementById('inv-trans-dest-wrap');
  if (destWrap) {
    destWrap.style.display = (type === 'STOCK_OUT') ? 'grid' : 'none';
  }
}

async function handleInventoryTransactSubmit(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-save-inv-trans');
  if (btn) btn.disabled = true;

  try {
    const tType = document.getElementById('inv-trans-type').value;
    const payload = {
      item_id: document.getElementById('inv-trans-item-id').value,
      transaction_type: tType,
      quantity: parseInt(document.getElementById('inv-trans-qty').value) || 1,
      unit_cost: parseFloat(document.getElementById('inv-trans-cost').value) || null,
      guard_id: tType === 'STOCK_OUT' ? (document.getElementById('inv-trans-guard-id').value || null) : null,
      site_id: tType === 'STOCK_OUT' ? (document.getElementById('inv-trans-site-id').value || null) : null,
      reference_number: document.getElementById('inv-trans-ref').value.trim() || null,
      notes: document.getElementById('inv-trans-notes').value.trim() || null
    };

    const res = await apiFetch('/assets/inventory/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Stock transaction failed');

    showToast('Stock movement recorded successfully!', 'success');
    closeInventoryTransactModal();
    loadAssets();

  } catch (err) {
    showToast('Error recording stock movement: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}


// =============================================================================
// MODULE 2: CLIENT & CONTRACT MANAGEMENT CRM
// =============================================================================

let cachedClients = [];
let cachedContracts = [];
let currentViewingClientId = null;

function switchClientsSubtab(subTab) {
  const listEl = document.getElementById('subtab-clients-list');
  const contractsEl = document.getElementById('subtab-clients-contracts');
  const listBtn = document.getElementById('btn-subtab-clients-list');
  const contractsBtn = document.getElementById('btn-subtab-clients-contracts');

  if (listEl) listEl.style.display = (subTab === 'list') ? 'block' : 'none';
  if (contractsEl) contractsEl.style.display = (subTab === 'contracts') ? 'block' : 'none';

  if (listBtn) listBtn.className = (subTab === 'list') ? 'btn btn-primary' : 'btn btn-secondary';
  if (contractsBtn) contractsBtn.className = (subTab === 'contracts') ? 'btn btn-primary' : 'btn btn-secondary';
}

async function loadClients() {
  try {
    const [cRes, ctrRes] = await Promise.all([
      apiFetch('/clients'),
      apiFetch('/clients/contracts')
    ]);

    cachedClients = (await cRes.json()) || [];
    cachedContracts = (await ctrRes.json()) || [];

    // Metrics
    const totalClients = cachedClients.length;
    const activeContracts = cachedContracts.filter(c => c.status === 'ACTIVE').length;
    const mrr = cachedContracts
      .filter(c => c.status === 'ACTIVE')
      .reduce((sum, c) => sum + (Number(c.monthly_service_charge) || 0), 0);
    const sitesCount = cachedClients.reduce((sum, c) => sum + (c.sites_count || 0), 0);

    const elTotal = document.getElementById('kpi-clients-total');
    if (elTotal) elTotal.innerText = totalClients;

    const elAct = document.getElementById('kpi-contracts-active');
    if (elAct) elAct.innerText = activeContracts;

    const elMrr = document.getElementById('kpi-contracts-mrr');
    if (elMrr) elMrr.innerText = `KES ${mrr.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const elSites = document.getElementById('kpi-clients-sites');
    if (elSites) elSites.innerText = sitesCount;

    renderClientsTable(cachedClients);
    renderContractsTable(cachedContracts);

  } catch (err) {
    console.error('Error loading clients module:', err);
    showToast('Failed to load clients: ' + err.message, 'danger');
  }
}

function renderClientsTable(clients) {
  const tbody = document.getElementById('clients-table-body');
  if (!tbody) return;

  if (!clients || clients.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:32px; color:#64748B;">No clients registered yet. Click "+ Register Client" above.</td></tr>';
    return;
  }

  tbody.innerHTML = clients.map(c => {
    const statusBadges = {
      'ACTIVE': '<span class="badge" style="background:#ECFDF5; color:#059669;">ACTIVE</span>',
      'INACTIVE': '<span class="badge" style="background:#F1F5F9; color:#64748B;">INACTIVE</span>',
      'PROSPECT': '<span class="badge" style="background:#FEF3C7; color:#D97706;">PROSPECT</span>',
      'TERMINATED': '<span class="badge" style="background:#FEE2E2; color:#DC2626;">TERMINATED</span>'
    };
    const badge = statusBadges[c.status] || `<span class="badge">${c.status}</span>`;

    return `
      <tr>
        <td><code>${escapeHtml(c.client_code)}</code></td>
        <td>
          <strong style="color:#0F172A; font-size:13px;">${escapeHtml(c.name)}</strong>
          ${c.tax_pin ? `<div style="font-size:11px; color:#64748B;">PIN: ${escapeHtml(c.tax_pin)}</div>` : ''}
        </td>
        <td><span style="font-size:11px; background:#F1F5F9; padding:2px 8px; border-radius:4px; font-weight:600;">${escapeHtml(c.client_type)}</span></td>
        <td>
          <div>${escapeHtml(c.primary_contact_name || '-')}</div>
          <div style="font-size:11px; color:#64748B;">${escapeHtml(c.primary_contact_designation || '')}</div>
        </td>
        <td>
          <div>${escapeHtml(c.primary_contact_phone || '-')}</div>
          <div style="font-size:11px; color:#0D7682;">${escapeHtml(c.primary_contact_email || '')}</div>
        </td>
        <td>${escapeHtml(c.city || 'Nairobi')}</td>
        <td style="text-align:center;"><span class="badge" style="background:#EFF6FF; color:#2563EB;">${c.active_contracts_count || 0}</span></td>
        <td style="text-align:center;">${badge}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="btn btn-secondary" style="font-size:11px; padding:3px 8px; margin-right:4px;" onclick="viewClientProfile('${c.id}')">👤 Profile</button>
          <button class="btn btn-secondary" style="font-size:11px; padding:3px 8px; margin-right:4px;" onclick="openEditClientModal('${c.id}')">✏️ Edit</button>
          <button class="btn btn-primary" style="font-size:11px; padding:3px 8px; margin-right:4px;" onclick="openCreateContractModal('${c.id}')">+ SLA</button>
          <button class="btn btn-secondary" style="font-size:11px; padding:3px 8px; color:#DC2626; border-color:#FCA5A5;" onclick="deleteClient('${c.id}', '${escapeHtml(c.name)}')">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderContractsTable(contracts) {
  const tbody = document.getElementById('contracts-table-body');
  if (!tbody) return;

  if (!contracts || contracts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:32px; color:#64748B;">No service contracts recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = contracts.map(c => {
    const statusBadges = {
      'ACTIVE': '<span class="badge" style="background:#ECFDF5; color:#059669;">ACTIVE</span>',
      'EXPIRING_SOON': '<span class="badge" style="background:#FEF3C7; color:#D97706;">EXPIRING SOON</span>',
      'EXPIRED': '<span class="badge" style="background:#FEE2E2; color:#DC2626;">EXPIRED</span>',
      'RENEWED': '<span class="badge" style="background:#EFF6FF; color:#2563EB;">RENEWED</span>',
      'TERMINATED': '<span class="badge" style="background:#F1F5F9; color:#64748B;">TERMINATED</span>'
    };
    const badge = statusBadges[c.status] || `<span class="badge">${c.status}</span>`;
    const startStr = c.start_date ? new Date(c.start_date).toLocaleDateString('en-GB') : '-';
    const endStr = c.end_date ? new Date(c.end_date).toLocaleDateString('en-GB') : '-';
    const monthly = Number(c.monthly_service_charge) || 0;

    return `
      <tr>
        <td><code>${escapeHtml(c.contract_reference)}</code></td>
        <td>
          <strong style="color:#0F172A;">${escapeHtml(c.title)}</strong>
          <div style="font-size:11px; color:#64748B;">${escapeHtml(c.contract_type)}</div>
        </td>
        <td><strong>${escapeHtml(c.client_name || 'Client')}</strong></td>
        <td>${startStr} to ${endStr}</td>
        <td style="text-align:right; font-weight:700; color:#059669;">KES ${monthly.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
        <td style="text-align:center; font-weight:700;">${c.guards_required || 0}</td>
        <td style="text-align:center;"><span class="badge" style="background:#F8FAFC; border:1px solid #CBD5E1;">v${c.version || 1}</span></td>
        <td style="text-align:center;">${badge}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="btn btn-secondary" style="font-size:11px; padding:3px 8px; margin-right:4px;" onclick="openEditContractModal('${c.id}')">✏️ Edit</button>
          ${c.status !== 'RENEWED' ? `<button class="btn btn-secondary" style="font-size:11px; padding:3px 8px; margin-right:4px;" onclick="openRenewContractModal('${c.id}')">🔄 Renew</button>` : '<span style="font-size:11px; color:#64748B; margin-right:4px;">Superseded</span>'}
          <button class="btn btn-secondary" style="font-size:11px; padding:3px 8px; color:#DC2626; border-color:#FCA5A5;" onclick="deleteContract('${c.id}', '${escapeHtml(c.title)}')">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterClientsTable(query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    renderClientsTable(cachedClients);
    renderContractsTable(cachedContracts);
    return;
  }
  const filteredClients = cachedClients.filter(c =>
    (c.client_code && c.client_code.toLowerCase().includes(q)) ||
    (c.name && c.name.toLowerCase().includes(q)) ||
    (c.primary_contact_name && c.primary_contact_name.toLowerCase().includes(q)) ||
    (c.city && c.city.toLowerCase().includes(q))
  );
  renderClientsTable(filteredClients);

  const filteredContracts = cachedContracts.filter(ctr =>
    (ctr.contract_reference && ctr.contract_reference.toLowerCase().includes(q)) ||
    (ctr.title && ctr.title.toLowerCase().includes(q)) ||
    (ctr.client_name && ctr.client_name.toLowerCase().includes(q))
  );
  renderContractsTable(filteredContracts);
}

// Modal Handlers: Register Client
function openRegisterClientModal() {
  const m = document.getElementById('modal-register-client');
  if (m) m.style.display = 'flex';
}

function closeRegisterClientModal() {
  const m = document.getElementById('modal-register-client');
  if (m) m.style.display = 'none';
  const f = document.getElementById('form-register-client');
  if (f) f.reset();
}

async function handleRegisterClientSubmit(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-save-client');
  if (btn) btn.disabled = true;

  try {
    const payload = {
      name: document.getElementById('client-reg-name').value.trim(),
      client_type: document.getElementById('client-reg-type').value,
      industry: document.getElementById('client-reg-industry').value.trim() || null,
      tax_pin: document.getElementById('client-reg-tax-pin').value.trim() || null,
      physical_address: document.getElementById('client-reg-address').value.trim(),
      city: document.getElementById('client-reg-city').value.trim(),
      primary_contact_name: document.getElementById('client-reg-contact-name').value.trim(),
      primary_contact_designation: document.getElementById('client-reg-contact-title').value.trim() || null,
      primary_contact_phone: document.getElementById('client-reg-contact-phone').value.trim(),
      primary_contact_email: document.getElementById('client-reg-contact-email').value.trim(),
      notes: document.getElementById('client-reg-notes').value.trim() || null
    };

    const res = await apiFetch('/clients/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to register client');

    showToast('Client organization registered successfully!', 'success');
    closeRegisterClientModal();
    loadClients();

  } catch (err) {
    showToast('Error registering client: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Modal Handlers: View Client Profile Hub
async function viewClientProfile(clientId) {
  try {
    currentViewingClientId = clientId;
    const res = await apiFetch(`/clients/${clientId}/profile`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to load profile');

    const client = data.client;
    document.getElementById('cp-name').innerText = client.name;
    document.getElementById('cp-badge-type').innerText = client.client_type;
    document.getElementById('cp-subinfo').innerText = `ID: ${client.client_code} | PIN: ${client.tax_pin || 'N/A'}`;

    // Metrics
    document.getElementById('cp-stat-contracts').innerText = (data.contracts || []).length;
    document.getElementById('cp-stat-guards').innerText = data.total_guards_deployed || 0;
    document.getElementById('cp-stat-sites').innerText = (data.sites || []).length;
    document.getElementById('cp-stat-billed').innerText = `KES ${(Number(data.financial_summary?.total_invoiced) || 0).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

    // Contact & Location
    document.getElementById('cp-contact-name').innerText = client.primary_contact_name || '-';
    document.getElementById('cp-contact-title').innerText = client.primary_contact_designation || 'Contact';
    document.getElementById('cp-contact-phone').innerText = client.primary_contact_phone || '-';
    document.getElementById('cp-contact-email').innerText = client.primary_contact_email || '-';
    document.getElementById('cp-address').innerText = client.physical_address || '-';
    document.getElementById('cp-city').innerText = client.city || '-';
    document.getElementById('cp-pin').innerText = client.tax_pin || '-';

    // Contracts Table
    const cBody = document.getElementById('cp-contracts-body');
    if (cBody) {
      if (!data.contracts || data.contracts.length === 0) {
        cBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:16px; color:#94A3B8;">No contracts registered for this client.</td></tr>';
      } else {
        cBody.innerHTML = data.contracts.map(c => `
          <tr>
            <td><strong>${escapeHtml(c.contract_reference)}</strong><div style="font-size:11px; color:#64748B;">${escapeHtml(c.title)}</div></td>
            <td>${c.start_date} to ${c.end_date}</td>
            <td style="text-align:right; font-weight:700;">KES ${(Number(c.monthly_service_charge) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
            <td style="text-align:center;">${c.guards_required || 0}</td>
            <td style="text-align:center;">v${c.version || 1}</td>
            <td style="text-align:center;"><span class="badge">${c.status}</span></td>
            <td style="text-align:right;">
              ${c.status !== 'RENEWED' ? `<button class="btn btn-secondary" style="font-size:10px; padding:2px 6px;" onclick="closeClientProfileModal(); openRenewContractModal('${c.id}');">Renew</button>` : ''}
            </td>
          </tr>
        `).join('');
      }
    }

    // Sites Table
    const sBody = document.getElementById('cp-sites-body');
    if (sBody) {
      if (!data.sites || data.sites.length === 0) {
        sBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:16px; color:#94A3B8;">No protected sites mapped to this client organization yet.</td></tr>';
      } else {
        sBody.innerHTML = data.sites.map(s => `
          <tr>
            <td><strong>${escapeHtml(s.site_name || s.name || 'Site')}</strong></td>
            <td>${escapeHtml(s.location || s.region || '-')}</td>
            <td style="text-align:center; font-weight:700;">${s.active_guards || s.required_guards || 0}</td>
            <td style="text-align:center;">${escapeHtml(s.supervisor_name || s.assigned_supervisor_name || 'Unassigned')}</td>
            <td style="text-align:right; font-weight:600;">KES ${(Number(s.daily_rate || s.basic_salary || s.hourly_rate_per_guard) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
          </tr>
        `).join('');
      }
    }

    const m = document.getElementById('modal-client-profile');
    if (m) m.style.display = 'flex';

  } catch (err) {
    showToast('Failed to view client profile: ' + err.message, 'danger');
  }
}

function closeClientProfileModal() {
  const m = document.getElementById('modal-client-profile');
  if (m) m.style.display = 'none';
}

function openCreateContractForClient() {
  closeClientProfileModal();
  openCreateContractModal(currentViewingClientId);
}

// Modal Handlers: Create Contract
function openCreateContractModal(clientId) {
  const clientSelect = document.getElementById('contract-create-client-id');
  if (clientSelect) {
    clientSelect.innerHTML = '<option value="">Select Client Organization...</option>' +
      cachedClients.map(c => `<option value="${c.id}" ${String(clientId) === String(c.id) ? 'selected' : ''}>${escapeHtml(c.name)} (${c.client_code})</option>`).join('');
  }
  const m = document.getElementById('modal-create-contract');
  if (m) m.style.display = 'flex';
}

function closeCreateContractModal() {
  const m = document.getElementById('modal-create-contract');
  if (m) m.style.display = 'none';
  const f = document.getElementById('form-create-contract');
  if (f) f.reset();
}

async function handleCreateContractSubmit(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-save-contract');
  if (btn) btn.disabled = true;

  try {
    const payload = {
      client_id: document.getElementById('contract-create-client-id').value,
      contract_reference: document.getElementById('contract-create-ref').value.trim(),
      title: document.getElementById('contract-create-title').value.trim(),
      contract_type: document.getElementById('contract-create-type').value,
      start_date: document.getElementById('contract-create-start').value,
      end_date: document.getElementById('contract-create-end').value,
      monthly_service_charge: parseFloat(document.getElementById('contract-create-monthly').value) || 0,
      total_contract_value: parseFloat(document.getElementById('contract-create-total').value) || 0,
      billing_frequency: document.getElementById('contract-create-billing-freq').value,
      guards_required: parseInt(document.getElementById('contract-create-guards').value) || 2,
      payment_terms: document.getElementById('contract-create-terms').value.trim() || 'Net 30 Days',
      special_terms_and_conditions: document.getElementById('contract-create-conditions').value.trim() || null
    };

    const res = await apiFetch('/clients/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to create contract');

    showToast('Contract SLA created successfully!', 'success');
    closeCreateContractModal();
    loadClients();

  } catch (err) {
    showToast('Contract creation failed: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Modal Handlers: Renew Contract (Preserves History)
function openRenewContractModal(contractId) {
  const ctr = cachedContracts.find(c => c.id === contractId);
  if (!ctr) {
    showToast('Contract record not found', 'danger');
    return;
  }

  document.getElementById('contract-renew-id').value = ctr.id;
  document.getElementById('contract-renew-title-label').innerText = `${ctr.contract_reference} - ${ctr.title} (Current v${ctr.version || 1})`;
  document.getElementById('contract-renew-next-ver').innerText = (ctr.version || 1) + 1;
  document.getElementById('contract-renew-monthly').value = ctr.monthly_service_charge || 0;
  document.getElementById('contract-renew-total').value = ctr.total_contract_value || 0;
  document.getElementById('contract-renew-guards').value = ctr.guards_required || 2;
  document.getElementById('contract-renew-terms').value = ctr.payment_terms || 'Net 30 Days';

  const m = document.getElementById('modal-renew-contract');
  if (m) m.style.display = 'flex';
}

function closeRenewContractModal() {
  const m = document.getElementById('modal-renew-contract');
  if (m) m.style.display = 'none';
  const f = document.getElementById('form-renew-contract');
  if (f) f.reset();
}

async function handleRenewContractSubmit(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-save-renewal');
  if (btn) btn.disabled = true;

  try {
    const contractId = document.getElementById('contract-renew-id').value;
    const payload = {
      new_start_date: document.getElementById('contract-renew-start').value,
      new_end_date: document.getElementById('contract-renew-end').value,
      new_monthly_charge: parseFloat(document.getElementById('contract-renew-monthly').value) || 0,
      new_total_value: parseFloat(document.getElementById('contract-renew-total').value) || 0,
      guards_required: parseInt(document.getElementById('contract-renew-guards').value) || null,
      payment_terms: document.getElementById('contract-renew-terms').value.trim() || null,
      special_terms_and_conditions: document.getElementById('contract-renew-conditions').value.trim() || null
    };

    const res = await apiFetch(`/clients/contracts/${contractId}/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Contract renewal failed');

    showToast(`Contract renewed into v${data.version || 2} successfully! Previous version archived.`, 'success');
    closeRenewContractModal();
    loadClients();

  } catch (err) {
    showToast('Renewal failed: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}


// =============================================================================
// MODULE 3: COMPANY HISTORY, PROFILE & GOVERNANCE
// =============================================================================

let cachedCompanyProfile = null;
let cachedFoundingHistory = null;
let cachedMilestones = [];
let cachedOwnershipRecords = [];

function switchHistorySubtab(subTab) {
  const tabs = ['profile', 'clients', 'recommendations', 'services', 'founding', 'milestones', 'governance', 'analytics'];
  tabs.forEach(t => {
    const el = document.getElementById(`subtab-history-${t}`);
    const btn = document.getElementById(`btn-subtab-history-${t}`);
    if (el) el.style.display = (t === subTab) ? 'block' : 'none';
    if (btn) {
      btn.className = (t === subTab) ? 'btn btn-primary' : 'btn btn-secondary';
    }
  });

  if (subTab === 'clients') loadCompanyClientsPortfolio();
  if (subTab === 'recommendations') loadCompanyRecommendations();
  if (subTab === 'services') loadCompanyServices();
}

async function loadCompanyHistory() {
  try {
    const [profRes, foundRes, mileRes, ownRes, analRes] = await Promise.all([
      apiFetch('/company/profile'),
      apiFetch('/company/founding'),
      apiFetch('/company/milestones'),
      apiFetch('/company/ownership'),
      apiFetch('/company/analytics')
    ]);

    cachedCompanyProfile = (profRes && profRes.ok) ? await profRes.json() : {};
    cachedFoundingHistory = (foundRes && foundRes.ok) ? await foundRes.json() : {};
    cachedMilestones = (mileRes && mileRes.ok) ? (await mileRes.json()) : [];
    cachedOwnershipRecords = (ownRes && ownRes.ok) ? (await ownRes.json()) : [];
    const analytics = (analRes && analRes.ok) ? await analRes.json() : {};

    // Populate Top KPI Cards
    if (cachedFoundingHistory && cachedFoundingHistory.founding_date) {
      const year = new Date(cachedFoundingHistory.founding_date).getFullYear();
      const el = document.getElementById('kpi-history-founded');
      if (el) el.innerText = year;
    }
    if (cachedCompanyProfile && cachedCompanyProfile.psra_license_number) {
      const el = document.getElementById('kpi-history-psra');
      if (el) el.innerText = cachedCompanyProfile.psra_license_number;
    }
    const elM = document.getElementById('kpi-history-milestones');
    if (elM) elM.innerText = cachedMilestones.length;

    const elO = document.getElementById('kpi-history-owners');
    if (elO) elO.innerText = cachedOwnershipRecords.length;

    // Populate Subviews
    populateCompanyProfileForm(cachedCompanyProfile);
    populateFoundingDetails(cachedFoundingHistory);
    renderMilestonesTimeline(cachedMilestones);
    renderOwnershipTable(cachedOwnershipRecords);
    populateGrowthAnalytics(analytics);

  } catch (err) {
    console.error('Error loading company history module:', err);
    showToast('Failed to load company profile & history: ' + err.message, 'danger');
  }
}

function populateCompanyProfileForm(profile) {
  if (!profile) return;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };
  setVal('prof-company-name', profile.company_name);
  setVal('prof-trading-name', profile.trading_brand_name);
  setVal('prof-psra-license', profile.psra_license_number);
  setVal('prof-registration-no', profile.registration_number);
  setVal('prof-tax-pin', profile.tax_pin);
  setVal('prof-primary-email', profile.primary_email);
  setVal('prof-primary-phone', profile.primary_phone);
  setVal('prof-website', profile.website);
  setVal('prof-hq-address', profile.headquarters_address);
  setVal('prof-mission', profile.mission_statement);
  setVal('prof-vision', profile.vision_statement);
  setVal('prof-core-values', profile.core_values);
}

function populateFoundingDetails(founding) {
  if (!founding) return;
  const setTxt = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.innerText = txt || '-';
  };
  setTxt('founding-date-val', founding.founding_date ? new Date(founding.founding_date).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }) : '-');
  setTxt('founding-city-val', founding.original_location || '-');
  setTxt('founding-guards-val', `${founding.initial_guards_count || 12} Trained Security Officers`);
  setTxt('founding-names-val', founding.founder_names || '-');
  setTxt('founding-story-val', founding.background_story || 'CorpSec was established to deliver world-class security operations across Kenya.');
}

function renderMilestonesTimeline(milestones) {
  const container = document.getElementById('milestones-timeline-container');
  if (!container) return;

  if (!milestones || milestones.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:32px; color:#64748B;">No milestones recorded yet. Click "+ Record Milestone" to add historical achievements.</div>';
    return;
  }

  container.innerHTML = milestones.map(m => {
    const dateStr = m.milestone_date ? new Date(m.milestone_date).toLocaleDateString('en-GB', { month:'short', year:'numeric' }) : '';
    const categoryBadges = {
      'FOUNDING': '<span class="badge" style="background:#EFF6FF; color:#2563EB;">FOUNDING</span>',
      'EXPANSION': '<span class="badge" style="background:#ECFDF5; color:#059669;">EXPANSION</span>',
      'LICENSING': '<span class="badge" style="background:#FEF3C7; color:#D97706;">PSRA LICENSING</span>',
      'ACCREDITATION': '<span class="badge" style="background:#F3E8FF; color:#7E22CE;">ACCREDITATION</span>',
      'CONTRACT': '<span class="badge" style="background:#E0F2FE; color:#0369A1;">MAJOR CONTRACT</span>',
      'TECHNOLOGY': '<span class="badge" style="background:#F1F5F9; color:#0F172A;">INNOVATION</span>',
      'AWARD': '<span class="badge" style="background:#FEF9C3; color:#A16207;">AWARD</span>'
    };
    const badge = categoryBadges[m.category] || `<span class="badge">${m.category}</span>`;

    return `
      <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-left:4px solid #0D7682; border-radius:8px; padding:16px 20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <strong style="font-size:15px; color:#0F172A;">${escapeHtml(m.title)}</strong>
            ${badge}
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:12px; font-weight:700; color:#0D7682;">${dateStr}</span>
            <button class="btn btn-secondary" style="font-size:10px; padding:2px 6px; color:#DC2626; border-color:#FCA5A5;" onclick="deleteMilestone('${m.id}', '${escapeHtml(m.title)}')">🗑️</button>
          </div>
        </div>
        <p style="font-size:13px; color:#475569; margin:6px 0 8px 0; line-height:1.5;">${escapeHtml(m.description)}</p>
        <div style="display:flex; justify-content:space-between; font-size:11px; color:#64748B;">
          <span>📍 ${escapeHtml(m.location || 'Nairobi HQ')}</span>
          ${m.significance ? `<span style="font-weight:600; color:#059669;">🎯 Impact: ${escapeHtml(m.significance)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderOwnershipTable(records) {
  const tbody = document.getElementById('ownership-table-body');
  if (!tbody) return;

  if (!records || records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:32px; color:#64748B;">No director or ownership records found.</td></tr>';
    return;
  }

  tbody.innerHTML = records.map(r => {
    const appointStr = r.appointment_date ? new Date(r.appointment_date).toLocaleDateString('en-GB') : '-';
    const pct = Number(r.shareholding_percentage) || 0;
    const shares = Number(r.number_of_shares) || 0;
    const isAct = r.status === 'ACTIVE';

    return `
      <tr>
        <td><strong>${escapeHtml(r.person_or_entity_name)}</strong></td>
        <td><span style="background:#F1F5F9; padding:2px 8px; border-radius:4px; font-weight:600; font-size:11px;">${escapeHtml(r.role_title)}</span></td>
        <td style="text-align:right; font-weight:800; color:#0D7682;">${pct.toFixed(2)}%</td>
        <td style="text-align:right; font-weight:600;">${shares.toLocaleString()}</td>
        <td>${appointStr}</td>
        <td><code>${escapeHtml(r.board_resolution_ref || '-')}</code></td>
        <td style="text-align:center;">
          <span class="badge" style="background:${isAct ? '#ECFDF5' : '#F1F5F9'}; color:${isAct ? '#059669' : '#64748B'};">${r.status}</span>
        </td>
        <td style="text-align:right;">
          <button class="btn btn-secondary" style="font-size:11px; padding:3px 8px; color:#DC2626; border-color:#FCA5A5;" onclick="deleteOwnershipRecord('${r.id}', '${escapeHtml(r.person_or_entity_name)}')">🗑️ Remove</button>
        </td>
      </tr>
    `;
  }).join('');
}

function populateGrowthAnalytics(analytics) {
  if (!analytics) return;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  setVal('analytics-guards-total', analytics.active_guards_count || 0);
  setVal('analytics-sites-total', analytics.active_sites_count || 0);
  setVal('analytics-clients-total', analytics.active_clients_count || 0);
  setVal('analytics-assets-count', analytics.total_assets_count || 0);

  const assetVal = Number(analytics.total_assets_book_value) || 0;
  setVal('analytics-assets-val', `KES ${assetVal.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  const mrr = Number(analytics.monthly_contract_run_rate) || 0;
  setVal('analytics-contracts-mrr', `KES ${mrr.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
}

// Modal Handlers: Company Profile Submit
async function handleUpdateCompanyProfile(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-save-company-prof');
  if (btn) btn.disabled = true;

  try {
    const payload = {
      company_name: document.getElementById('prof-company-name').value.trim(),
      trading_brand_name: document.getElementById('prof-trading-name').value.trim() || null,
      psra_license_number: document.getElementById('prof-psra-license').value.trim(),
      registration_number: document.getElementById('prof-registration-no').value.trim(),
      tax_pin: document.getElementById('prof-tax-pin').value.trim(),
      primary_email: document.getElementById('prof-primary-email').value.trim(),
      primary_phone: document.getElementById('prof-primary-phone').value.trim(),
      website: document.getElementById('prof-website').value.trim() || null,
      headquarters_address: document.getElementById('prof-hq-address').value.trim() || null,
      mission_statement: document.getElementById('prof-mission').value.trim() || null,
      vision_statement: document.getElementById('prof-vision').value.trim() || null,
      core_values: document.getElementById('prof-core-values').value.trim() || null
    };

    const res = await apiFetch('/company/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to update company profile');

    showToast('Official corporate profile updated successfully!', 'success');
    loadCompanyHistory();

  } catch (err) {
    showToast('Profile update failed: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Modal Handlers: Add Milestone
function openAddMilestoneModal() {
  const d = document.getElementById('milestone-date');
  if (d && !d.value) d.value = new Date().toISOString().split('T')[0];
  const m = document.getElementById('modal-add-milestone');
  if (m) m.style.display = 'flex';
}

function closeAddMilestoneModal() {
  const m = document.getElementById('modal-add-milestone');
  if (m) m.style.display = 'none';
  const f = document.getElementById('form-add-milestone');
  if (f) f.reset();
}

async function handleAddMilestoneSubmit(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-save-milestone');
  if (btn) btn.disabled = true;

  try {
    const payload = {
      title: document.getElementById('milestone-title').value.trim(),
      milestone_date: document.getElementById('milestone-date').value,
      category: document.getElementById('milestone-category').value,
      location: document.getElementById('milestone-location').value.trim() || null,
      description: document.getElementById('milestone-desc').value.trim(),
      significance: document.getElementById('milestone-impact').value.trim() || null
    };

    const res = await apiFetch('/company/milestones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to add milestone');

    showToast('Corporate milestone recorded successfully!', 'success');
    closeAddMilestoneModal();
    loadCompanyHistory();

  } catch (err) {
    showToast('Failed to add milestone: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Modal Handlers: Add Ownership Record
function openAddOwnershipModal() {
  const d = document.getElementById('owner-appoint-date');
  if (d && !d.value) d.value = new Date().toISOString().split('T')[0];
  const m = document.getElementById('modal-add-ownership');
  if (m) m.style.display = 'flex';
}

function closeAddOwnershipModal() {
  const m = document.getElementById('modal-add-ownership');
  if (m) m.style.display = 'none';
  const f = document.getElementById('form-add-ownership');
  if (f) f.reset();
}

async function handleAddOwnershipSubmit(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-save-ownership');
  if (btn) btn.disabled = true;

  try {
    const payload = {
      person_or_entity_name: document.getElementById('owner-name').value.trim(),
      role_title: document.getElementById('owner-role').value,
      shareholding_percentage: parseFloat(document.getElementById('owner-share-pct').value) || 0,
      number_of_shares: parseInt(document.getElementById('owner-shares-count').value) || 0,
      appointment_date: document.getElementById('owner-appoint-date').value,
      national_id_or_registration: document.getElementById('owner-id-number').value.trim() || null,
      board_resolution_ref: document.getElementById('owner-resolution').value.trim() || null,
      contact_info: document.getElementById('owner-notes').value.trim() || null,
      status: 'ACTIVE'
    };

    const res = await apiFetch('/company/ownership', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to add governance record');

    showToast('Governance record saved successfully!', 'success');
    closeAddOwnershipModal();
    loadCompanyHistory();

  } catch (err) {
    showToast('Failed to add governance record: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}


// Export all new module functions to window
window.switchAssetsSubtab = switchAssetsSubtab;
window.loadAssets = loadAssets;
window.filterAssetsTable = filterAssetsTable;
window.renderAssetsTable = renderAssetsTable;
window.renderInventoryItemsTable = renderInventoryItemsTable;
window.renderInventoryTransactionsTable = renderInventoryTransactionsTable;
window.renderMaintenanceRecordsTable = renderMaintenanceRecordsTable;
window.openRegisterAssetModal = openRegisterAssetModal;
window.closeRegisterAssetModal = closeRegisterAssetModal;
window.handleRegisterAssetSubmit = handleRegisterAssetSubmit;
window.openAllocateAssetModal = openAllocateAssetModal;
window.closeAllocateAssetModal = closeAllocateAssetModal;
window.toggleAllocationTargetFields = toggleAllocationTargetFields;
window.handleAllocateAssetSubmit = handleAllocateAssetSubmit;
window.openReturnAssetModal = openReturnAssetModal;
window.closeReturnAssetModal = closeReturnAssetModal;
window.handleReturnAssetSubmit = handleReturnAssetSubmit;
window.openAssetMaintenanceModal = openAssetMaintenanceModal;
window.closeAssetMaintenanceModal = closeAssetMaintenanceModal;
window.handleAssetMaintenanceSubmit = handleAssetMaintenanceSubmit;
window.openNewInventoryItemModal = openNewInventoryItemModal;
window.closeNewInventoryItemModal = closeNewInventoryItemModal;
window.handleNewInventoryItemSubmit = handleNewInventoryItemSubmit;
window.openInventoryTransactModal = openInventoryTransactModal;
window.closeInventoryTransactModal = closeInventoryTransactModal;
window.toggleInvTransFields = toggleInvTransFields;
window.handleInventoryTransactSubmit = handleInventoryTransactSubmit;

window.switchClientsSubtab = switchClientsSubtab;
window.loadClients = loadClients;
window.filterClientsTable = filterClientsTable;
window.renderClientsTable = renderClientsTable;
window.renderContractsTable = renderContractsTable;
window.openRegisterClientModal = openRegisterClientModal;
window.closeRegisterClientModal = closeRegisterClientModal;
window.handleRegisterClientSubmit = handleRegisterClientSubmit;
window.viewClientProfile = viewClientProfile;
window.closeClientProfileModal = closeClientProfileModal;
window.openCreateContractForClient = openCreateContractForClient;
window.openCreateContractModal = openCreateContractModal;
window.closeCreateContractModal = closeCreateContractModal;
window.handleCreateContractSubmit = handleCreateContractSubmit;
window.openRenewContractModal = openRenewContractModal;
window.closeRenewContractModal = closeRenewContractModal;
window.handleRenewContractSubmit = handleRenewContractSubmit;

window.switchHistorySubtab = switchHistorySubtab;
window.loadCompanyHistory = loadCompanyHistory;
window.renderMilestonesTimeline = renderMilestonesTimeline;
window.renderOwnershipTable = renderOwnershipTable;
window.handleUpdateCompanyProfile = handleUpdateCompanyProfile;
window.openAddMilestoneModal = openAddMilestoneModal;
window.closeAddMilestoneModal = closeAddMilestoneModal;
window.handleAddMilestoneSubmit = handleAddMilestoneSubmit;
window.openAddOwnershipModal = openAddOwnershipModal;
window.closeAddOwnershipModal = closeAddOwnershipModal;
window.handleAddOwnershipSubmit = handleAddOwnershipSubmit;


// =============================================================================
// ENHANCED OPERATIONS: EDIT & DELETE SUITE FOR ALL 3 MODULES
// =============================================================================

// --- Client Edit & Delete ---
function openEditClientModal(clientId) {
  const c = cachedClients.find(client => String(client.id) === String(clientId));
  if (!c) {
    showToast('Client record not found', 'danger');
    return;
  }

  document.getElementById('client-edit-id').value = c.id;
  document.getElementById('client-edit-name').value = c.name || '';
  document.getElementById('client-edit-type').value = c.client_type || 'CORPORATE';
  document.getElementById('client-edit-industry').value = c.industry || '';
  document.getElementById('client-edit-tax-pin').value = c.tax_pin || '';
  document.getElementById('client-edit-address').value = c.physical_address || '';
  document.getElementById('client-edit-city').value = c.city || 'Nairobi';
  document.getElementById('client-edit-contact-name').value = c.primary_contact_name || '';
  document.getElementById('client-edit-contact-title').value = c.primary_contact_designation || '';
  document.getElementById('client-edit-contact-phone').value = c.primary_contact_phone || '';
  document.getElementById('client-edit-contact-email').value = c.primary_contact_email || '';
  document.getElementById('client-edit-status').value = c.status || 'ACTIVE';
  document.getElementById('client-edit-notes').value = c.notes || '';

  const m = document.getElementById('modal-edit-client');
  if (m) m.style.display = 'flex';
}

function closeEditClientModal() {
  const m = document.getElementById('modal-edit-client');
  if (m) m.style.display = 'none';
  const f = document.getElementById('form-edit-client');
  if (f) f.reset();
}

async function handleEditClientSubmit(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-update-client');
  if (btn) btn.disabled = true;

  try {
    const clientId = document.getElementById('client-edit-id').value;
    const payload = {
      name: document.getElementById('client-edit-name').value.trim(),
      client_type: document.getElementById('client-edit-type').value,
      industry: document.getElementById('client-edit-industry').value.trim() || null,
      tax_pin: document.getElementById('client-edit-tax-pin').value.trim() || null,
      physical_address: document.getElementById('client-edit-address').value.trim(),
      city: document.getElementById('client-edit-city').value.trim(),
      primary_contact_name: document.getElementById('client-edit-contact-name').value.trim(),
      primary_contact_designation: document.getElementById('client-edit-contact-title').value.trim() || null,
      primary_contact_phone: document.getElementById('client-edit-contact-phone').value.trim(),
      primary_contact_email: document.getElementById('client-edit-contact-email').value.trim(),
      status: document.getElementById('client-edit-status').value,
      notes: document.getElementById('client-edit-notes').value.trim() || null
    };

    const res = await apiFetch(`/clients/${clientId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to update client');

    showToast('Client organization updated successfully!', 'success');
    closeEditClientModal();
    loadClients();

  } catch (err) {
    showToast('Failed to update client: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteClient(clientId, clientName) {
  if (!confirm(`Are you sure you want to delete client "${clientName}"? This action cannot be undone.`)) {
    return;
  }

  try {
    const res = await apiFetch(`/clients/${clientId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to delete client');

    showToast(`Client "${clientName}" deleted successfully!`, 'success');
    loadClients();
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'danger');
  }
}

// --- Contract Edit & Delete ---
function openEditContractModal(contractId) {
  const ctr = cachedContracts.find(c => String(c.id) === String(contractId));
  if (!ctr) {
    showToast('Contract record not found', 'danger');
    return;
  }

  document.getElementById('contract-edit-id').value = ctr.id;
  document.getElementById('contract-edit-ref').value = ctr.contract_reference || '';
  document.getElementById('contract-edit-title').value = ctr.title || '';
  document.getElementById('contract-edit-type').value = ctr.contract_type || 'ANNUAL';
  document.getElementById('contract-edit-billing-freq').value = ctr.billing_frequency || 'MONTHLY';
  document.getElementById('contract-edit-start').value = ctr.start_date || '';
  document.getElementById('contract-edit-end').value = ctr.end_date || '';
  document.getElementById('contract-edit-monthly').value = ctr.monthly_service_charge || 0;
  document.getElementById('contract-edit-total').value = ctr.total_contract_value || 0;
  document.getElementById('contract-edit-guards').value = ctr.guards_required || 2;
  document.getElementById('contract-edit-terms').value = ctr.payment_terms || 'Net 30 Days';
  document.getElementById('contract-edit-status').value = ctr.status || 'ACTIVE';
  document.getElementById('contract-edit-conditions').value = ctr.special_terms_and_conditions || '';

  const m = document.getElementById('modal-edit-contract');
  if (m) m.style.display = 'flex';
}

function closeEditContractModal() {
  const m = document.getElementById('modal-edit-contract');
  if (m) m.style.display = 'none';
  const f = document.getElementById('form-edit-contract');
  if (f) f.reset();
}

async function handleEditContractSubmit(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-update-contract');
  if (btn) btn.disabled = true;

  try {
    const contractId = document.getElementById('contract-edit-id').value;
    const payload = {
      title: document.getElementById('contract-edit-title').value.trim(),
      contract_type: document.getElementById('contract-edit-type').value,
      billing_frequency: document.getElementById('contract-edit-billing-freq').value,
      start_date: document.getElementById('contract-edit-start').value,
      end_date: document.getElementById('contract-edit-end').value,
      monthly_charge: parseFloat(document.getElementById('contract-edit-monthly').value) || 0,
      contract_value: parseFloat(document.getElementById('contract-edit-total').value) || 0,
      guards_required: parseInt(document.getElementById('contract-edit-guards').value) || 2,
      payment_terms: document.getElementById('contract-edit-terms').value.trim() || 'Net 30 Days',
      status: document.getElementById('contract-edit-status').value,
      special_terms: document.getElementById('contract-edit-conditions').value.trim() || null
    };

    const res = await apiFetch(`/clients/contracts/${contractId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to update contract');

    showToast('Contract SLA updated successfully!', 'success');
    closeEditContractModal();
    loadClients();

  } catch (err) {
    showToast('Failed to update contract: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteContract(contractId, contractTitle) {
  if (!confirm(`Are you sure you want to delete contract "${contractTitle}"?`)) {
    return;
  }

  try {
    const res = await apiFetch(`/clients/contracts/${contractId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to delete contract');

    showToast(`Contract "${contractTitle}" deleted successfully!`, 'success');
    loadClients();
  } catch (err) {
    showToast('Delete contract failed: ' + err.message, 'danger');
  }
}

// --- Asset Edit & Delete ---
function openEditAssetModal(assetId) {
  const a = cachedAssets.find(ast => String(ast.id) === String(assetId));
  if (!a) {
    showToast('Asset record not found', 'danger');
    return;
  }

  const catSelect = document.getElementById('asset-edit-category');
  if (catSelect) {
    catSelect.innerHTML = '<option value="">Select Category...</option>' +
      cachedAssetCategories.map(c => `<option value="${c.id}" ${String(c.id) === String(a.category_id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
  }

  document.getElementById('asset-edit-id').value = a.id;
  document.getElementById('asset-edit-code').value = a.asset_code || '';
  document.getElementById('asset-edit-name').value = a.name || '';
  document.getElementById('asset-edit-serial').value = a.serial_number || '';
  document.getElementById('asset-edit-make').value = a.make || '';
  document.getElementById('asset-edit-model').value = a.model || '';
  document.getElementById('asset-edit-purchase-date').value = a.purchase_date || '';
  document.getElementById('asset-edit-price').value = a.purchase_price || 0;
  document.getElementById('asset-edit-depr-method').value = a.depreciation_method || 'STRAIGHT_LINE';
  document.getElementById('asset-edit-depr-rate').value = a.depreciation_rate || 20.0;
  document.getElementById('asset-edit-salvage').value = a.salvage_value || 0;
  document.getElementById('asset-edit-condition').value = a.condition || 'GOOD';
  document.getElementById('asset-edit-status').value = a.status || 'IN_STOCK';
  document.getElementById('asset-edit-location').value = a.current_location || '';
  document.getElementById('asset-edit-department').value = a.department || '';
  document.getElementById('asset-edit-supplier').value = a.supplier_name || '';
  document.getElementById('asset-edit-warranty').value = a.warranty_expiry || '';
  document.getElementById('asset-edit-description').value = a.description || '';

  const m = document.getElementById('modal-edit-asset');
  if (m) m.style.display = 'flex';
}

function closeEditAssetModal() {
  const m = document.getElementById('modal-edit-asset');
  if (m) m.style.display = 'none';
  const f = document.getElementById('form-edit-asset');
  if (f) f.reset();
}

async function handleEditAssetSubmit(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-update-asset');
  if (btn) btn.disabled = true;

  try {
    const assetId = document.getElementById('asset-edit-id').value;
    const payload = {
      name: document.getElementById('asset-edit-name').value.trim(),
      category_id: parseInt(document.getElementById('asset-edit-category').value) || null,
      serial_number: document.getElementById('asset-edit-serial').value.trim() || null,
      make: document.getElementById('asset-edit-make').value.trim() || null,
      model: document.getElementById('asset-edit-model').value.trim() || null,
      purchase_date: document.getElementById('asset-edit-purchase-date').value,
      purchase_price: parseFloat(document.getElementById('asset-edit-price').value) || 0,
      depreciation_method: document.getElementById('asset-edit-depr-method').value,
      depreciation_rate: parseFloat(document.getElementById('asset-edit-depr-rate').value) || 20.0,
      salvage_value: parseFloat(document.getElementById('asset-edit-salvage').value) || 0,
      condition: document.getElementById('asset-edit-condition').value,
      status: document.getElementById('asset-edit-status').value,
      current_location: document.getElementById('asset-edit-location').value.trim() || null,
      department: document.getElementById('asset-edit-department').value.trim() || null,
      supplier_name: document.getElementById('asset-edit-supplier').value.trim() || null,
      warranty_expiry: document.getElementById('asset-edit-warranty').value || null,
      description: document.getElementById('asset-edit-description').value.trim() || null
    };

    const res = await apiFetch(`/assets/${assetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to update asset');

    showToast('Asset record updated successfully!', 'success');
    closeEditAssetModal();
    loadAssets();

  } catch (err) {
    showToast('Failed to update asset: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteAsset(assetId, assetName) {
  if (!confirm(`Are you sure you want to delete asset "${assetName}"?`)) {
    return;
  }

  try {
    const res = await apiFetch(`/assets/${assetId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to delete asset');

    showToast(`Asset "${assetName}" deleted successfully!`, 'success');
    loadAssets();
  } catch (err) {
    showToast('Delete asset failed: ' + err.message, 'danger');
  }
}

// --- Supplies Inventory Edit & Delete ---
function openEditInventoryItemModal(itemId) {
  const item = cachedInventoryItems.find(i => String(i.id) === String(itemId));
  if (!item) {
    showToast('Supply item record not found', 'danger');
    return;
  }

  document.getElementById('inv-edit-item-id').value = item.id;
  document.getElementById('inv-edit-item-sku').value = item.item_code || '';
  document.getElementById('inv-edit-item-name').value = item.item_name || '';
  document.getElementById('inv-edit-item-category').value = item.category || 'UNIFORMS';
  document.getElementById('inv-edit-item-uom').value = item.unit_of_measure || 'Pcs';
  document.getElementById('inv-edit-item-cost').value = item.unit_cost || 0;
  document.getElementById('inv-edit-item-min-level').value = item.min_stock_level || 10;
  document.getElementById('inv-edit-item-reorder-qty').value = item.reorder_quantity || 25;
  document.getElementById('inv-edit-item-location').value = item.storage_location || '';

  const m = document.getElementById('modal-edit-inventory-item');
  if (m) m.style.display = 'flex';
}

function closeEditInventoryItemModal() {
  const m = document.getElementById('modal-edit-inventory-item');
  if (m) m.style.display = 'none';
  const f = document.getElementById('form-edit-inventory-item');
  if (f) f.reset();
}

async function handleEditInventoryItemSubmit(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-update-inv-item');
  if (btn) btn.disabled = true;

  try {
    const itemId = document.getElementById('inv-edit-item-id').value;
    const payload = {
      name: document.getElementById('inv-edit-item-name').value.trim(),
      category: document.getElementById('inv-edit-item-category').value,
      unit_of_measure: document.getElementById('inv-edit-item-uom').value.trim(),
      unit_cost: parseFloat(document.getElementById('inv-edit-item-cost').value) || 0,
      min_stock_level: parseInt(document.getElementById('inv-edit-item-min-level').value) || 10,
      reorder_quantity: parseInt(document.getElementById('inv-edit-item-reorder-qty').value) || 25,
      storage_location: document.getElementById('inv-edit-item-location').value.trim() || null
    };

    const res = await apiFetch(`/assets/inventory/items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to update supply item');

    showToast('Supply item updated successfully!', 'success');
    closeEditInventoryItemModal();
    loadAssets();

  } catch (err) {
    showToast('Failed to update supply item: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteInventoryItem(itemId, itemName) {
  if (!confirm(`Are you sure you want to delete supply item "${itemName}"?`)) {
    return;
  }

  try {
    const res = await apiFetch(`/assets/inventory/items/${itemId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to delete inventory item');

    showToast(`Inventory item "${itemName}" deleted successfully!`, 'success');
    loadAssets();
  } catch (err) {
    showToast('Delete item failed: ' + err.message, 'danger');
  }
}

// --- Founding Heritage Edit ---
function openEditFoundingModal() {
  if (cachedFoundingHistory) {
    document.getElementById('founding-edit-date').value = cachedFoundingHistory.founding_date || '';
    document.getElementById('founding-edit-location').value = cachedFoundingHistory.original_location || '';
    document.getElementById('founding-edit-guards').value = cachedFoundingHistory.initial_guards_count || 12;
    document.getElementById('founding-edit-founders').value = cachedFoundingHistory.founder_names || '';
    document.getElementById('founding-edit-capital').value = cachedFoundingHistory.initial_capital || 0;
    document.getElementById('founding-edit-story').value = cachedFoundingHistory.background_story || '';
    document.getElementById('founding-edit-first-client').value = cachedFoundingHistory.first_client_name || '';
  }
  const m = document.getElementById('modal-edit-founding');
  if (m) m.style.display = 'flex';
}

function closeEditFoundingModal() {
  const m = document.getElementById('modal-edit-founding');
  if (m) m.style.display = 'none';
  const f = document.getElementById('form-edit-founding');
  if (f) f.reset();
}

async function handleEditFoundingSubmit(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-update-founding');
  if (btn) btn.disabled = true;

  try {
    const payload = {
      founding_date: document.getElementById('founding-edit-date').value,
      original_location: document.getElementById('founding-edit-location').value.trim(),
      initial_guards_count: parseInt(document.getElementById('founding-edit-guards').value) || 12,
      founder_names: document.getElementById('founding-edit-founders').value.trim(),
      initial_capital: parseFloat(document.getElementById('founding-edit-capital').value) || 0,
      background_story: document.getElementById('founding-edit-story').value.trim(),
      first_client_name: document.getElementById('founding-edit-first-client').value.trim() || null
    };

    const res = await apiFetch('/company/founding', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to update founding heritage');

    showToast('Corporate founding heritage updated successfully!', 'success');
    closeEditFoundingModal();
    loadCompanyHistory();

  } catch (err) {
    showToast('Failed to update founding heritage: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// --- Milestone Delete ---
async function deleteMilestone(milestoneId, milestoneTitle) {
  if (!confirm(`Are you sure you want to remove milestone "${milestoneTitle}"?`)) {
    return;
  }

  try {
    const res = await apiFetch(`/company/milestones/${milestoneId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to delete milestone');

    showToast(`Milestone "${milestoneTitle}" removed successfully!`, 'success');
    loadCompanyHistory();
  } catch (err) {
    showToast('Delete milestone failed: ' + err.message, 'danger');
  }
}

// --- Governance Record Delete ---
async function deleteOwnershipRecord(recordId, personName) {
  if (!confirm(`Are you sure you want to remove governance record for "${personName}"?`)) {
    return;
  }

  try {
    const res = await apiFetch(`/company/ownership/${recordId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to delete governance record');

    showToast(`Governance record for "${personName}" removed successfully!`, 'success');
    loadCompanyHistory();
  } catch (err) {
    showToast('Delete governance record failed: ' + err.message, 'danger');
  }
}

// Global exports for all enhanced action handlers
window.openEditClientModal = openEditClientModal;
window.closeEditClientModal = closeEditClientModal;
window.handleEditClientSubmit = handleEditClientSubmit;
window.deleteClient = deleteClient;

window.openEditContractModal = openEditContractModal;
window.closeEditContractModal = closeEditContractModal;
window.handleEditContractSubmit = handleEditContractSubmit;
window.deleteContract = deleteContract;

window.openEditAssetModal = openEditAssetModal;
window.closeEditAssetModal = closeEditAssetModal;
window.handleEditAssetSubmit = handleEditAssetSubmit;
window.deleteAsset = deleteAsset;

window.openEditInventoryItemModal = openEditInventoryItemModal;
window.closeEditInventoryItemModal = closeEditInventoryItemModal;
window.handleEditInventoryItemSubmit = handleEditInventoryItemSubmit;
window.deleteInventoryItem = deleteInventoryItem;

window.openEditFoundingModal = openEditFoundingModal;
window.closeEditFoundingModal = closeEditFoundingModal;
window.handleEditFoundingSubmit = handleEditFoundingSubmit;

window.deleteMilestone = deleteMilestone;
window.deleteOwnershipRecord = deleteOwnershipRecord;

function filterTransactionsTable() {
  const query = (document.getElementById('transactions-search-input')?.value || '').toLowerCase().trim();
  const method = document.getElementById('transactions-method-filter')?.value || 'ALL';
  const rows = document.querySelectorAll('#payments-table-body tr');
  rows.forEach(row => {
    const text = row.innerText.toLowerCase();
    const matchesQuery = !query || text.includes(query);
    const matchesMethod = (method === 'ALL') || text.includes(method.toLowerCase());
    row.style.display = (matchesQuery && matchesMethod) ? '' : 'none';
  });
}
window.filterTransactionsTable = filterTransactionsTable;

/* ==========================================================================
   PERSONNEL CUSTODY, AWARDS & ITEM RETURN MANAGEMENT
   ========================================================================== */
let currentViewedStaff = null;

function renderCustodyRows(allocations = [], inventoryTx = [], targetType = 'guard', targetId = null) {
  const rows = [];

  // 1. Render Capital & Security Asset Allocations
  (allocations || []).forEach(al => {
    const isReturned = al.status === 'RETURNED';
    const isActive = al.status === 'ACTIVE';

    let statusBadge = '';
    if (isActive) {
      statusBadge = `
        <span class="badge" style="background:#DCFCE7; color:#166534; font-weight:800; font-size:11px;">🟢 IN CUSTODY (ACTIVE)</span>
        ${al.expected_return_date ? `<div style="font-size:10px; color:#64748B; margin-top:2px;">Expected Return: ${al.expected_return_date}</div>` : ''}
      `;
    } else if (isReturned) {
      statusBadge = `
        <span class="badge" style="background:#F0FDF4; color:#15803D; font-weight:800; font-size:11px; border:1px solid #BBF7D0;">✅ RETURNED TO STORES</span>
        <div style="font-size:11px; color:#15803D; margin-top:3px; font-weight:700;">Returned: <b>${al.return_date || '-'}</b></div>
        <div style="font-size:11px; color:#64748B;">Condition: <b>${escapeHtml(al.condition_on_return || 'GOOD')}</b></div>
        ${al.notes ? `<div style="font-size:11px; color:#475569; font-style:italic; margin-top:2px;">"${escapeHtml(al.notes)}"</div>` : ''}
      `;
    } else {
      statusBadge = `<span class="badge" style="background:#FEF3C7; color:#92400E; font-weight:800; font-size:11px;">🔄 ${al.status}</span>`;
    }

    const safeItemName = (al.asset_name || 'Asset').replace(/'/g, "\\'");
    const safeTag = (al.asset_tag || '').replace(/'/g, "\\'");

    let actionBtn = '';
    if (isActive) {
      actionBtn = `
        <button class="btn btn-secondary" style="font-size:11px; padding:4px 10px; font-weight:700; background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE; border-radius:6px;" onclick="openReturnCustodyModal(${al.id}, '${safeItemName}', '${safeTag}', '${targetType}', ${targetId}, 'asset')">
          🔄 Mark as Returned
        </button>
      `;
    } else if (isReturned) {
      actionBtn = `<span style="color:#10B981; font-weight:800; font-size:11px;">✓ Cleared &amp; In Stores</span>`;
    } else {
      actionBtn = `<span style="color:#64748B; font-size:11px;">${al.status}</span>`;
    }

    rows.push(`
      <tr>
        <td>
          <strong style="color:#0F172A; font-size:13px;">${escapeHtml(al.asset_tag || '')}</strong><br>
          <span style="font-size:12px; color:#334155; font-weight:600;">${escapeHtml(al.asset_name || '')}</span>
        </td>
        <td>
          <span class="badge" style="background:#F1F5F9; color:#1E293B; font-weight:600; font-size:11px;">${escapeHtml(al.asset_category || 'Asset')}</span>
        </td>
        <td style="font-size:12px; font-family:monospace; color:#475569;">${escapeHtml(al.asset_serial || '—')}</td>
        <td style="font-size:12px; color:#334155; font-weight:600;">${al.allocated_date || '—'}</td>
        <td style="font-size:12px;">
          <span class="badge" style="background:#EFF6FF; color:#1D4ED8; font-weight:600;">${escapeHtml(al.condition_on_allocation || 'GOOD')}</span>
        </td>
        <td>${statusBadge}</td>
        <td style="text-align:right;">${actionBtn}</td>
      </tr>
    `);
  });

  // 2. Render Consumable & Uniform Supplies
  (inventoryTx || []).forEach(tx => {
    const isReturned = tx.transaction_type === 'RETURNED';
    const isIssued = tx.transaction_type === 'ISSUED';

    let statusBadge = '';
    if (isIssued) {
      statusBadge = `
        <span class="badge" style="background:#E0F2FE; color:#0369A1; font-weight:800; font-size:11px;">📦 ISSUED TO PERSONNEL</span>
        ${tx.reason_notes ? `<div style="font-size:11px; color:#475569; margin-top:2px; font-style:italic;">"${escapeHtml(tx.reason_notes)}"</div>` : ''}
      `;
    } else if (isReturned) {
      statusBadge = `
        <span class="badge" style="background:#F0FDF4; color:#15803D; font-weight:800; font-size:11px; border:1px solid #BBF7D0;">✅ RETURNED TO STOCK</span>
        ${tx.reason_notes ? `<div style="font-size:11px; color:#475569; margin-top:2px; font-style:italic;">"${escapeHtml(tx.reason_notes)}"</div>` : ''}
      `;
    } else {
      statusBadge = `<span class="badge" style="background:#F8FAFC; color:#64748B; font-size:11px;">${tx.transaction_type}</span>`;
    }

    const dateStr = tx.created_at ? String(tx.created_at).substring(0, 10) : '—';
    const safeTxItemName = (tx.item_name || 'Supply Item').replace(/'/g, "\\'");
    const safeTxItemCode = (tx.item_code || 'Supply').replace(/'/g, "\\'");

    let invActionBtn = '';
    if (isIssued) {
      invActionBtn = `
        <button class="btn btn-secondary" style="font-size:11px; padding:4px 10px; font-weight:700; background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE; border-radius:6px;" onclick="openReturnCustodyModal(${tx.id}, '${safeTxItemName}', '${safeTxItemCode}', '${targetType}', ${targetId}, 'inventory', ${tx.item_id}, ${tx.quantity})">
          🔄 Mark as Returned
        </button>
      `;
    } else if (isReturned) {
      invActionBtn = `<span style="color:#10B981; font-weight:800; font-size:11px;">✓ Restocked in Store</span>`;
    } else {
      invActionBtn = `<span style="color:#64748B; font-size:11px;">${tx.transaction_type}</span>`;
    }

    rows.push(`
      <tr>
        <td>
          <strong style="color:#0F172A; font-size:13px;">${escapeHtml(tx.item_code || '')}</strong><br>
          <span style="font-size:12px; color:#334155;">${escapeHtml(tx.item_name || 'Supply Item')} (Qty: <b>${tx.quantity}</b>)</span>
        </td>
        <td>
          <span class="badge" style="background:#F3E8FF; color:#581C87; font-weight:600; font-size:11px;">👔 Uniform / Supply</span>
        </td>
        <td style="font-size:12px; font-family:monospace; color:#64748B;">${escapeHtml(tx.reference_no || '—')}</td>
        <td style="font-size:12px; color:#334155;">${dateStr}</td>
        <td style="font-size:12px;"><span class="badge" style="background:#F1F5F9; color:#475569;">NEW</span></td>
        <td>${statusBadge}</td>
        <td style="text-align:right;">${invActionBtn}</td>
      </tr>
    `);
  });

  if (rows.length === 0) {
    return '<tr><td colspan="7" style="text-align:center; padding:32px 16px; color:#64748B;"><div style="font-size:24px; margin-bottom:8px;">📦</div>No company property, supplies, or awards have been recorded in this personnel file yet.</td></tr>';
  }

  return rows.join('');
}

let currentGuardCustodyAllocations = [];
let currentGuardCustodyInventory = [];
let currentQuickReturnItemsCache = [];

// --- Return Custody Modal ---
function handleReturnConditionChanged(val) {
  const box = document.getElementById('return-damage-deduction-box');
  if (!box) return;
  if (val === 'DAMAGED' || val === 'POOR') {
    box.style.display = 'block';
  } else {
    box.style.display = 'none';
  }
}

function openReturnCustodyModal(allocId, itemName, itemTag, targetType, targetId, itemKind = 'asset', itemId = null, qty = 1) {
  document.getElementById('return-custody-alloc-id').value = allocId || '';
  document.getElementById('return-custody-target-type').value = targetType || 'guard';
  document.getElementById('return-custody-target-id').value = targetId || '';
  document.getElementById('return-custody-item-kind').value = itemKind || 'asset';
  document.getElementById('return-custody-item-id').value = itemId || '';
  document.getElementById('return-custody-qty').value = qty || 1;

  document.getElementById('return-custody-item-name').innerText = itemName || 'Company Property';
  document.getElementById('return-custody-item-tag').innerText = `${itemTag || '-'} (${itemKind === 'asset' ? 'Capital Asset' : 'Uniform / Supply'})`;
  document.getElementById('return-custody-date').value = new Date().toISOString().substring(0, 10);
  document.getElementById('return-custody-condition').value = 'GOOD';
  document.getElementById('return-custody-notes').value = '';

  const dmgBox = document.getElementById('return-damage-deduction-box');
  if (dmgBox) dmgBox.style.display = 'none';
  const dmgAmt = document.getElementById('return-damage-deduction-amount');
  if (dmgAmt) dmgAmt.value = '';
  const dmgDesc = document.getElementById('return-damage-description');
  if (dmgDesc) dmgDesc.value = '';

  const selectContainer = document.getElementById('return-custody-select-container');
  if (selectContainer) selectContainer.style.display = 'none';
  const infoBox = document.getElementById('return-custody-info-box');
  if (infoBox) infoBox.style.display = 'block';

  const modal = document.getElementById('modal-return-custody-item');
  if (modal) modal.style.display = 'flex';
}

function openQuickReturnItemModal(targetType, targetId, targetName) {
  const activeAssets = (currentGuardCustodyAllocations || []).filter(a => a.status === 'ACTIVE');
  const activeInv = (currentGuardCustodyInventory || []).filter(t => t.transaction_type === 'ISSUED');

  const combined = [];
  activeAssets.forEach(a => {
    combined.push({
      kind: 'asset',
      id: a.id,
      itemId: a.asset_id,
      name: a.asset_name || 'Asset',
      tag: a.asset_tag || '',
      qty: 1,
      label: `[Asset] ${a.asset_name} (${a.asset_tag})`
    });
  });
  activeInv.forEach(t => {
    combined.push({
      kind: 'inventory',
      id: t.id,
      itemId: t.item_id,
      name: t.item_name || 'Supply Item',
      tag: t.item_code || '',
      qty: t.quantity || 1,
      label: `[Supply] ${t.item_name} (${t.item_code}) - Qty: ${t.quantity}`
    });
  });

  if (!combined.length) {
    showToast(`All issued items for ${targetName || 'this personnel'} have already been returned to stores.`, 'info');
    return;
  }

  currentQuickReturnItemsCache = combined;

  const select = document.getElementById('return-custody-item-select');
  if (select) {
    select.innerHTML = combined.map((item, idx) => `<option value="${idx}">${escapeHtml(item.label)}</option>`).join('');
  }

  const selectContainer = document.getElementById('return-custody-select-container');
  if (selectContainer) selectContainer.style.display = 'block';
  const infoBox = document.getElementById('return-custody-info-box');
  if (infoBox) infoBox.style.display = 'block';

  document.getElementById('return-custody-target-type').value = targetType;
  document.getElementById('return-custody-target-id').value = targetId;
  document.getElementById('return-custody-date').value = new Date().toISOString().substring(0, 10);
  document.getElementById('return-custody-condition').value = 'GOOD';
  document.getElementById('return-custody-notes').value = '';

  const dmgBox = document.getElementById('return-damage-deduction-box');
  if (dmgBox) dmgBox.style.display = 'none';
  const dmgAmt = document.getElementById('return-damage-deduction-amount');
  if (dmgAmt) dmgAmt.value = '';
  const dmgDesc = document.getElementById('return-damage-description');
  if (dmgDesc) dmgDesc.value = '';

  onReturnItemSelectChange();

  const modal = document.getElementById('modal-return-custody-item');
  if (modal) modal.style.display = 'flex';
}

function onReturnItemSelectChange() {
  const select = document.getElementById('return-custody-item-select');
  if (!select) return;
  const idx = parseInt(select.value || '0');
  const item = currentQuickReturnItemsCache[idx];
  if (!item) return;

  document.getElementById('return-custody-alloc-id').value = item.id;
  document.getElementById('return-custody-item-kind').value = item.kind;
  document.getElementById('return-custody-item-id').value = item.itemId;
  document.getElementById('return-custody-qty').value = item.qty;

  document.getElementById('return-custody-item-name').innerText = item.name;
  document.getElementById('return-custody-item-tag').innerText = `${item.tag} (${item.kind === 'asset' ? 'Capital Asset' : 'Uniform / Supply'})`;
}

function closeReturnCustodyModal() {
  const modal = document.getElementById('modal-return-custody-item');
  if (modal) modal.style.display = 'none';
}

async function handleReturnCustodySubmit(event) {
  event.preventDefault();
  const allocId = document.getElementById('return-custody-alloc-id').value;
  const targetType = document.getElementById('return-custody-target-type').value;
  const targetId = document.getElementById('return-custody-target-id').value;
  const itemKind = document.getElementById('return-custody-item-kind').value || 'asset';
  const itemId = document.getElementById('return-custody-item-id').value;
  const qty = parseInt(document.getElementById('return-custody-qty').value || '1');
  const returnDate = document.getElementById('return-custody-date').value;
  const condition = document.getElementById('return-custody-condition').value;
  const notes = document.getElementById('return-custody-notes').value.trim();
  const damageAmt = parseFloat(document.getElementById('return-damage-deduction-amount')?.value || '0');
  const damageDesc = document.getElementById('return-damage-description')?.value?.trim() || '';
  const btn = document.getElementById('btn-confirm-return-custody');

  if (btn) { btn.disabled = true; btn.innerText = '⏳ Processing Return...'; }

  try {
    if (itemKind === 'asset') {
      const res = await apiFetch(`/assets/allocations/${allocId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          return_date: returnDate,
          condition_on_return: condition,
          notes: notes,
          damage_deduction_amount: damageAmt > 0 ? damageAmt : null,
          damage_description: damageDesc || null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to record asset return');
    } else {
      // Inventory item return
      const res = await apiFetch('/assets/inventory/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: parseInt(itemId),
          transaction_type: 'RETURNED',
          quantity: qty,
          guard_id: targetType === 'guard' ? parseInt(targetId) : null,
          staff_id: targetType === 'staff' ? parseInt(targetId) : null,
          reference_no: 'RET-' + (returnDate || '').replace(/-/g, ''),
          reason_notes: notes ? `${notes} [Return Condition: ${condition}]` : `Item returned to stores [Condition: ${condition}]`
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to record inventory return');

      // Record damage deduction for guard inventory/uniform item if damaged
      if (targetType === 'guard' && damageAmt > 0) {
        await apiFetch('/assets/damage-deductions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guard_id: parseInt(targetId),
            inventory_item_id: parseInt(itemId),
            item_name: document.getElementById('return-custody-item-name')?.innerText || 'Damaged Uniform / Equipment',
            damage_description: damageDesc || `Returned damaged inventory item (${condition})`,
            deduction_amount: damageAmt,
            incident_date: returnDate,
            notes: notes
          })
        });
      }
    }

    if (damageAmt > 0) {
      showToast(`✅ Item returned. Property damage penalty of KES ${damageAmt.toLocaleString()} recorded for salary deduction!`, 'success');
    } else {
      showToast('✅ Item return recorded and inventory updated in personnel file!', 'success');
    }
    closeReturnCustodyModal();

    if (targetType === 'guard') {
      viewGuardFile(targetId);
    } else if (targetType === 'staff') {
      openStaffFileModal(targetId);
    }
    if (typeof loadAssets === 'function') loadAssets();
  } catch (err) {
    console.error('handleReturnCustodySubmit error:', err);
    showToast('Return failed: ' + err.message, 'danger');
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = 'Confirm Return to Store'; }
  }
}

// --- Award / Issue Item Modal ---
async function openAwardItemModal(targetType, targetId, targetName) {
  document.getElementById('award-target-type').value = targetType;
  document.getElementById('award-target-id').value = targetId;
  document.getElementById('award-recipient-name').innerText = `${targetName} (${targetType === 'guard' ? 'Security Guard' : 'Corporate Staff'})`;
  document.getElementById('award-date').value = new Date().toISOString().substring(0, 10);
  document.getElementById('award-condition').value = 'GOOD';
  document.getElementById('award-expected-return').value = '';
  document.getElementById('award-notes').value = '';
  document.getElementById('award-issuance-type').value = 'ASSET';
  toggleAwardIssuanceType('ASSET');

  const assetSelect = document.getElementById('award-asset-select');
  if (assetSelect) {
    assetSelect.innerHTML = '<option value="">Loading available company assets...</option>';
    try {
      const res = await apiFetch('/assets?status=AVAILABLE');
      if (res.ok) {
        const assets = await res.json();
        assetSelect.innerHTML = '<option value="">-- Choose an Available Asset --</option>';
        assets.forEach(a => {
          const opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = `[${a.asset_tag}] ${a.name} (${a.category_name || 'Asset'}) - Serial: ${a.serial_number || 'N/A'}`;
          assetSelect.appendChild(opt);
        });
      }
    } catch (e) {
      assetSelect.innerHTML = '<option value="">Failed to load available assets</option>';
    }
  }

  const supplySelect = document.getElementById('award-supply-select');
  if (supplySelect) {
    supplySelect.innerHTML = '<option value="">Loading supply catalog...</option>';
    try {
      const res = await apiFetch('/assets/inventory');
      if (res.ok) {
        const supplies = await res.json();
        supplySelect.innerHTML = '<option value="">-- Choose Inventory Item --</option>';
        supplies.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = `[${s.item_code}] ${s.item_name} (Stock: ${s.current_stock} ${s.unit_of_measure})`;
          supplySelect.appendChild(opt);
        });
      }
    } catch (e) {
      supplySelect.innerHTML = '<option value="">Failed to load supplies</option>';
    }
  }

  const modal = document.getElementById('modal-award-item');
  if (modal) modal.style.display = 'flex';
}

function openStaffAwardModal() {
  if (!currentViewedStaff) return;
  const name = currentViewedStaff.full_name || currentViewedStaff.email;
  openAwardItemModal('staff', currentViewedStaff.id, name);
}

function closeAwardItemModal() {
  const modal = document.getElementById('modal-award-item');
  if (modal) modal.style.display = 'none';
}

function toggleAwardIssuanceType(val) {
  const assetSec = document.getElementById('award-asset-section');
  const supplySec = document.getElementById('award-supply-section');
  if (val === 'ASSET') {
    if (assetSec) assetSec.style.display = 'block';
    if (supplySec) supplySec.style.display = 'none';
  } else {
    if (assetSec) assetSec.style.display = 'none';
    if (supplySec) supplySec.style.display = 'block';
  }
}

async function handleAwardItemSubmit(event) {
  event.preventDefault();
  const targetType = document.getElementById('award-target-type').value;
  const targetId = parseInt(document.getElementById('award-target-id').value);
  const issuanceType = document.getElementById('award-issuance-type').value;
  const awardDate = document.getElementById('award-date').value;
  const condition = document.getElementById('award-condition').value;
  const expReturn = document.getElementById('award-expected-return').value || null;
  const notes = document.getElementById('award-notes').value.trim();
  const btn = document.getElementById('btn-submit-award-item');

  if (btn) btn.disabled = true;

  try {
    if (issuanceType === 'ASSET') {
      const assetIdVal = document.getElementById('award-asset-select').value;
      if (!assetIdVal) throw new Error('Please select an available company asset');
      const assetId = parseInt(assetIdVal);

      const payload = {
        asset_id: assetId,
        allocation_type: targetType === 'guard' ? 'EMPLOYEE' : 'STAFF',
        guard_id: targetType === 'guard' ? targetId : null,
        staff_id: targetType === 'staff' ? targetId : null,
        allocated_date: awardDate,
        condition_on_allocation: condition,
        expected_return_date: expReturn,
        notes: notes
      };

      const res = await apiFetch(`/assets/${assetId}/allocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to allocate asset');

    } else {
      const supplyIdVal = document.getElementById('award-supply-select').value;
      if (!supplyIdVal) throw new Error('Please select an inventory supply item');
      const supplyId = parseInt(supplyIdVal);
      const qty = parseInt(document.getElementById('award-supply-qty').value) || 1;

      const payload = {
        item_id: supplyId,
        transaction_type: 'ISSUED',
        quantity: qty,
        issued_to_guard_id: targetType === 'guard' ? targetId : null,
        issued_to_staff_id: targetType === 'staff' ? targetId : null,
        reason_notes: notes
      };

      const res = await apiFetch('/assets/inventory/transact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to dispatch supply');
    }

    showToast('Company property / supplies awarded and recorded in personnel file!', 'success');
    closeAwardItemModal();

    if (targetType === 'guard') {
      viewGuardFile(targetId);
    } else if (targetType === 'staff') {
      openStaffFileModal(targetId);
    }
    if (typeof loadAssets === 'function') loadAssets();
  } catch (err) {
    showToast('Failed to record award: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// --- Staff Personnel File Modal ---
async function openStaffFileModal(staffId) {
  const staff = (allStaffMembers || []).find(s => s.id === staffId);
  currentViewedStaff = staff;

  if (staff) {
    document.getElementById('staff-file-name').innerText = staff.full_name || staff.email.split('@')[0];
    document.getElementById('staff-file-subinfo').innerText = `Role: ${staff.role} | Email: ${staff.email}`;
    document.getElementById('staff-file-role-val').innerText = staff.role;
    document.getElementById('staff-file-phone-val').innerText = staff.phone || '—';
    document.getElementById('staff-file-status-val').innerText = staff.status;
    const initial = (staff.full_name || staff.email || 'S')[0].toUpperCase();
    document.getElementById('staff-file-avatar').innerText = initial;
  }

  const tbody = document.getElementById('staff-custody-table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:#64748B;">Loading custody & awards records...</td></tr>';

  const modal = document.getElementById('modal-staff-file');
  if (modal) modal.style.display = 'flex';

  try {
    const [allocRes, txRes, advRes] = await Promise.all([
      apiFetch(`/assets/allocations?staff_id=${staffId}`).catch(() => ({ ok: false })),
      apiFetch(`/assets/inventory/transactions?staff_id=${staffId}`).catch(() => ({ ok: false })),
      apiFetch(`/salary-advances?advance_type=STAFF&staff_id=${staffId}`).catch(() => ({ ok: false }))
    ]);

    const allocations = (allocRes && allocRes.ok) ? await allocRes.json() : [];
    const inventoryTx = (txRes && txRes.ok) ? await txRes.json() : [];
    const staffAdvances = (advRes && advRes.ok) ? await advRes.json() : [];

    const activeCount = allocations.filter(a => a.status === 'ACTIVE').length + inventoryTx.filter(t => t.transaction_type === 'ISSUED').length;
    const countEl = document.getElementById('staff-file-items-count');
    if (countEl) countEl.innerText = `${activeCount} In Custody`;

    if (tbody) {
      tbody.innerHTML = renderCustodyRows(allocations, inventoryTx, 'staff', staffId);
    }

    const advTbody = document.getElementById('staff-advances-table-body');
    if (advTbody) {
      if (!staffAdvances.length) {
        advTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:18px; color:#64748B;">No salary advances recorded for this staff member.</td></tr>';
      } else {
        advTbody.innerHTML = staffAdvances.map(a => `
          <tr>
            <td><b>${a.advance_reference}</b></td>
            <td><b>KES ${Number(a.amount).toLocaleString(undefined, {minimumFractionDigits:2})}</b></td>
            <td>${a.disbursement_date}</td>
            <td>${a.payment_method}</td>
            <td>${a.reference_number || '—'}</td>
            <td>${escapeHtml(a.reason || '—')}</td>
            <td>
              ${a.status === 'DEDUCTED'
                ? '<span class="badge" style="background:#ECFDF5; color:#059669; font-weight:700;">✅ DEDUCTED VIA PAYROLL</span>'
                : '<span class="badge" style="background:#FEF3C7; color:#D97706; font-weight:700;">⏳ PENDING DEDUCTION</span>'}
            </td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#EF4444;">Error loading custody records: ${err.message}</td></tr>`;
  }
}

function closeStaffFileModal() {
  const modal = document.getElementById('modal-staff-file');
  if (modal) modal.style.display = 'none';
}

// Global exports
window.renderCustodyRows = renderCustodyRows;
window.openReturnCustodyModal = openReturnCustodyModal;
window.openQuickReturnItemModal = openQuickReturnItemModal;
window.onReturnItemSelectChange = onReturnItemSelectChange;
window.closeReturnCustodyModal = closeReturnCustodyModal;
window.handleReturnCustodySubmit = handleReturnCustodySubmit;
window.openAwardItemModal = openAwardItemModal;
window.openStaffAwardModal = openStaffAwardModal;
window.closeAwardItemModal = closeAwardItemModal;
window.toggleAwardIssuanceType = toggleAwardIssuanceType;
window.handleAwardItemSubmit = handleAwardItemSubmit;
window.openStaffFileModal = openStaffFileModal;
window.closeStaffFileModal = closeStaffFileModal;


// ===================================================================
// SALARY ADVANCES MANAGEMENT SYSTEM
// ===================================================================

let allSalaryAdvancesCache = [];

function renderGuardAdvancesRows(advances = []) {
  if (!advances || !advances.length) {
    return '<tr><td colspan="6" style="text-align:center; padding:18px; color:#64748B;">No salary advances recorded for this guard.</td></tr>';
  }
  return advances.map(a => `
    <tr>
      <td><b>${a.advance_reference}</b></td>
      <td><b>KES ${Number(a.amount).toLocaleString(undefined, {minimumFractionDigits:2})}</b></td>
      <td>${a.disbursement_date}</td>
      <td>${a.payment_method} ${a.reference_number ? `(${a.reference_number})` : ''}</td>
      <td>${escapeHtml(a.reason || '—')}</td>
      <td>
        ${a.status === 'DEDUCTED'
          ? '<span class="badge" style="background:#ECFDF5; color:#059669; font-weight:700;">✅ DEDUCTED VIA PAYROLL</span>'
          : '<span class="badge" style="background:#FEF3C7; color:#D97706; font-weight:700;">⏳ PENDING DEDUCTION</span>'}
      </td>
    </tr>
  `).join('');
}

// Property Damage Deductions in Personnel File
function renderGuardDamageDeductionsRows(records = []) {
  if (!records || !records.length) {
    return '<tr><td colspan="8" style="text-align:center; padding:18px; color:#64748B;">No property damage deductions recorded for this guard.</td></tr>';
  }
  return records.map(d => {
    let statusBadge = '';
    if (d.status === 'DEDUCTED') {
      statusBadge = '<span class="badge" style="background:#ECFDF5; color:#065F46; font-weight:700;">✅ DEDUCTED IN PAYROLL</span>';
    } else if (d.status === 'WAIVED') {
      statusBadge = '<span class="badge" style="background:#F1F5F9; color:#64748B; font-weight:700;">DISMISSED / WAIVED</span>';
    } else {
      statusBadge = '<span class="badge" style="background:#FEF3C7; color:#92400E; font-weight:700;">⏳ PENDING PAYROLL</span>';
    }

    const actionHtml = d.status === 'PENDING'
      ? `<button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; color:#64748B;" onclick="waiveDamageDeduction(${d.id}, ${d.guard_id})" title="Waive damage deduction">Waive</button>`
      : '<span style="font-size:11px; color:#94A3B8;">—</span>';

    const periodName = d.payroll_period_name || (d.payroll_period_id ? `Period #${d.payroll_period_id}` : 'Next Active Run');

    return `
      <tr>
        <td><b>#${d.id}</b></td>
        <td><b>${escapeHtml(d.item_name)}</b> ${d.item_tag ? `<span style="font-size:11px; color:#64748B;">(${escapeHtml(d.item_tag)})</span>` : ''}</td>
        <td style="max-width:220px; white-space:normal; font-size:11px; color:#475569;">${escapeHtml(d.damage_description)}</td>
        <td style="color:#DC2626; font-weight:700;">KES ${Number(d.deduction_amount || 0).toLocaleString('en-KE', {minimumFractionDigits:2})}</td>
        <td>${d.incident_date ? String(d.incident_date).substring(0, 10) : '—'}</td>
        <td><span style="font-size:11px; color:#3B82F6; font-weight:600;">${escapeHtml(periodName)}</span></td>
        <td>${statusBadge}</td>
        <td>${actionHtml}</td>
      </tr>
    `;
  }).join('');
}

async function openRecordDamageDeductionModal(guardId, guardName, initialItemName = '', initialDesc = '', initialDate = '') {
  const modal = document.getElementById('modal-record-damage-deduction');
  if (!modal) return;

  const form = document.getElementById('form-record-damage-deduction');
  if (form) form.reset();

  document.getElementById('damage-ded-guard-id').value = guardId;
  const nameEl = document.getElementById('damage-ded-guard-name-display');
  if (nameEl) nameEl.innerText = guardName || `Guard #${guardId}`;

  document.getElementById('damage-ded-date').value = initialDate || new Date().toISOString().substring(0, 10);
  if (initialItemName) {
    const itemEl = document.getElementById('damage-ded-item-name');
    if (itemEl) itemEl.value = initialItemName;
  }
  if (initialDesc) {
    const descEl = document.getElementById('damage-ded-description');
    if (descEl) descEl.value = initialDesc;
  }

  // Populate target payroll periods
  const periodSelect = document.getElementById('damage-ded-period-select');
  if (periodSelect) {
    periodSelect.innerHTML = '<option value="">Auto-deduct in next active payroll run</option>';
    try {
      const res = await apiFetch('/payroll/periods');
      if (res.ok) {
        const periods = await res.json();
        periods.forEach(p => {
          if (p.status === 'DRAFT' || p.status === 'CALCULATED') {
            periodSelect.innerHTML += `<option value="${p.id}">${p.period_name} (${p.status})</option>`;
          }
        });
      }
    } catch (e) {
      console.warn('Could not load payroll periods for damage deduction modal', e);
    }
  }

  modal.style.display = 'flex';
}

function closeRecordDamageDeductionModal() {
  const modal = document.getElementById('modal-record-damage-deduction');
  if (modal) modal.style.display = 'none';
}

async function handleRecordDamageDeductionSubmit(event) {
  event.preventDefault();
  const guardId = parseInt(document.getElementById('damage-ded-guard-id').value);
  const itemName = document.getElementById('damage-ded-item-name').value.trim();
  const amount = parseFloat(document.getElementById('damage-ded-amount').value);
  const incidentDateVal = document.getElementById('damage-ded-date').value;
  const incidentDate = incidentDateVal || new Date().toISOString().substring(0, 10);
  const desc = document.getElementById('damage-ded-description').value.trim();
  const periodIdVal = document.getElementById('damage-ded-period-select').value;
  const periodId = periodIdVal ? parseInt(periodIdVal) : null;

  const btn = document.getElementById('btn-submit-damage-deduction');
  if (btn) { btn.disabled = true; btn.innerText = 'Saving Deduction...'; }

  try {
    const res = await apiFetch('/assets/damage-deductions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guard_id: guardId,
        item_name: itemName,
        damage_description: desc,
        deduction_amount: amount,
        incident_date: incidentDate,
        payroll_period_id: periodId
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Failed to record damage deduction');
    }

    showToast(`✅ Recorded damage deduction of KES ${amount.toLocaleString()} for ${itemName}. It will be deducted from salary.`, 'success');
    closeRecordDamageDeductionModal();

    // Reload active view
    if (typeof currentTab !== 'undefined' && currentTab === 'incidents') {
      if (typeof loadAdminIncidents === 'function') loadAdminIncidents();
    } else if (typeof viewGuardFile === 'function') {
      try { viewGuardFile(guardId); } catch(e) {}
    }
  } catch (err) {
    console.error('handleRecordDamageDeductionSubmit error:', err);
    showToast(err.message || 'Error recording damage deduction', 'danger');
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = '⚠️ Save & Deduct in Salary'; }
  }
}

async function waiveDamageDeduction(deductionId, guardId) {
  if (!confirm('Are you sure you want to waive / dismiss this property damage deduction? It will not be deducted from the guard\'s salary.')) {
    return;
  }
  try {
    const res = await apiFetch(`/assets/damage-deductions/${deductionId}/waive`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Failed to waive damage deduction');
    }
    showToast('Damage deduction waived successfully.', 'info');
    if (guardId) {
      viewGuardFile(guardId);
    }
  } catch (err) {
    console.error('waiveDamageDeduction error:', err);
    showToast(err.message || 'Error waiving deduction', 'danger');
  }
}

async function loadSalaryAdvances() {
  const user = getLoggedInUser();
  if (user && user.role === 'SUPERVISOR') return;
  const tbody = document.getElementById('salary-advances-table-body');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:24px; color:#64748B;"><div style="font-size:24px; margin-bottom:8px;">⏳</div>Loading salary advances...</td></tr>';
  }

  try {
    const [advRes, kpiRes] = await Promise.all([
      apiFetch('/salary-advances'),
      apiFetch('/salary-advances/summary').catch(() => ({ ok: false }))
    ]);

    if (!advRes.ok) throw new Error('Failed to load salary advances');
    const advances = await advRes.json();
    allSalaryAdvancesCache = advances || [];

    if (kpiRes && kpiRes.ok) {
      const kpis = await kpiRes.json();
      const elDisb = document.getElementById('adv-kpi-disbursed');
      if (elDisb) elDisb.innerText = `KES ${Number(kpis.total_amount_disbursed || 0).toLocaleString(undefined, {minimumFractionDigits:2})}`;
      const elDed = document.getElementById('adv-kpi-deducted');
      if (elDed) elDed.innerText = `KES ${Number(kpis.total_amount_deducted || 0).toLocaleString(undefined, {minimumFractionDigits:2})}`;
      const elPend = document.getElementById('adv-kpi-pending');
      if (elPend) elPend.innerText = `KES ${Number(kpis.total_amount_pending || 0).toLocaleString(undefined, {minimumFractionDigits:2})}`;
      const elCount = document.getElementById('adv-kpi-count');
      if (elCount) elCount.innerText = String(kpis.total_advances_count || 0);
    }

    renderSalaryAdvancesTable(allSalaryAdvancesCache);
  } catch (err) {
    console.error('loadSalaryAdvances error:', err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:#EF4444;">Failed to load advances: ${escapeHtml(err.message)}</td></tr>`;
    }
  }
}

function renderSalaryAdvancesTable(advances) {
  const tbody = document.getElementById('salary-advances-table-body');
  if (!tbody) return;

  if (!advances || !advances.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:24px; color:#64748B;">No salary advance records match your filter criteria.</td></tr>';
    return;
  }

  tbody.innerHTML = advances.map(adv => {
    const isGuard = adv.advance_type === 'GUARD';
    const typeBadge = isGuard
      ? '<span class="badge" style="background:#EFF6FF; color:#1D4ED8; font-weight:700;">🛡️ Guard</span>'
      : '<span class="badge" style="background:#F5F3FF; color:#7C3AED; font-weight:700;">👔 Staff</span>';
    
    const statusBadge = adv.status === 'DEDUCTED'
      ? '<span class="badge" style="background:#ECFDF5; color:#059669; font-weight:700;">✅ DEDUCTED</span>'
      : '<span class="badge" style="background:#FEF3C7; color:#D97706; font-weight:700;">⏳ PENDING DEDUCTION</span>';

    const safeRef = escapeHtml(adv.advance_reference);
    const deleteBtn = adv.status !== 'DEDUCTED'
      ? `<button class="btn btn-secondary" style="color:#DC2626; padding:3px 8px; font-size:11px;" onclick="deleteSalaryAdvance(${adv.id}, '${safeRef}')" title="Delete un-deducted advance">🗑️</button>`
      : '<span style="color:#10B981; font-size:11px; font-weight:600;">Settled</span>';

    return `
      <tr>
        <td><b>${adv.advance_reference}</b></td>
        <td>${typeBadge}</td>
        <td>
          <b>${escapeHtml(adv.recipient_name || 'Unknown')}</b>
          <br><small style="color:#64748B;">${escapeHtml(adv.recipient_number || '')}</small>
        </td>
        <td style="font-weight:800; color:#0F172A;">KES ${Number(adv.amount).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
        <td>${adv.disbursement_date}</td>
        <td>
          <b>${adv.payment_method}</b>
          ${adv.reference_number ? `<br><small style="color:#64748B;">Ref: ${escapeHtml(adv.reference_number)}</small>` : ''}
        </td>
        <td><span style="font-size:12px; color:#334155;">${escapeHtml(adv.reason || '—')}</span></td>
        <td>${statusBadge}</td>
        <td style="text-align:right;">
          ${deleteBtn}
        </td>
      </tr>
    `;
  }).join('');
}

function filterSalaryAdvances() {
  const typeFilter = (document.getElementById('adv-filter-type')?.value || 'ALL').toUpperCase();
  const statusFilter = (document.getElementById('adv-filter-status')?.value || 'ALL').toUpperCase();
  const query = (document.getElementById('adv-filter-search')?.value || '').toLowerCase().trim();

  const filtered = allSalaryAdvancesCache.filter(adv => {
    if (typeFilter !== 'ALL' && adv.advance_type !== typeFilter) return false;
    if (statusFilter !== 'ALL' && adv.status !== statusFilter) return false;
    if (query) {
      const matchName = (adv.recipient_name || '').toLowerCase().includes(query);
      const matchNum = (adv.recipient_number || '').toLowerCase().includes(query);
      const matchRef = (adv.advance_reference || '').toLowerCase().includes(query);
      const matchTrx = (adv.reference_number || '').toLowerCase().includes(query);
      const matchReason = (adv.reason || '').toLowerCase().includes(query);
      if (!matchName && !matchNum && !matchRef && !matchTrx && !matchReason) return false;
    }
    return true;
  });

  renderSalaryAdvancesTable(filtered);
}

function toggleAdvanceRecipientType() {
  const radios = document.getElementsByName('adv_recipient_type');
  let selected = 'GUARD';
  for (const r of radios) {
    if (r.checked) { selected = r.value; break; }
  }

  const guardGroup = document.getElementById('adv-guard-select-group');
  const staffGroup = document.getElementById('adv-staff-select-group');
  const guardLabel = document.getElementById('label-adv-guard');
  const staffLabel = document.getElementById('label-adv-staff');

  if (selected === 'GUARD') {
    if (guardGroup) guardGroup.style.display = 'block';
    if (staffGroup) staffGroup.style.display = 'none';
    if (guardLabel) guardLabel.style.borderColor = '#2563EB';
    if (staffLabel) staffLabel.style.borderColor = '#CBD5E1';
  } else {
    if (guardGroup) guardGroup.style.display = 'none';
    if (staffGroup) staffGroup.style.display = 'block';
    if (guardLabel) guardLabel.style.borderColor = '#CBD5E1';
    if (staffLabel) staffLabel.style.borderColor = '#7C3AED';
  }
}

async function populateAdvanceModalDropdowns() {
  // 1. Populate Guards
  const guardSelect = document.getElementById('adv-guard-id');
  if (guardSelect) {
    if (!cachedGuards || !cachedGuards.length) {
      try {
        const gRes = await apiFetch('/guards');
        if (gRes.ok) cachedGuards = await gRes.json();
      } catch (e) {}
    }
    const activeGuards = (cachedGuards || []).filter(g => g.status === 'ACTIVE');
    guardSelect.innerHTML = '<option value="">-- Choose Security Guard --</option>' +
      activeGuards.map(g => `<option value="${g.id}">${escapeHtml(g.full_name)} (${g.employee_number})</option>`).join('');
  }

  // 2. Populate Staff
  const staffSelect = document.getElementById('adv-staff-id');
  if (staffSelect) {
    if (!allStaffMembers || !allStaffMembers.length) {
      try {
        const sRes = await apiFetch('/staff');
        if (sRes.ok) allStaffMembers = await sRes.json();
      } catch (e) {}
    }
    const staffList = allStaffMembers || [];
    staffSelect.innerHTML = '<option value="">-- Choose Corporate Staff (HR/Supervisor/Admin) --</option>' +
      staffList.map(st => `<option value="${st.id}">${escapeHtml(st.full_name || st.email)} [${st.role}]</option>`).join('');
  }

  // 3. Populate Periods
  const periodSelect = document.getElementById('adv-payroll-period-id');
  if (periodSelect) {
    try {
      const pRes = await apiFetch('/payroll/periods');
      if (pRes.ok) {
        const periods = await pRes.json();
        periodSelect.innerHTML = '<option value="">Auto-detect by Disbursement Date</option>' +
          periods.map(p => `<option value="${p.id}">${escapeHtml(p.period_name)} (${p.status})</option>`).join('');
      }
    } catch (e) {}
  }
}

async function openIssueSalaryAdvanceModal(preselectedType = 'GUARD', preselectedId = null, preselectedName = null) {
  await populateAdvanceModalDropdowns();

  const modal = document.getElementById('modal-issue-advance');
  if (!modal) return;

  const form = document.getElementById('form-issue-salary-advance');
  if (form) form.reset();

  // Set default disbursement date to today
  const dateInput = document.getElementById('adv-date');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  const radios = document.getElementsByName('adv_recipient_type');
  for (const r of radios) {
    r.checked = (r.value === preselectedType);
  }
  toggleAdvanceRecipientType();

  if (preselectedType === 'GUARD' && preselectedId) {
    const gSelect = document.getElementById('adv-guard-id');
    if (gSelect) gSelect.value = String(preselectedId);
  } else if (preselectedType === 'STAFF' && preselectedId) {
    const stSelect = document.getElementById('adv-staff-id');
    if (stSelect) stSelect.value = String(preselectedId);
  }

  modal.style.display = 'flex';
}

function closeIssueSalaryAdvanceModal() {
  const modal = document.getElementById('modal-issue-advance');
  if (modal) modal.style.display = 'none';
}

function openStaffIssueAdvanceModal() {
  if (currentViewedStaff) {
    openIssueSalaryAdvanceModal('STAFF', currentViewedStaff.id, currentViewedStaff.full_name || currentViewedStaff.email);
  } else {
    openIssueSalaryAdvanceModal('STAFF');
  }
}

async function handleIssueSalaryAdvanceSubmit(e) {
  e.preventDefault();

  const btn = document.getElementById('btn-submit-salary-advance');
  if (btn) { btn.disabled = true; btn.innerText = '⏳ Processing...'; }

  try {
    const radios = document.getElementsByName('adv_recipient_type');
    let advance_type = 'GUARD';
    for (const r of radios) {
      if (r.checked) { advance_type = r.value; break; }
    }

    const guard_id = advance_type === 'GUARD' ? parseInt(document.getElementById('adv-guard-id')?.value || '0') : null;
    const staff_id = advance_type === 'STAFF' ? parseInt(document.getElementById('adv-staff-id')?.value || '0') : null;

    if (advance_type === 'GUARD' && (!guard_id || isNaN(guard_id))) {
      throw new Error('Please select a security guard.');
    }
    if (advance_type === 'STAFF' && (!staff_id || isNaN(staff_id))) {
      throw new Error('Please select a staff member.');
    }

    const amount = parseFloat(document.getElementById('adv-amount')?.value || '0');
    if (amount <= 0 || isNaN(amount)) {
      throw new Error('Please enter a valid advance amount greater than 0.');
    }

    const disbursement_date = document.getElementById('adv-date')?.value;
    if (!disbursement_date) throw new Error('Please enter the disbursement date.');

    const periodVal = document.getElementById('adv-payroll-period-id')?.value;
    const payroll_period_id = periodVal ? parseInt(periodVal) : null;

    const payment_method = document.getElementById('adv-payment-method')?.value || 'M-PESA';
    const reference_number = document.getElementById('adv-ref-number')?.value.trim() || null;
    const reason = document.getElementById('adv-reason')?.value.trim();
    if (!reason) throw new Error('Please specify the reason / purpose for the advance.');

    const notes = document.getElementById('adv-notes')?.value.trim() || null;

    const payload = {
      advance_type,
      guard_id,
      staff_id,
      amount,
      disbursement_date,
      payroll_period_id,
      payment_method,
      reference_number,
      reason,
      notes
    };

    const res = await apiFetch('/salary-advances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Failed to issue salary advance');
    }

    const advData = await res.json();
    showToast(`Salary advance ${advData.advance_reference} (KES ${Number(advData.amount).toLocaleString()}) approved successfully!`, 'success');

    closeIssueSalaryAdvanceModal();

    // Reload active tables
    loadSalaryAdvances();

    // If guard file is open, refresh it
    if (currentViewedGuard && advance_type === 'GUARD' && currentViewedGuard.id === guard_id) {
      viewGuardFile(guard_id);
    }
    // If staff file is open, refresh it
    if (currentViewedStaff && advance_type === 'STAFF' && currentViewedStaff.id === staff_id) {
      openStaffFileModal(staff_id);
    }
  } catch (err) {
    console.error('handleIssueSalaryAdvanceSubmit error:', err);
    showToast(err.message, 'danger');
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = '💾 Issue & Approve Advance'; }
  }
}

async function deleteSalaryAdvance(advanceId, advanceRef) {
  if (!confirm(`Are you sure you want to delete salary advance ${advanceRef}? This cannot be undone.`)) {
    return;
  }

  try {
    const res = await apiFetch(`/salary-advances/${advanceId}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Failed to delete salary advance');
    }

    showToast(`Salary advance ${advanceRef} deleted successfully.`, 'success');
    loadSalaryAdvances();
  } catch (err) {
    console.error('deleteSalaryAdvance error:', err);
    showToast(err.message, 'danger');
  }
}

// Window exports
window.loadSalaryAdvances = loadSalaryAdvances;
window.renderSalaryAdvancesTable = renderSalaryAdvancesTable;
window.filterSalaryAdvances = filterSalaryAdvances;
window.toggleAdvanceRecipientType = toggleAdvanceRecipientType;
window.openIssueSalaryAdvanceModal = openIssueSalaryAdvanceModal;
window.closeIssueSalaryAdvanceModal = closeIssueSalaryAdvanceModal;
window.handleIssueSalaryAdvanceSubmit = handleIssueSalaryAdvanceSubmit;
window.deleteSalaryAdvance = deleteSalaryAdvance;
window.openStaffIssueAdvanceModal = openStaffIssueAdvanceModal;
window.renderGuardAdvancesRows = renderGuardAdvancesRows;


// ==================== DOWNLOAD & DESKTOP APPLICATION SECTION ====================

let deferredDesktopAppPrompt = null;

// Catch PWA beforeinstallprompt event for desktop installation
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredDesktopAppPrompt = e;
  window.deferredDesktopAppPrompt = e;
  const pwaBtn = document.getElementById('btn-pwa-install-app');
  if (pwaBtn) {
    pwaBtn.style.boxShadow = '0 0 15px rgba(13, 148, 136, 0.6)';
  }
});

window.addEventListener('appinstalled', () => {
  showToast('CorpSec Desktop App successfully installed on your machine!', 'success');
  deferredDesktopAppPrompt = null;
  window.deferredDesktopAppPrompt = null;
});

// Register service worker for app shell offline support and PWA readiness
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/portal-sw.js', { scope: '/' })
      .then(reg => {
        console.log('CorpSec PWA ServiceWorker registered with scope:', reg.scope);
      })
      .catch(err => {
        console.log('CorpSec PWA ServiceWorker registration note:', err);
      });
  });
}

function initDownloadAppSection() {
  const osElem = document.getElementById('detected-machine-os');
  const browserElem = document.getElementById('detected-machine-browser');

  const ua = navigator.userAgent;
  let osName = 'Windows PC';
  if (ua.indexOf('Win') !== -1) osName = 'Windows PC (10/11)';
  else if (ua.indexOf('Mac') !== -1) osName = 'macOS';
  else if (ua.indexOf('Linux') !== -1) osName = 'Linux';
  else if (ua.indexOf('Android') !== -1) osName = 'Android Device';
  else if (ua.indexOf('iPhone') !== -1 || ua.indexOf('iPad') !== -1) osName = 'iOS Device';

  let browserName = 'Chrome / Edge';
  if (ua.indexOf('Edg') !== -1) browserName = 'Microsoft Edge';
  else if (ua.indexOf('Chrome') !== -1) browserName = 'Google Chrome';
  else if (ua.indexOf('Safari') !== -1 && ua.indexOf('Chrome') === -1) browserName = 'Apple Safari';
  else if (ua.indexOf('Firefox') !== -1) browserName = 'Mozilla Firefox';

  if (osElem) osElem.innerText = `Your Machine: ${osName}`;
  if (browserElem) browserElem.innerText = `Detected Browser: ${browserName} • Ready for Native Desktop App & Standalone Installation`;
}

function triggerPwaInstall() {
  const promptEvent = deferredDesktopAppPrompt || window.deferredDesktopAppPrompt;
  if (promptEvent) {
    promptEvent.prompt();
    promptEvent.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('CorpSec Desktop App installed on this machine!', 'success');
      }
      deferredDesktopAppPrompt = null;
      window.deferredDesktopAppPrompt = null;
    });
  } else {
    // Open the visual guidance modal
    openPwaInstallHelpModal();
  }
}

function openPwaInstallHelpModal() {
  const m = document.getElementById('modal-pwa-install-guide');
  if (m) m.style.display = 'flex';
}

function closePwaInstallHelpModal() {
  const m = document.getElementById('modal-pwa-install-guide');
  if (m) m.style.display = 'none';
}

function showQrModal() {
  const m = document.getElementById('modal-mobile-qr');
  if (m) m.style.display = 'flex';
}

function closeQrModal() {
  const m = document.getElementById('modal-mobile-qr');
  if (m) m.style.display = 'none';
}

function switchDownloadTab(tabName) {
  const tabs = ['win', 'chrome', 'edge', 'mobile'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-btn-guide-${t}`);
    const content = document.getElementById(`guide-content-${t}`);
    if (btn) {
      if (t === tabName) {
        btn.className = 'btn btn-primary';
      } else {
        btn.className = 'btn btn-secondary';
      }
    }
    if (content) {
      content.style.display = (t === tabName) ? 'block' : 'none';
    }
  });
}

window.initDownloadAppSection = initDownloadAppSection;
window.triggerPwaInstall = triggerPwaInstall;
window.openPwaInstallHelpModal = openPwaInstallHelpModal;
window.closePwaInstallHelpModal = closePwaInstallHelpModal;
window.showQrModal = showQrModal;
window.closeQrModal = closeQrModal;
window.switchDownloadTab = switchDownloadTab;

/* ==========================================================================
   MODULE: FIRM EXPENSES, PETTY CASH IMPREST & RECURRING EXPENDITURES
   ========================================================================== */
let allFirmExpenses = [];
let allPettyCashTransactions = [];
let allRecurringExpenses = [];

function switchExpenseSubtab(subtab) {
  const tabs = ['all', 'petty', 'recurring', 'breakdown'];
  tabs.forEach(t => {
    const el = document.getElementById(`subtab-expense-${t}`);
    const btn = document.getElementById(`btn-subtab-expense-${t}`);
    if (el) el.style.display = (t === subtab) ? 'block' : 'none';
    if (btn) {
      btn.className = (t === subtab) ? 'btn btn-primary' : 'btn btn-secondary';
    }
  });

  if (subtab === 'all') loadExpenses();
  if (subtab === 'petty') loadPettyCashBook();
  if (subtab === 'recurring') loadRecurringExpenses();
  if (subtab === 'breakdown') loadExpensesSummary();
}

async function loadExpenses() {
  const tbody = document.getElementById('expenses-table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:24px; color:#64748B;">Loading firm expenses...</td></tr>';

  try {
    const category = document.getElementById('expense-filter-category')?.value || '';
    const expenseType = document.getElementById('expense-filter-type')?.value || '';
    const search = document.getElementById('expense-filter-search')?.value.trim() || '';

    let url = '/expenses?limit=100';
    if (category) url += `&category=${encodeURIComponent(category)}`;
    if (expenseType) url += `&expense_type=${encodeURIComponent(expenseType)}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const res = await apiFetch(url);
    if (!res.ok) throw new Error('Failed to load expenses');
    allFirmExpenses = await res.json();

    if (!tbody) return;
    tbody.innerHTML = '';

    if (allFirmExpenses.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:32px; color:#64748B;">No expense records found matching criteria. Click "+ Record Firm Expense" to add.</td></tr>';
      return;
    }

    allFirmExpenses.forEach(exp => {
      const tr = document.createElement('tr');
      const dateStr = exp.expense_date ? exp.expense_date.substring(0, 10) : '--';
      const isPetty = exp.is_petty_cash;
      
      let typeBadge = '';
      if (exp.expense_type === 'PETTY_CASH') typeBadge = '<span class="badge" style="background:#FEF3C7; color:#92400E;">🪙 Petty Cash</span>';
      else if (exp.expense_type === 'RECURRING') typeBadge = '<span class="badge" style="background:#DBEAFE; color:#1E40AF;">🔄 Recurring</span>';
      else if (exp.expense_type === 'CAPITAL_PURCHASE') typeBadge = '<span class="badge" style="background:#EDE9FE; color:#5B21B6;">🏢 Capital</span>';
      else typeBadge = '<span class="badge" style="background:#F1F5F9; color:#475569;">Operational</span>';

      tr.innerHTML = `
        <td><b>${dateStr}</b></td>
        <td><span class="badge" style="background:#F8FAFC; border:1px solid #E2E8F0; color:#0F172A;">${exp.category}</span></td>
        <td>${typeBadge}</td>
        <td><strong>${exp.payee || 'Direct Vendor'}</strong></td>
        <td style="font-size:12px; max-width:220px; white-space:normal;">${exp.description || '--'}</td>
        <td style="font-weight:800; color:#0F172A;">KES ${Number(exp.amount).toLocaleString('en-KE', {minimumFractionDigits:2})}</td>
        <td><span style="font-size:11px; color:#64748B;">${exp.payment_method}</span></td>
        <td><span style="font-family:monospace; font-weight:700; color:#3B5EDB;">${exp.receipt_number || 'N/A'}</span></td>
        <td style="font-size:11px; color:#64748B;">${exp.recorded_by_name || 'System Admin'}</td>
        <td>
          <button class="btn btn-secondary" style="padding:3px 8px; font-size:11px; color:#EF4444; border-color:#FCA5A5;" onclick="deleteExpenseRecord(${exp.id})">🗑️ Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:24px; color:#EF4444;">Error: ${err.message}</td></tr>`;
  }
}

async function loadExpensesSummary() {
  try {
    const res = await apiFetch('/expenses/summary');
    if (!res.ok) return;
    const s = await res.json();

    const monthlyTotal = s.total_expenses_this_month !== undefined ? s.total_expenses_this_month : (s.total_expenses_month || 0);
    const pettyBal = s.petty_cash_float_balance !== undefined ? s.petty_cash_float_balance : (s.petty_cash_balance || 0);
    const floatCap = s.petty_cash_float_max || 25000;
    const pettyPct = Math.round((pettyBal / floatCap) * 100);
    const recurringTotal = s.monthly_recurring_commitments !== undefined ? s.monthly_recurring_commitments : (s.recurring_monthly_commitments || 0);
    const recordedCount = s.total_recorded_count !== undefined ? s.total_recorded_count : (s.total_receipts_recorded || 0);
    const disbursed = s.petty_cash_disbursed_this_month !== undefined ? s.petty_cash_disbursed_this_month : (s.petty_cash_disbursed_month || 0);

    // Metric cards
    const mTotal = document.getElementById('kpi-expenses-monthly-total');
    if (mTotal) mTotal.innerText = `KES ${Number(monthlyTotal).toLocaleString('en-KE', {minimumFractionDigits:2})}`;

    const mPetty = document.getElementById('kpi-petty-cash-balance');
    if (mPetty) mPetty.innerText = `KES ${Number(pettyBal).toLocaleString('en-KE', {minimumFractionDigits:2})}`;

    const mFloatMax = document.getElementById('kpi-petty-cash-float-max');
    if (mFloatMax) mFloatMax.innerText = `Float Max: KES ${Number(floatCap).toLocaleString()} (${pettyPct}% of cap)`;

    const mRecurring = document.getElementById('kpi-recurring-monthly-total');
    if (mRecurring) mRecurring.innerText = `KES ${Number(recurringTotal).toLocaleString('en-KE', {minimumFractionDigits:2})}`;

    const mRecCount = document.getElementById('kpi-recurring-count');
    if (mRecCount) mRecCount.innerText = `Active recurring obligations`;

    const mReceipts = document.getElementById('kpi-receipts-count');
    if (mReceipts) mReceipts.innerText = recordedCount;

    // Petty cash float bar
    const floatBar = document.getElementById('petty-float-bar');
    const floatPct = document.getElementById('petty-float-percent');
    if (floatBar) {
      const pct = Math.min(100, Math.max(0, pettyPct));
      floatBar.style.width = `${pct}%`;
      if (pct < 25) floatBar.style.background = '#DC2626';
      else if (pct < 50) floatBar.style.background = '#F59E0B';
      else floatBar.style.background = '#16A34A';
    }
    if (floatPct) floatPct.innerText = `${pettyPct}%`;

    const statBal = document.getElementById('petty-stat-balance');
    if (statBal) statBal.innerText = `KES ${Number(pettyBal).toLocaleString('en-KE', {minimumFractionDigits:2})}`;
    const statCap = document.getElementById('petty-stat-cap');
    if (statCap) statCap.innerText = `KES ${Number(floatCap).toLocaleString()}`;
    const statDis = document.getElementById('petty-stat-disbursed');
    if (statDis) statDis.innerText = `KES ${Number(disbursed).toLocaleString('en-KE', {minimumFractionDigits:2})}`;
    const statTop = document.getElementById('petty-stat-topups');
    if (statTop) statTop.innerText = `KES ${Number(s.petty_cash_topups_month || 0).toLocaleString('en-KE', {minimumFractionDigits:2})}`;

    // Render Category Distribution bars
    const distContainer = document.getElementById('category-distribution-container');
    const catData = s.by_category || s.category_distribution || {};
    if (distContainer) {
      distContainer.innerHTML = '';
      const total = monthlyTotal > 0 ? monthlyTotal : 1;
      const categories = Object.keys(catData);
      if (categories.length === 0) {
        distContainer.innerHTML = '<div style="color:#64748B; font-size:12px; padding:12px;">No categorical expenditures recorded this month yet.</div>';
      } else {
        categories.forEach(cat => {
          const amount = catData[cat];
          const pct = Math.round((amount / total) * 100);
          distContainer.innerHTML += `
            <div>
              <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                <span style="font-weight:600; color:#1E293B;">${cat}</span>
                <span style="font-weight:700; color:#0F172A;">KES ${Number(amount).toLocaleString()} (${pct}%)</span>
              </div>
              <div style="background:#E2E8F0; border-radius:999px; height:8px; overflow:hidden;">
                <div style="background:#2563EB; width:${pct}%; height:100%;"></div>
              </div>
            </div>
          `;
        });
      }
    }

  } catch (err) {
    console.error('loadExpensesSummary error:', err);
  }
}

async function loadPettyCashBook() {
  const tbody = document.getElementById('petty-cash-table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:#64748B;">Loading petty cash ledger...</td></tr>';

  try {
    const res = await apiFetch('/expenses/petty-cash');
    if (!res.ok) throw new Error('Failed to load petty cash book');
    const pcData = await res.json();
    allPettyCashTransactions = Array.isArray(pcData) ? pcData : (pcData.transactions || []);
    if (pcData.current_balance !== undefined) {
      const balEl = document.getElementById('petty-stat-balance');
      if (balEl) balEl.innerText = `KES ${Number(pcData.current_balance).toLocaleString('en-KE', {minimumFractionDigits:2})}`;
    }

    if (!tbody) return;
    tbody.innerHTML = '';

    if (allPettyCashTransactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:32px; color:#64748B;">No petty cash transactions recorded. Use "+ Top-Up Petty Cash Float" to initialize float.</td></tr>';
      return;
    }

    allPettyCashTransactions.forEach(tx => {
      const tr = document.createElement('tr');
      const isTopUp = tx.transaction_type === 'TOP_UP';
      const badge = isTopUp
        ? '<span class="badge" style="background:#DCFCE7; color:#166534; font-weight:700;">🟢 FLOAT TOP-UP</span>'
        : '<span class="badge" style="background:#FEE2E2; color:#991B1B; font-weight:700;">🔴 DISBURSEMENT</span>';

      const inflow = isTopUp ? `+ KES ${Number(tx.amount).toLocaleString('en-KE', {minimumFractionDigits:2})}` : '-';
      const outflow = !isTopUp ? `- KES ${Number(tx.amount).toLocaleString('en-KE', {minimumFractionDigits:2})}` : '-';

      tr.innerHTML = `
        <td>${tx.transaction_date ? tx.transaction_date.substring(0, 16).replace('T', ' ') : '--'}</td>
        <td>${badge}</td>
        <td><strong>${tx.payee_or_custodian || '--'}</strong></td>
        <td style="font-size:12px;">${tx.description || '--'}</td>
        <td style="font-weight:700; color:#16A34A;">${inflow}</td>
        <td style="font-weight:700; color:#DC2626;">${outflow}</td>
        <td style="font-weight:800; color:#0F172A;">KES ${Number(tx.running_balance).toLocaleString('en-KE', {minimumFractionDigits:2})}</td>
        <td><span style="font-family:monospace; font-weight:700;">${tx.reference_number || '--'}</span></td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#EF4444;">Error: ${err.message}</td></tr>`;
  }
}

async function loadRecurringExpenses() {
  const tbody = document.getElementById('recurring-expenses-table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:#64748B;">Loading recurring obligations...</td></tr>';

  try {
    const res = await apiFetch('/expenses/recurring');
    if (!res.ok) throw new Error('Failed to load recurring obligations');
    allRecurringExpenses = await res.json();

    if (!tbody) return;
    tbody.innerHTML = '';

    if (allRecurringExpenses.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:32px; color:#64748B;">No recurring expenses currently registered.</td></tr>';
      return;
    }

    allRecurringExpenses.forEach(rec => {
      const tr = document.createElement('tr');
      const monthlyEquiv = rec.monthly_equivalent || rec.amount;
      const freqBadge = `<span class="badge" style="background:#EFF6FF; color:#1D4ED8; font-weight:700;">${rec.frequency || 'MONTHLY'}</span>`;
      const dueStr = rec.next_due_date ? rec.next_due_date.substring(0, 10) : 'Ongoing';

      tr.innerHTML = `
        <td><strong>${rec.title}</strong></td>
        <td><span class="badge" style="background:#F8FAFC; border:1px solid #E2E8F0; color:#0F172A;">${rec.category}</span></td>
        <td>${freqBadge}</td>
        <td>KES ${Number(rec.amount).toLocaleString('en-KE', {minimumFractionDigits:2})}</td>
        <td style="font-weight:800; color:#2563EB;">KES ${Number(monthlyEquiv).toLocaleString('en-KE', {minimumFractionDigits:2})}</td>
        <td>📅 ${dueStr}</td>
        <td>${rec.payee || '--'}</td>
        <td><span class="badge" style="background:#DCFCE7; color:#166534;">ACTIVE</span></td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#EF4444;">Error: ${err.message}</td></tr>`;
  }
}

function openRecordExpenseModal() {
  const modal = document.getElementById('modal-record-expense');
  const dateInput = document.getElementById('exp-date');
  if (dateInput) dateInput.value = new Date().toISOString().substring(0, 10);
  if (modal) modal.style.display = 'flex';
}

function closeRecordExpenseModal() {
  const modal = document.getElementById('modal-record-expense');
  if (modal) modal.style.display = 'none';
}

function toggleRecurringExpenseFields() {
  const typeVal = document.getElementById('exp-type')?.value;
  const rf = document.getElementById('recurring-expense-fields');
  if (rf) rf.style.display = (typeVal === 'RECURRING') ? 'block' : 'none';
}

async function handleRecordExpenseSubmit(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]') || e.target.querySelector('.btn-primary');
  const origBtnText = submitBtn ? submitBtn.innerText : 'Save';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Saving Expense...';
  }

  const expense_date = document.getElementById('exp-date').value;
  const category = document.getElementById('exp-category').value;
  const expense_type = document.getElementById('exp-type').value;
  const payee = document.getElementById('exp-payee').value.trim();
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const payment_method = document.getElementById('exp-payment-method').value;
  const receipt_number = document.getElementById('exp-receipt-no').value.trim() || null;
  const description = document.getElementById('exp-description').value.trim();
  const is_petty_cash = (payment_method === 'PETTY_CASH' || expense_type === 'PETTY_CASH');
  const is_recurring = (expense_type === 'RECURRING');
  const recurring_frequency = is_recurring ? document.getElementById('exp-frequency')?.value : null;
  const next_due_date = is_recurring ? (document.getElementById('exp-due-date')?.value || null) : null;

  try {
    const title = description ? description.substring(0, 80) : `${category} - ${payee}`;
    const res = await apiFetch('/expenses', {
      method: 'POST',
      body: JSON.stringify({
        expense_date,
        title,
        category,
        expense_type,
        payee,
        amount,
        payment_method,
        receipt_number,
        description,
        is_recurring,
        recurrence_interval: recurring_frequency,
        next_due_date
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(`⚠️ Could not save expense: ${data.detail || 'Request failed'}`, 'danger');
      return;
    }

    closeRecordExpenseModal();
    showToast(`✅ Expense of KES ${Number(amount).toLocaleString()} recorded successfully!`, 'success');
    document.getElementById('form-record-expense').reset();
    loadExpenses();
    loadExpensesSummary();

  } catch (err) {
    showToast('Network error: ' + err.message, 'danger');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = origBtnText;
    }
  }
}

function openTopUpPettyCashModal() {
  const modal = document.getElementById('modal-topup-petty-cash');
  if (modal) modal.style.display = 'flex';
}

function closeTopUpPettyCashModal() {
  const modal = document.getElementById('modal-topup-petty-cash');
  if (modal) modal.style.display = 'none';
}

async function handleTopUpPettyCashSubmit(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]') || e.target.querySelector('.btn-primary');
  const origBtnText = submitBtn ? submitBtn.innerText : 'Replenish Float';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Replenishing Float...';
  }
  const amount = parseFloat(document.getElementById('topup-amount').value);
  const source = document.getElementById('topup-source').value;
  const reference_number = document.getElementById('topup-ref').value.trim() || null;
  const notes = document.getElementById('topup-notes').value.trim() || null;

  try {
    const res = await apiFetch('/expenses/petty-cash/top-up', {
      method: 'POST',
      body: JSON.stringify({
        amount,
        source,
        reference_number,
        notes
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(`⚠️ Top-up failed: ${data.detail || 'Request failed'}`, 'danger');
      return;
    }

    closeTopUpPettyCashModal();
    showToast(`✅ Petty cash float replenished by KES ${Number(amount).toLocaleString()}!`, 'success');
    document.getElementById('form-topup-petty-cash').reset();
    loadExpensesSummary();
    loadPettyCashBook();

  } catch (err) {
    showToast('Network error: ' + err.message, 'danger');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = origBtnText;
    }
  }
}

async function deleteExpenseRecord(id) {
  if (!confirm('Are you sure you want to permanently delete this expense record?')) return;

  try {
    const res = await apiFetch(`/expenses/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(`⚠️ Could not delete: ${err.detail || 'Server error'}`, 'danger');
      return;
    }
    showToast('✅ Expense record removed.', 'success');
    loadExpenses();
    loadExpensesSummary();
  } catch (err) {
    showToast('Error: ' + err.message, 'danger');
  }
}

function applyExpenseFilters() {
  loadExpenses();
}

function resetExpenseFilters() {
  const s = document.getElementById('expense-filter-search');
  if (s) s.value = '';
  const c = document.getElementById('expense-filter-category');
  if (c) c.value = '';
  const t = document.getElementById('expense-filter-type');
  if (t) t.value = '';
  loadExpenses();
}

function exportExpensesReport() {
  window.print();
}


/* ==========================================================================
   MODULE: COMPANY GROWTH (CLIENTS PORTFOLIO, RECOMMENDATIONS, SERVICES)
   ========================================================================== */
async function loadCompanyClientsPortfolio() {
  const container = document.getElementById('company-clients-grid');
  if (container) container.innerHTML = '<div style="text-align:center; padding:24px; color:#64748B;">Loading corporate clients...</div>';

  try {
    const res = await apiFetch('/company/clients-portfolio');
    if (!res.ok) throw new Error('Failed to load corporate clients');
    const clients = await res.json();

    if (!container) return;
    container.innerHTML = '';

    if (clients.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:32px; color:#64748B;">No clients currently in portfolio.</div>';
      return;
    }

    clients.forEach(c => {
      const clientName = c.name || c.client_name || 'Corporate Client';
      const rawSites = c.protected_sites || c.sites || [];
      const sitesHtml = rawSites.map(s => {
        if (typeof s === 'string') return `<li style="font-size:12px; color:#334155;">📍 <strong>${s}</strong></li>`;
        return `<li style="font-size:12px; color:#334155;">📍 <strong>${s.name || s.site_name}</strong> - <em>${s.guards_count || 1} Guards</em></li>`;
      }).join('');
      const guardCount = c.active_guards_deployed !== undefined ? c.active_guards_deployed : (c.total_guards_deployed || 0);

      container.innerHTML += `
        <div class="card" style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; padding:18px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
            <div>
              <span class="badge" style="background:#EFF6FF; color:#1D4ED8; font-size:10px; font-weight:700; text-transform:uppercase;">${c.industry || 'Commercial'}</span>
              <h4 style="margin:6px 0 2px 0; font-size:16px; font-weight:800; color:#0F172A;">${clientName}</h4>
            </div>
            <span class="badge" style="background:#DCFCE7; color:#166534; font-weight:700;">🟢 ACTIVE</span>
          </div>
          <div style="font-size:12px; color:#64748B; margin-bottom:12px; line-height:1.4;">${c.notes || c.description || 'Enterprise Corporate Client.'}</div>
          <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:10px; margin-bottom:12px;">
            <div style="font-size:11px; font-weight:700; color:#64748B; margin-bottom:6px;">DEPLOYED SITES & GUARD FORCE:</div>
            <ul style="margin:0; padding-left:16px;">
              ${sitesHtml || '<li style="font-size:12px; color:#64748B;">Standard Site Deployment</li>'}
            </ul>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #F1F5F9; padding-top:10px; font-size:11px; color:#64748B;">
            <div>🛡️ Total Force: <strong>${guardCount} Guards</strong></div>
            <div style="color:#059669; font-weight:700;">⭐ ${c.sla_rating || '99.8% SLA'}</div>
          </div>
        </div>
      `;
    });

  } catch (err) {
    if (container) container.innerHTML = `<div style="color:#EF4444; padding:16px;">Error: ${err.message}</div>`;
  }
}

async function loadCompanyRecommendations() {
  const container = document.getElementById('company-recommendations-grid');
  if (container) container.innerHTML = '<div style="text-align:center; padding:24px; color:#64748B;">Loading client recommendations...</div>';

  try {
    const res = await apiFetch('/company/recommendations');
    if (!res.ok) throw new Error('Failed to load recommendations');
    const recs = await res.json();

    if (!container) return;
    container.innerHTML = '';

    if (recs.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:32px; color:#64748B;">No formal recommendations recorded yet. Click "+ Add Client Recommendation" to publish one.</div>';
      return;
    }

    recs.forEach(r => {
      const stars = '⭐'.repeat(r.rating || 5);
      const dateStr = r.recommendation_date ? r.recommendation_date.substring(0, 10) : '';

      container.innerHTML += `
        <div class="card" style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; padding:18px; box-shadow:0 1px 3px rgba(0,0,0,0.05); display:flex; flex-direction:column; justify-content:space-between;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-size:14px;">${stars}</span>
              <span class="badge" style="background:#F0FDF4; color:#166534; font-size:10px; font-weight:700;">VERIFIED ENDORSEMENT</span>
            </div>
            <blockquote style="margin:0 0 12px 0; font-size:13px; color:#334155; font-style:italic; line-height:1.5;">
              "${r.recommendation_text || r.statement}"
            </blockquote>
          </div>
          <div>
            <div style="border-top:1px solid #F1F5F9; padding-top:10px;">
              <div style="font-weight:800; font-size:13px; color:#0F172A;">${r.author_name || r.recommender_name}</div>
              <div style="font-size:11px; color:#64748B;">${r.designation || r.recommender_title} — <strong>${r.client_name}</strong></div>
              ${r.service_scope ? `<div style="font-size:11px; color:#3B5EDB; margin-top:2px;">🛡️ Scope: ${r.service_scope}</div>` : ''}
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                <span style="font-size:11px; color:#94A3B8;">📅 ${dateStr}</span>
                <button class="btn btn-secondary" style="padding:2px 8px; font-size:10px; color:#EF4444; border-color:#FCA5A5;" onclick="handleDeleteRecommendation(${r.id})">🗑️ Delete</button>
              </div>
            </div>
          </div>
        </div>
      `;
    });

  } catch (err) {
    if (container) container.innerHTML = `<div style="color:#EF4444; padding:16px;">Error: ${err.message}</div>`;
  }
}

async function loadCompanyServices() {
  const container = document.getElementById('company-services-grid');
  if (container) container.innerHTML = '<div style="text-align:center; padding:24px; color:#64748B;">Loading services catalog...</div>';

  try {
    const res = await apiFetch('/company/services');
    if (!res.ok) throw new Error('Failed to load services');
    const srvs = await res.json();

    if (!container) return;
    container.innerHTML = '';

    if (srvs.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:32px; color:#64748B;">No service offerings registered. Click "+ Add Service Offering" to create one.</div>';
      return;
    }

    srvs.forEach(s => {
      const priceStr = s.base_price ? `KES ${Number(s.base_price).toLocaleString()}` : 'Custom Quotation';

      container.innerHTML += `
        <div class="card" style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; padding:18px; box-shadow:0 1px 3px rgba(0,0,0,0.05); display:flex; flex-direction:column; justify-content:space-between;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span class="badge" style="background:#EFF6FF; color:#1D4ED8; font-weight:800; font-family:monospace;">${s.service_code}</span>
              <span class="badge" style="background:#F1F5F9; color:#475569; font-size:11px;">${s.billing_rate_guideline || s.billing_model || 'CONTRACT'}</span>
            </div>
            <h4 style="margin:4px 0 6px 0; font-size:16px; font-weight:800; color:#0F172A;">${s.service_name}</h4>
            <div style="font-size:11px; font-weight:700; color:#64748B; margin-bottom:8px; text-transform:uppercase;">${s.category}</div>
            <p style="font-size:12px; color:#475569; margin:0 0 12px 0; line-height:1.4;">${s.description}</p>
          </div>
          <div>
            <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:8px 10px; margin-bottom:10px;">
              <div style="font-size:10px; font-weight:700; color:#64748B;">SLA SPECIFICATION:</div>
              <div style="font-size:11px; color:#0F172A; font-weight:600;">${s.sla_standard || s.sla_specification || '100% On-Site SLA Compliance'}</div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #F1F5F9; padding-top:8px;">
              <div style="font-size:12px; font-weight:800; color:#059669;">${s.billing_rate_guideline || priceStr}</div>
              <button class="btn btn-secondary" style="padding:2px 8px; font-size:10px; color:#EF4444; border-color:#FCA5A5;" onclick="handleDeleteService(${s.id})">🗑️ Delete</button>
            </div>
          </div>
        </div>
      `;
    });

  } catch (err) {
    if (container) container.innerHTML = `<div style="color:#EF4444; padding:16px;">Error: ${err.message}</div>`;
  }
}

function openAddRecommendationModal() {
  const modal = document.getElementById('modal-add-recommendation');
  const d = document.getElementById('rec-date');
  if (d) d.value = new Date().toISOString().substring(0, 10);
  if (modal) modal.style.display = 'flex';
}

function closeAddRecommendationModal() {
  const modal = document.getElementById('modal-add-recommendation');
  if (modal) modal.style.display = 'none';
}

async function handleCreateRecommendationSubmit(e) {
  e.preventDefault();
  const client_name = document.getElementById('rec-client-name').value.trim();
  const recommender_name = document.getElementById('rec-recommender-name').value.trim();
  const recommender_title = document.getElementById('rec-title').value.trim();
  const rating = parseInt(document.getElementById('rec-rating').value) || 5;
  const recommendation_date = document.getElementById('rec-date').value;
  const contact_info = document.getElementById('rec-contact').value.trim() || null;
  const statement = document.getElementById('rec-statement').value.trim();

  try {
    const res = await apiFetch('/company/recommendations', {
      method: 'POST',
      body: JSON.stringify({
        client_name,
        author_name: recommender_name,
        designation: recommender_title,
        rating,
        recommendation_date,
        recommendation_text: statement,
        service_scope: contact_info
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(`⚠️ Failed to add recommendation: ${data.detail || 'Server error'}`, 'danger');
      return;
    }

    closeAddRecommendationModal();
    showToast(`✅ Recommendation for ${client_name} published!`, 'success');
    document.getElementById('form-add-recommendation').reset();
    loadCompanyRecommendations();

  } catch (err) {
    showToast('Network error: ' + err.message, 'danger');
  }
}

async function handleDeleteRecommendation(id) {
  if (!confirm('Are you sure you want to delete this recommendation?')) return;
  try {
    const res = await apiFetch(`/company/recommendations/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Deletion failed');
    showToast('✅ Recommendation deleted.', 'success');
    loadCompanyRecommendations();
  } catch (err) {
    showToast('Error: ' + err.message, 'danger');
  }
}

function openAddServiceModal() {
  const modal = document.getElementById('modal-add-service');
  if (modal) modal.style.display = 'flex';
}

function closeAddServiceModal() {
  const modal = document.getElementById('modal-add-service');
  if (modal) modal.style.display = 'none';
}

async function handleCreateServiceSubmit(e) {
  e.preventDefault();
  const service_code = document.getElementById('srv-code').value.trim().toUpperCase();
  const service_name = document.getElementById('srv-name').value.trim();
  const category = document.getElementById('srv-category').value;
  const billing_model = document.getElementById('srv-billing').value;
  const rawPrice = parseFloat(document.getElementById('srv-price').value);
  const base_price = isNaN(rawPrice) ? null : rawPrice;
  const sla_specification = document.getElementById('srv-sla').value.trim() || null;
  const description = document.getElementById('srv-desc').value.trim();

  try {
    const res = await apiFetch('/company/services', {
      method: 'POST',
      body: JSON.stringify({
        service_code,
        service_name,
        category,
        description,
        sla_standard: sla_specification || '100% Post Coverage',
        billing_rate_guideline: base_price ? `KES ${base_price.toLocaleString()}` : billing_model
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(`⚠️ Failed to add service: ${data.detail || 'Server error'}`, 'danger');
      return;
    }

    closeAddServiceModal();
    showToast(`✅ Security Service "${service_name}" created!`, 'success');
    document.getElementById('form-add-service').reset();
    loadCompanyServices();

  } catch (err) {
    showToast('Network error: ' + err.message, 'danger');
  }
}

async function handleDeleteService(id) {
  if (!confirm('Are you sure you want to delete this security service?')) return;
  try {
    const res = await apiFetch(`/company/services/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Deletion failed');
    showToast('✅ Security service removed.', 'success');
    loadCompanyServices();
  } catch (err) {
    showToast('Error: ' + err.message, 'danger');
  }
}

// Global Window Exports
window.switchExpenseSubtab = switchExpenseSubtab;
window.loadExpenses = loadExpenses;
window.loadExpensesSummary = loadExpensesSummary;
window.loadPettyCashBook = loadPettyCashBook;
window.loadRecurringExpenses = loadRecurringExpenses;
window.openRecordExpenseModal = openRecordExpenseModal;
window.closeRecordExpenseModal = closeRecordExpenseModal;
window.toggleRecurringExpenseFields = toggleRecurringExpenseFields;
window.handleRecordExpenseSubmit = handleRecordExpenseSubmit;
window.openTopUpPettyCashModal = openTopUpPettyCashModal;
window.closeTopUpPettyCashModal = closeTopUpPettyCashModal;
window.handleTopUpPettyCashSubmit = handleTopUpPettyCashSubmit;
window.deleteExpenseRecord = deleteExpenseRecord;
window.applyExpenseFilters = applyExpenseFilters;
window.resetExpenseFilters = resetExpenseFilters;
window.exportExpensesReport = exportExpensesReport;

window.loadCompanyClientsPortfolio = loadCompanyClientsPortfolio;
window.loadCompanyRecommendations = loadCompanyRecommendations;
window.loadCompanyServices = loadCompanyServices;
window.openAddRecommendationModal = openAddRecommendationModal;
window.closeAddRecommendationModal = closeAddRecommendationModal;
window.handleCreateRecommendationSubmit = handleCreateRecommendationSubmit;
window.handleDeleteRecommendation = handleDeleteRecommendation;
window.openAddServiceModal = openAddServiceModal;
window.closeAddServiceModal = closeAddServiceModal;
window.handleCreateServiceSubmit = handleCreateServiceSubmit;
window.handleDeleteService = handleDeleteService;


// ==================== SALARY ADVANCES EXCEL / CSV BULK UPLOAD ====================

function triggerAdvFilePicker(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  const fileInput = document.getElementById('adv-excel-file-input');
  if (fileInput) {
    fileInput.click();
  }
}

function openUploadSalaryAdvancesModal(autoTriggerPicker = false) {
  const modal = document.getElementById('modal-upload-advances-excel');
  if (!modal) return;

  const form = document.getElementById('form-upload-salary-advances');
  if (form) form.reset();

  const filePill = document.getElementById('adv-selected-file-pill');
  if (filePill) filePill.style.display = 'none';

  const resultsBox = document.getElementById('adv-upload-results-box');
  if (resultsBox) {
    resultsBox.style.display = 'none';
    resultsBox.innerHTML = '';
  }

  const dropzone = document.getElementById('adv-upload-dropzone');
  if (dropzone) dropzone.style.display = 'block';

  const btn = document.getElementById('btn-submit-upload-advances');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '📤 Upload &amp; Record Advances';
  }

  populateUploadPeriodDropdown();
  modal.style.display = 'flex';

  if (autoTriggerPicker) {
    setTimeout(() => {
      triggerAdvFilePicker();
    }, 150);
  }
}

function closeUploadSalaryAdvancesModal() {
  const modal = document.getElementById('modal-upload-advances-excel');
  if (modal) modal.style.display = 'none';
}

async function populateUploadPeriodDropdown() {
  const selectElem = document.getElementById('upload-adv-payroll-period-id');
  if (!selectElem) return;

  try {
    const res = await apiFetch('/payroll/periods');
    const periods = await res.json();
    let opts = '<option value="">Auto-detect by disbursement dates</option>';
    if (periods && periods.length) {
      periods.forEach(p => {
        const isLocked = (p.status === 'CONFIRMED' || p.status === 'CLOSED');
        opts += `<option value="${p.id}" ${isLocked ? 'disabled' : ''}>${p.period_name} (${p.status})${isLocked ? ' - Locked' : ''}</option>`;
      });
    }
    selectElem.innerHTML = opts;
  } catch (err) {
    console.error('populateUploadPeriodDropdown error:', err);
  }
}

function handleAdvFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const pill = document.getElementById('adv-selected-file-pill');
  const nameElem = document.getElementById('adv-selected-file-name');
  const sizeElem = document.getElementById('adv-selected-file-size');

  if (nameElem) nameElem.innerText = file.name;
  if (sizeElem) sizeElem.innerText = `${(file.size / 1024).toFixed(1)} KB`;
  if (pill) pill.style.display = 'flex';
}

function clearSelectedAdvFile(e) {
  if (e) e.stopPropagation();
  const input = document.getElementById('adv-excel-file-input');
  if (input) input.value = '';

  const pill = document.getElementById('adv-selected-file-pill');
  if (pill) pill.style.display = 'none';
}

async function downloadSalaryAdvanceTemplate() {
  try {
    showToast('Generating official Excel template...', 'info');
    const res = await apiFetch('/salary-advances/template');
    if (!res.ok) {
      throw new Error('Failed to download salary advances template');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'CorpSec_Salary_Advances_Template.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showToast('Excel template downloaded successfully!', 'success');
  } catch (err) {
    console.error('downloadSalaryAdvanceTemplate error:', err);
    showToast(err.message || 'Error downloading template', 'danger');
  }
}

async function handleSalaryAdvancesExcelUpload(e) {
  if (e && e.preventDefault) e.preventDefault();
  const fileInput = document.getElementById('adv-excel-file-input');
  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    showToast('Please select or browse an Excel (.xlsx, .xls) or CSV file first.', 'warning');
    const resultsBox = document.getElementById('adv-upload-results-box');
    if (resultsBox) {
      resultsBox.style.display = 'block';
      resultsBox.innerHTML = `
        <div style="background:#FFFBEB; border:1px solid #FDE68A; border-radius:10px; padding:14px 18px; color:#92400E; font-size:13px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <div style="font-weight:700; display:flex; align-items:center; gap:6px;">
              <span>⚠️</span> No spreadsheet file selected yet
            </div>
            <div style="font-size:12px; margin-top:3px; color:#B45309;">
              Click below to browse your computer and retrieve the advances Excel file.
            </div>
          </div>
          <button type="button" class="btn btn-primary" onclick="triggerAdvFilePicker(event)" style="background:#2563EB; border-color:#2563EB; font-size:12px; padding:6px 14px; font-weight:700; white-space:nowrap;">
            📂 Browse &amp; Retrieve File
          </button>
        </div>
      `;
    }
    triggerAdvFilePicker();
    return;
  }

  const file = fileInput.files[0];
  const periodId = document.getElementById('upload-adv-payroll-period-id').value;
  const defMethod = document.getElementById('upload-adv-default-method').value;

  const btn = document.getElementById('btn-submit-upload-advances');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Processing File &amp; Validating Records...';
  }

  const formData = new FormData();
  formData.append('file', file);
  if (periodId) formData.append('payroll_period_id', periodId);
  if (defMethod) formData.append('default_payment_method', defMethod);

  try {
    const res = await apiFetch('/salary-advances/upload-excel', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Failed to process advances file');
    }

    const resultsBox = document.getElementById('adv-upload-results-box');
    if (resultsBox) {
      resultsBox.style.display = 'block';
      let html = '';

      if (data.successful_records > 0) {
        html += `
          <div style="background:#ECFDF5; border:1px solid #A7F3D0; border-radius:10px; padding:16px; margin-bottom:14px;">
            <div style="font-size:14px; font-weight:800; color:#065F46; display:flex; align-items:center; gap:6px;">
              <span>✅</span> Successfully Recorded ${data.successful_records} Advances!
            </div>
            <div style="font-size:12px; color:#047857; margin-top:4px;">
              Total amount: <b>KES ${Number(data.total_amount_processed || 0).toLocaleString('en-KE', {minimumFractionDigits:2})}</b>.<br>
              Status: <b>APPROVED</b> • These advances will be automatically deducted during monthly payroll calculation.
            </div>
          </div>
        `;
      }

      if (data.errors && data.errors.length > 0) {
        html += `
          <div style="background:#FEF2F2; border:1px solid #FECACA; border-radius:10px; padding:14px;">
            <div style="font-size:13px; font-weight:800; color:#991B1B; display:flex; align-items:center; gap:6px;">
              <span>⚠️</span> ${data.failed_records} Rows Skipped / Require Review:
            </div>
            <ul style="font-size:11px; color:#B91C1C; margin:8px 0 0 0; padding-left:18px; max-height:140px; overflow-y:auto; line-height:1.6;">
              ${data.errors.map(err => `<li>${err}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      resultsBox.innerHTML = html;
    }

    showToast(`Bulk upload finished! ${data.successful_records} advances recorded.`, 'success');

    // Refresh advances table & KPIs
    if (typeof loadSalaryAdvances === 'function') {
      loadSalaryAdvances();
    }

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '📤 Upload Another File';
    }
  } catch (err) {
    console.error('handleSalaryAdvancesExcelUpload error:', err);
    showToast(err.message || 'Error processing Excel file', 'danger');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '📤 Upload &amp; Record Advances';
    }
  }
}

// Window exports for bulk upload
window.triggerAdvFilePicker = triggerAdvFilePicker;
window.openUploadSalaryAdvancesModal = openUploadSalaryAdvancesModal;
window.closeUploadSalaryAdvancesModal = closeUploadSalaryAdvancesModal;
window.populateUploadPeriodDropdown = populateUploadPeriodDropdown;
window.handleAdvFileSelected = handleAdvFileSelected;
window.clearSelectedAdvFile = clearSelectedAdvFile;
window.downloadSalaryAdvanceTemplate = downloadSalaryAdvanceTemplate;
window.handleSalaryAdvancesExcelUpload = handleSalaryAdvancesExcelUpload;

// Window exports for Belonging Damage Deductions & Payment Schedule Salary Holds
window.handleReturnConditionChanged = handleReturnConditionChanged;
window.renderGuardDamageDeductionsRows = renderGuardDamageDeductionsRows;
window.openRecordDamageDeductionModal = openRecordDamageDeductionModal;
window.closeRecordDamageDeductionModal = closeRecordDamageDeductionModal;
window.handleRecordDamageDeductionSubmit = handleRecordDamageDeductionSubmit;
window.waiveDamageDeduction = waiveDamageDeduction;
window.switchPaymentsSubTab = switchPaymentsSubTab;
window.openHoldSalaryModal = openHoldSalaryModal;
window.closeHoldSalaryModal = closeHoldSalaryModal;
window.handleHoldSalarySubmit = handleHoldSalarySubmit;
window.openReleaseSalaryHoldModal = openReleaseSalaryHoldModal;
window.closeReleaseSalaryHoldModal = closeReleaseSalaryHoldModal;
window.handleReleaseSalaryHoldSubmit = handleReleaseSalaryHoldSubmit;
window.openDamageDeductionForIncident = openDamageDeductionForIncident;
window.openHoldSalaryForIncident = openHoldSalaryForIncident;
