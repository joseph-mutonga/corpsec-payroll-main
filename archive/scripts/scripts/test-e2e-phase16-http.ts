export {};

const BASE_URL = 'http://localhost:3005';

async function loginUser(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data: any = await res.json();
  if (!data.success) {
    throw new Error(`Login failed for ${email}: ${data.error}`);
  }
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error(`No cookie returned for ${email}`);
  return setCookie.split(';')[0];
}

async function runE2ETests() {
  console.log('================================================================');
  console.log('🌐 CORPSEC PHASE 16: E2E HTTP API TEST SUITE (PORT 3005)');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`, details || '');
    }
  }

  // 1. Authenticate as Admin & Employee
  console.log('--- 1. Authenticating Test Sessions ---');
  const adminCookie = await loginUser('admin@corpsec.co.ke', 'Admin@CorpSec2026!');
  console.log('Admin Cookie:', adminCookie);
  assert(!!adminCookie, 'Admin authenticated via /api/auth/login');

  const empCookie = await loginUser('jackson.kamau@corpsec.co.ke', 'Employee@CorpSec2026!');
  assert(!!empCookie, 'Employee authenticated via /api/auth/login');

  const adminHeaders = {
    'Content-Type': 'application/json',
    Cookie: adminCookie,
  };

  const empHeaders = {
    'Content-Type': 'application/json',
    Cookie: empCookie,
  };

  // 2. Test /api/leave/dashboard
  console.log('\n--- 2. Leave Dashboard API ---');
  const dashRes = await fetch(`${BASE_URL}/api/leave/dashboard?year=2026`, { headers: adminHeaders });
  const dashJson: any = await dashRes.json();
  console.log('Dashboard status:', dashRes.status, dashJson);
  assert(dashRes.status === 200 && dashJson.success, 'GET /api/leave/dashboard returns 200 & KPIs');
  assert(typeof dashJson?.data?.kpis?.employeesOnLeaveToday === 'number', 'Dashboard data contains employeesOnLeaveToday KPI');

  // 3. Test /api/leave/types CRUD
  console.log('\n--- 3. Leave Types API ---');
  const listTypesRes = await fetch(`${BASE_URL}/api/leave/types`, { headers: adminHeaders });
  const listTypesJson: any = await listTypesRes.json();
  assert(listTypesRes.status === 200 && listTypesJson.success, 'GET /api/leave/types returns 200');

  const typeCode = `HTTP-LT-${Date.now().toString().slice(-4)}`;
  const createTypeRes = await fetch(`${BASE_URL}/api/leave/types`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      code: typeCode,
      name: 'HTTP Test Leave',
      isPaid: true,
      defaultDays: 10,
      minNoticeDays: 1,
    }),
  });
  const createTypeJson: any = await createTypeRes.json();
  assert(createTypeRes.status === 201 && createTypeJson.success, 'POST /api/leave/types creates leave type');
  const testTypeId = createTypeJson.data.leaveType.id;

  // 4. Test /api/leave/policies CRUD
  console.log('\n--- 4. Leave Policies API ---');
  const policyCode = `HTTP-POL-${Date.now().toString().slice(-4)}`;
  const createPolRes = await fetch(`${BASE_URL}/api/leave/policies`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      leaveTypeId: testTypeId,
      policyName: 'HTTP Test Policy',
      policyCode,
      entitledDays: 10,
      approvalHierarchy: 'MANAGER_HR',
    }),
  });
  const createPolJson: any = await createPolRes.json();
  assert(createPolRes.status === 201 && createPolJson.success, 'POST /api/leave/policies creates leave policy');

  // 5. Test /api/leave/balances & /api/leave/ledger
  console.log('\n--- 5. Leave Balances & Ledger API ---');
  const empListRes = await fetch(`${BASE_URL}/api/employees?pageSize=5`, { headers: adminHeaders });
  const empListJson: any = await empListRes.json();
  const testEmployeeId = Array.isArray(empListJson.data) ? empListJson.data[0].id : empListJson.data?.employees[0]?.id;

  const balRes = await fetch(`${BASE_URL}/api/leave/balances?employeeId=${testEmployeeId}`, { headers: adminHeaders });
  const balJson: any = await balRes.json();
  assert(balRes.status === 200 && balJson.success, 'GET /api/leave/balances returns employee balance matrix');

  const adjustRes = await fetch(`${BASE_URL}/api/leave/balances`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      employeeId: testEmployeeId,
      leaveTypeId: testTypeId,
      direction: 'ADD',
      days: 2,
      reason: 'E2E HTTP Test Credit Adjustment',
    }),
  });
  const adjustJson: any = await adjustRes.json();
  assert(adjustRes.status === 200 && adjustJson.success, 'POST /api/leave/balances records manual adjustment');

  const ledgerRes = await fetch(`${BASE_URL}/api/leave/ledger?employeeId=${testEmployeeId}`, { headers: adminHeaders });
  const ledgerJson: any = await ledgerRes.json();
  assert(ledgerRes.status === 200 && ledgerJson.success, 'GET /api/leave/ledger returns transaction history');

  // 6. Test /api/portal/leave (ESS Portal API)
  console.log('\n--- 6. ESS Portal Leave Hub API ---');
  const portalRes = await fetch(`${BASE_URL}/api/portal/leave`, { headers: empHeaders });
  const portalJson: any = await portalRes.json();
  assert(portalRes.status === 200 && portalJson.success, 'GET /api/portal/leave returns authenticated employee data');

  const calcRes = await fetch(`${BASE_URL}/api/portal/leave/calculate`, {
    method: 'POST',
    headers: empHeaders,
    body: JSON.stringify({
      startDate: '2026-10-05',
      endDate: '2026-10-09',
      leaveTypeId: testTypeId,
      isHalfDay: false,
    }),
  });
  const calcJson: any = await calcRes.json();
  assert(calcRes.status === 200 && calcJson.success && calcJson.data.calculation.durationDays === 5, 'POST /api/portal/leave/calculate dynamic preview computes 5 working days');

  // 7. Submit Application & Approval Chain via HTTP
  console.log('\n--- 7. Leave Application & Approval Chain via HTTP ---');
  // Use unique day offset in 2027 to guarantee no overlap across runs
  const uniqueOffset = Math.floor(Math.random() * 200) + 10;
  const leaveStart = new Date(2027, 0, 1 + uniqueOffset);
  while (leaveStart.getDay() === 0 || leaveStart.getDay() === 6 || leaveStart.getDay() > 3) {
    leaveStart.setDate(leaveStart.getDate() + 1);
  }
  const leaveEnd = new Date(leaveStart.getTime() + 2 * 24 * 60 * 60 * 1000);

  const applyRes = await fetch(`${BASE_URL}/api/portal/leave`, {
    method: 'POST',
    headers: empHeaders,
    body: JSON.stringify({
      leaveTypeId: testTypeId,
      startDate: leaveStart.toISOString().split('T')[0],
      endDate: leaveEnd.toISOString().split('T')[0],
      reason: 'E2E HTTP Leave Application for Annual Rest',
    }),
  });
  const applyJson: any = await applyRes.json();
  console.log('Apply JSON response:', applyRes.status, applyJson);
  assert(applyRes.status === 201 && applyJson.success, 'POST /api/portal/leave submits application');
  const requestId = applyJson.data.leaveRequest.id;

  // Manager Approval via HTTP
  const approveRes = await fetch(`${BASE_URL}/api/leave/requests/${requestId}/approve`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ level: 'HR', comments: 'E2E HTTP Approved' }),
  });
  const approveJson: any = await approveRes.json();
  assert(approveRes.status === 200 && approveJson.success, 'POST /api/leave/requests/[id]/approve approves request');

  // 8. Test /api/leave/calendar & /api/leave/team
  console.log('\n--- 8. Calendar & Team Availability API ---');
  const calRes = await fetch(`${BASE_URL}/api/leave/calendar`, { headers: adminHeaders });
  const calJson: any = await calRes.json();
  assert(calRes.status === 200 && calJson.success, 'GET /api/leave/calendar returns calendar events');

  const teamRes = await fetch(`${BASE_URL}/api/leave/team`, { headers: adminHeaders });
  const teamJson: any = await teamRes.json();
  assert(teamRes.status === 200 && teamJson.success, 'GET /api/leave/team returns team availability matrix');

  // 9. Test /api/leave/absences
  console.log('\n--- 9. Absence Management API ---');
  const absCreateRes = await fetch(`${BASE_URL}/api/leave/absences`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      employeeId: testEmployeeId,
      date: '2026-10-15',
      absenceType: 'SICK',
      reason: 'E2E HTTP Absence Notice',
    }),
  });
  const absCreateJson: any = await absCreateRes.json();
  assert(absCreateRes.status === 201 && absCreateJson.success, 'POST /api/leave/absences records absence incident');

  // 10. Test /api/leave/payroll-export & /api/leave/reports
  console.log('\n--- 10. Payroll Export & Reports API ---');
  const payrollRes = await fetch(`${BASE_URL}/api/leave/payroll-export?startDate=2026-01-01&endDate=2026-12-31`, { headers: adminHeaders });
  const payrollJson: any = await payrollRes.json();
  assert(payrollRes.status === 200 && payrollJson.success, 'GET /api/leave/payroll-export returns consumption matrix');

  const reportJsonRes = await fetch(`${BASE_URL}/api/leave/reports?type=LEAVE_REGISTER&format=json`, { headers: adminHeaders });
  const reportJsonData: any = await reportJsonRes.json();
  assert(reportJsonRes.status === 200 && reportJsonData.success, 'GET /api/leave/reports?format=json returns report data');

  const reportCsvRes = await fetch(`${BASE_URL}/api/leave/reports?type=LEAVE_REGISTER&format=csv`, { headers: adminHeaders });
  assert(reportCsvRes.status === 200 && !!reportCsvRes.headers.get('content-type')?.includes('text/csv'), 'GET /api/leave/reports?format=csv returns text/csv stream');

  console.log('\n================================================================');
  console.log(`🌐 E2E HTTP TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('================================================================\n');

  if (passed === total) {
    console.log('🎉 ALL PHASE 16 HTTP ENDPOINTS VALIDATED SUCCESSFULLY ON PORT 3005!');
  } else {
    console.error('⚠️ SOME HTTP TESTS FAILED.');
    process.exit(1);
  }
}

runE2ETests().catch((err) => {
  console.error('Fatal error running E2E HTTP tests:', err);
  process.exit(1);
});
