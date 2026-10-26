export {};

const BASE_URL = 'http://localhost:3005';

async function main() {
  console.log('================================================================');
  console.log('🌐 CORPSEC PHASE 12: HTTP REST E2E & RBAC SECURITY TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      if (details) console.error(`     Details: ${details}`);
      failed++;
    }
  }

  // 1. Authenticate Users
  console.log('🔹 1. Authenticating Roles (HR Admin, Station Supervisor, Guard Jackson)...');

  async function login(email: string, password: string): Promise<string> {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    const cookie = res.headers.get('set-cookie');
    if (!cookie) {
      throw new Error(`Login failed for ${email}: ${JSON.stringify(json)}`);
    }
    return cookie;
  }

  const hrAdminCookie = await login('hr.admin@corpsec.co.ke', 'HrAdmin@CorpSec2026!');
  assert(Boolean(hrAdminCookie), 'HR Admin successfully authenticated');

  const hrManagerCookie = await login('hr.manager@corpsec.co.ke', 'HrManager@CorpSec2026!');
  assert(Boolean(hrManagerCookie), 'HR Manager successfully authenticated');

  const jacksonCookie = await login('jackson.kamau@corpsec.co.ke', 'Employee@CorpSec2026!');
  assert(Boolean(jacksonCookie), 'Guard Jackson successfully authenticated');

  // 2. Employee Self-Service Clocking & Anti-Tampering HTTP Tests
  console.log('\n🔹 2. Testing Employee Self-Service Clocking via HTTP...');

  function getErrMsg(json: any): string {
    if (typeof json.error === 'string') return json.error;
    if (json.error?.message) return json.error.message;
    return json.message || '';
  }

  // 2. Employee Self-Service Clocking & Anti-Tampering HTTP Tests
  console.log('\n🔹 2. Testing Employee Self-Service Clocking via HTTP...');

  const { db } = await import('../src/lib/db');
  const jacksonEmp = await db.employee.findFirst({ where: { employeeNumber: 'CORP-000001' } });
  if (jacksonEmp) {
    await db.attendanceEvent.deleteMany({ where: { employeeId: jacksonEmp.id } });
    await db.overtimeRecord.deleteMany({ where: { employeeId: jacksonEmp.id } });
    await db.attendanceRecord.deleteMany({ where: { employeeId: jacksonEmp.id } });
  }

  // Jackson Clock-In
  const clockInRes = await fetch(`${BASE_URL}/api/portal/attendance/clock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jacksonCookie },
    body: JSON.stringify({ eventType: 'CLOCK_IN', notes: 'E2E Self Service Clock-In' }),
  });
  const clockInJson = await clockInRes.json();
  assert(clockInRes.status === 200 && clockInJson.success, 'Jackson successfully clocked in via /api/portal/attendance/clock');

  // Anti-tampering: Double Clock-In HTTP rejection
  const doubleClockInRes = await fetch(`${BASE_URL}/api/portal/attendance/clock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jacksonCookie },
    body: JSON.stringify({ eventType: 'CLOCK_IN' }),
  });
  const doubleClockInJson = await doubleClockInRes.json();
  assert(
    !doubleClockInJson.success && getErrMsg(doubleClockInJson).includes('Double Clock-In blocked'),
    'Double Clock-In rejected via HTTP'
  );

  // Jackson Clock-Out
  const clockOutRes = await fetch(`${BASE_URL}/api/portal/attendance/clock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jacksonCookie },
    body: JSON.stringify({ eventType: 'CLOCK_OUT' }),
  });
  const clockOutJson = await clockOutRes.json();
  assert(clockOutRes.status === 200 && clockOutJson.success, 'Jackson successfully clocked out via /api/portal/attendance/clock');

  // Anti-tampering: Double Clock-Out HTTP rejection
  const doubleClockOutRes = await fetch(`${BASE_URL}/api/portal/attendance/clock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jacksonCookie },
    body: JSON.stringify({ eventType: 'CLOCK_OUT' }),
  });
  const doubleClockOutJson = await doubleClockOutRes.json();
  assert(
    !doubleClockOutJson.success && getErrMsg(doubleClockOutJson).includes('Double Clock-Out blocked'),
    'Double Clock-Out rejected via HTTP'
  );

  // 3. Attendance Command Center Metrics
  console.log('\n🔹 3. Testing Attendance Command Center API...');
  const statsRes = await fetch(`${BASE_URL}/api/attendance/stats`, {
    headers: { Cookie: hrAdminCookie },
  });
  const statsJson = await statsRes.json();
  assert(statsRes.status === 200 && statsJson.success, 'GET /api/attendance/stats returns 200 OK with KPIs');

  // 4. Daily Attendance Board API
  console.log('\n🔹 4. Testing Daily Attendance Board API...');
  const dailyRes = await fetch(`${BASE_URL}/api/attendance/daily`, {
    headers: { Cookie: hrAdminCookie },
  });
  const dailyJson = await dailyRes.json();
  assert(dailyRes.status === 200 && dailyJson.success, 'GET /api/attendance/daily returns 200 OK');

  if (dailyJson.data.records.length > 0) {
    const targetRecord = dailyJson.data.records[0];
    const overrideRes = await fetch(`${BASE_URL}/api/attendance/daily`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: hrAdminCookie },
      body: JSON.stringify({
        attendanceRecordId: targetRecord.id,
        attendanceStatus: 'PRESENT',
        notes: 'Verified via E2E muster roll audit',
      }),
    });
    const overrideJson = await overrideRes.json();
    assert(overrideRes.status === 200 && overrideJson.success, 'POST /api/attendance/daily manual status override succeeded');
  }

  // 5. Work Schedules & Shifts Management
  console.log('\n🔹 5. Testing Work Schedules & Shifts Endpoints...');
  const schedulesRes = await fetch(`${BASE_URL}/api/attendance/schedules`, {
    headers: { Cookie: hrAdminCookie },
  });
  const schedulesJson = await schedulesRes.json();
  assert(schedulesRes.status === 200 && schedulesJson.success, 'GET /api/attendance/schedules returns 200 OK');

  const shiftsRes = await fetch(`${BASE_URL}/api/attendance/shifts`, {
    headers: { Cookie: hrAdminCookie },
  });
  const shiftsJson = await shiftsRes.json();
  assert(shiftsRes.status === 200 && shiftsJson.success, 'GET /api/attendance/shifts returns 200 OK');

  // 6. Visual Duty Roster API
  console.log('\n🔹 6. Testing Visual Duty Roster Endpoint...');
  const rosterRes = await fetch(`${BASE_URL}/api/attendance/roster`, {
    headers: { Cookie: hrAdminCookie },
  });
  const rosterJson = await rosterRes.json();
  assert(rosterRes.status === 200 && rosterJson.success, 'GET /api/attendance/roster returns 200 OK');

  // 7. Overtime Workflow API
  console.log('\n🔹 7. Testing Overtime Review API...');
  const overtimeRes = await fetch(`${BASE_URL}/api/attendance/overtime`, {
    headers: { Cookie: hrAdminCookie },
  });
  const overtimeJson = await overtimeRes.json();
  assert(overtimeRes.status === 200 && overtimeJson.success, 'GET /api/attendance/overtime returns 200 OK');

  // 8. Public Holidays API
  console.log('\n🔹 8. Testing Public Holidays Endpoint...');
  const holidaysRes = await fetch(`${BASE_URL}/api/attendance/holidays`, {
    headers: { Cookie: hrAdminCookie },
  });
  const holidaysJson = await holidaysRes.json();
  assert(holidaysRes.status === 200 && holidaysJson.success, 'GET /api/attendance/holidays returns 200 OK');

  // 9. Attendance CSV Importer Preview API
  console.log('\n🔹 9. Testing Attendance CSV Importer API...');
  const csvSample = `EmployeeNumber,Date,ClockIn,ClockOut,Source\nCORP-000001,2026-08-14,06:00,18:00,BIOMETRIC`;
  const importPreviewRes = await fetch(`${BASE_URL}/api/attendance/import/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: hrAdminCookie },
    body: JSON.stringify({ csvContent: csvSample }),
  });
  const importPreviewJson = await importPreviewRes.json();
  assert(importPreviewRes.status === 200 && importPreviewJson.success && importPreviewJson.data.validCount === 1, 'POST /api/attendance/import/preview validates CSV');

  // 10. Attendance Reports & CSV Export
  console.log('\n🔹 10. Testing Attendance Reports & CSV Export...');
  const reportsRes = await fetch(`${BASE_URL}/api/attendance/reports`, {
    headers: { Cookie: hrAdminCookie },
  });
  const reportsJson = await reportsRes.json();
  assert(reportsRes.status === 200 && reportsJson.success, 'GET /api/attendance/reports returns 200 OK');

  const csvExportRes = await fetch(`${BASE_URL}/api/attendance/reports?export=csv`, {
    headers: { Cookie: hrAdminCookie },
  });
  const contentType = csvExportRes.headers.get('content-type');
  assert(csvExportRes.status === 200 && Boolean(contentType?.includes('text/csv')), 'GET /api/attendance/reports?export=csv returns text/csv download');

  // 11. Attendance Settings API
  console.log('\n🔹 11. Testing Attendance Settings Configuration API...');
  const settingsGetRes = await fetch(`${BASE_URL}/api/attendance/settings`, {
    headers: { Cookie: hrAdminCookie },
  });
  const settingsGetJson = await settingsGetRes.json();
  assert(settingsGetRes.status === 200 && settingsGetJson.success, 'GET /api/attendance/settings returns 200 OK');

  const settingsPatchRes = await fetch(`${BASE_URL}/api/attendance/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: hrAdminCookie },
    body: JSON.stringify({ gracePeriodMinutes: 15, maxDailyOvertimeMinutes: 360 }),
  });
  const settingsPatchJson = await settingsPatchRes.json();
  assert(settingsPatchRes.status === 200 && settingsPatchJson.success, 'PATCH /api/attendance/settings updates configuration');

  // 12. Manager Scoped Attendance Endpoint
  console.log('\n🔹 12. Testing Manager Scoped Attendance View...');
  const managerRes = await fetch(`${BASE_URL}/api/manager/attendance`, {
    headers: { Cookie: hrManagerCookie },
  });
  const managerJson = await managerRes.json();
  assert(managerRes.status === 200 && managerJson.success, 'GET /api/manager/attendance returns 200 OK scoped for HR Manager');

  // 13. RBAC Isolation & Security Guards
  console.log('\n🔹 13. Testing RBAC Security Isolation & Access Controls...');

  // Standard employee blocked from Daily Board
  const rbacDailyRes = await fetch(`${BASE_URL}/api/attendance/daily`, {
    headers: { Cookie: jacksonCookie },
  });
  assert(rbacDailyRes.status === 403, 'RBAC: Guard Jackson blocked from /api/attendance/daily (403 Forbidden)');

  // Standard employee blocked from Attendance Settings
  const rbacSettingsRes = await fetch(`${BASE_URL}/api/attendance/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: jacksonCookie },
    body: JSON.stringify({ gracePeriodMinutes: 50 }),
  });
  assert(rbacSettingsRes.status === 403, 'RBAC: Guard Jackson blocked from modifying attendance settings (403 Forbidden)');

  // Standard employee blocked from Overtime Approval
  const rbacOvertimeRes = await fetch(`${BASE_URL}/api/attendance/overtime`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: jacksonCookie },
    body: JSON.stringify({ overtimeId: 'dummy_ot_id', action: 'APPROVE' }),
  });
  assert(rbacOvertimeRes.status === 403, 'RBAC: Guard Jackson blocked from approving overtime (403 Forbidden)');

  // Standard employee blocked from CSV Import
  const rbacImportRes = await fetch(`${BASE_URL}/api/attendance/import/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jacksonCookie },
    body: JSON.stringify({ csvContent: csvSample }),
  });
  assert(rbacImportRes.status === 403, 'RBAC: Guard Jackson blocked from importing attendance files (403 Forbidden)');

  // Summary
  console.log('\n================================================================');
  console.log(`📊 PHASE 12 HTTP E2E RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error running test-e2e-phase12-http:', err);
  process.exit(1);
});
