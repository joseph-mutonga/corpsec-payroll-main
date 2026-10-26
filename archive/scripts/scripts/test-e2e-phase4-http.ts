export {};

const BASE_URL = process.env.BASE_URL || 'http://localhost:3005';

function logPass(msg: string) {
  console.log(`  ✓ ${msg}`);
}

function logFail(msg: string, details?: any) {
  console.error(`  ❌ ${msg}`);
  if (details) console.error(JSON.stringify(details, null, 2));
  process.exit(1);
}

async function runE2eTests() {
  console.log('================================================================');
  console.log('  PHASE 4 E2E HTTP INTEGRATION TEST SUITE (PORT 3005)');
  console.log('================================================================\n');

  let cookieHeader = '';

  // 1. Authenticate as Super Admin / HR Admin
  console.log('STEP 1: Authenticating as HR Admin (admin@corpsec.co.ke)...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@corpsec.co.ke',
      password: 'Admin@CorpSec2026!',
    }),
  });

  if (!loginRes.ok) {
    logFail('Login request failed with status ' + loginRes.status);
  }

  const loginData = await loginRes.json();
  if (!loginData.success) {
    logFail('Login failed', loginData);
  }

  const setCookie = loginRes.headers.get('set-cookie');
  if (setCookie) {
    cookieHeader = setCookie.split(';')[0];
  }
  logPass(`Authenticated successfully as: ${loginData.data.user.email}`);

  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  };

  // 2. Fetch Shifts Catalog
  console.log('\nSTEP 2: Querying Shift Definitions Catalog...');
  const shiftsRes = await fetch(`${BASE_URL}/api/attendance/shifts`, { headers: defaultHeaders });
  const shiftsData = await shiftsRes.json();
  if (!shiftsData.success || !Array.isArray(shiftsData.data)) {
    logFail('Failed to fetch shifts', shiftsData);
  }
  logPass(`Retrieved ${shiftsData.data.length} configured shifts`);

  // 3. Create Custom Test Shift
  console.log('\nSTEP 3: Creating Tactical Night Escort Shift...');
  const customShiftCode = `SHF-TAC-${Date.now().toString().slice(-4)}`;
  const createShiftRes = await fetch(`${BASE_URL}/api/attendance/shifts`, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify({
      code: customShiftCode,
      name: 'Tactical Escort Night Shift',
      startTime: '20:00',
      endTime: '08:00',
      shiftType: 'NIGHT',
      isOvernight: true,
      gracePeriodMinutes: 20,
      breakDurationMinutes: 60,
      isBreakPaid: true,
    }),
  });
  const createShiftData = await createShiftRes.json();
  if (!createShiftData.success) {
    logFail('Failed to create shift', createShiftData);
  }
  logPass(`Created shift: ${createShiftData.data.name} (${createShiftData.data.code})`);

  // 4. Query Work Schedules
  console.log('\nSTEP 4: Querying Work Schedules...');
  const schRes = await fetch(`${BASE_URL}/api/attendance/schedules`, { headers: defaultHeaders });
  const schData = await schRes.json();
  if (!schData.success) logFail('Failed to fetch schedules', schData);
  logPass(`Retrieved ${schData.data.length} work schedules`);

  // 5. Test Live Clock-In / Out Event
  console.log('\nSTEP 5: Logging Live Clock Event...');
  const todayStatusCheck = await (await fetch(`${BASE_URL}/api/attendance/clock/today`, { headers: defaultHeaders })).json();
  const eventType = todayStatusCheck.data?.isClockedIn && !todayStatusCheck.data?.isClockedOut ? 'CLOCK_OUT' : 'CLOCK_IN';

  const clockRes = await fetch(`${BASE_URL}/api/attendance/clock`, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify({
      eventType,
      source: 'PORTAL',
      notes: `Automated test ${eventType.toLowerCase()} execution`,
    }),
  });
  const clockData = await clockRes.json();
  if (!clockData.success) {
    logFail(`${eventType} event failed`, clockData);
  }
  logPass(`${eventType} successful: ${clockData.message}`);

  // 6. Test Clock Today Status
  console.log('\nSTEP 6: Checking Today Attendance Clock Status...');
  const todayClockRes = await fetch(`${BASE_URL}/api/attendance/clock/today`, { headers: defaultHeaders });
  const todayClockData = await todayClockRes.json();
  if (!todayClockData.success) logFail('Failed to fetch today clock status', todayClockData);
  logPass(`Duty status verified: ClockedIn = ${todayClockData.data.isClockedIn}`);

  // 7. Test Attendance Records Filter & Search
  console.log('\nSTEP 7: Querying Attendance Records with Filters...');
  const recordsRes = await fetch(`${BASE_URL}/api/attendance/records?limit=10`, { headers: defaultHeaders });
  const recordsData = await recordsRes.json();
  if (!recordsData.success) logFail('Failed to fetch attendance records', recordsData);
  logPass(`Retrieved ${recordsData.data.records.length} records (Total in system: ${recordsData.data.pagination.totalRecords})`);

  // 8. Test Log Overtime Claim
  console.log('\nSTEP 8: Logging Overtime Claim...');
  const empRes = await (await fetch(`${BASE_URL}/api/employees?pageSize=10`, { headers: defaultHeaders })).json();
  const testEmp = Array.isArray(empRes.data) ? empRes.data[0] : empRes.data?.employees?.[0];
  if (!testEmp) logFail('No employees available for test', empRes);

  const otRes = await fetch(`${BASE_URL}/api/attendance/overtime`, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify({
      employeeId: testEmp.id,
      date: new Date().toISOString().split('T')[0],
      scheduledHours: 12,
      actualHours: 15,
      overtimeHours: 3,
      reason: 'Urgent emergency VIP dispatch escort assignment',
    }),
  });
  const otData = await otRes.json();
  if (!otData.success) logFail('Failed to log overtime claim', otData);
  logPass(`Logged overtime claim ID: ${otData.data.id} (+3.0 hours)`);

  // 9. Approve Overtime Claim
  console.log('\nSTEP 9: Approving Overtime Claim...');
  const approveOtRes = await fetch(`${BASE_URL}/api/attendance/overtime/${otData.data.id}`, {
    method: 'PATCH',
    headers: defaultHeaders,
    body: JSON.stringify({
      action: 'APPROVE',
      comments: 'Verified with Operations Field Commander',
    }),
  });
  const approveOtData = await approveOtRes.json();
  if (!approveOtData.success) logFail('Failed to approve overtime', approveOtData);
  logPass(`Overtime claim approved successfully`);

  // 10. Test Attendance Import Preview & Commit
  console.log('\nSTEP 10: Testing Attendance CSV Import Engine...');
  const sampleImportRows = [
    {
      employeeNumber: testEmp.employeeNumber,
      date: '2026-08-10',
      clockIn: '06:00',
      clockOut: '18:00',
      shiftCode: 'SHF-DAY-12',
      notes: 'Automated CSV muster roll import test',
    },
  ];

  const previewImportRes = await fetch(`${BASE_URL}/api/attendance/import`, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify({ rows: sampleImportRows, mode: 'preview' }),
  });
  const previewImportData = await previewImportRes.json();
  if (!previewImportData.success || previewImportData.data.validCount !== 1) {
    logFail('CSV Import preview failed', previewImportData);
  }
  logPass(`Import preview validated: ${previewImportData.data.validCount} valid row(s), canCommit = ${previewImportData.data.canCommit}`);

  const commitImportRes = await fetch(`${BASE_URL}/api/attendance/import`, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify({ rows: sampleImportRows, mode: 'commit' }),
  });
  const commitImportData = await commitImportRes.json();
  if (!commitImportData.success) logFail('CSV Import commit failed', commitImportData);
  logPass(`Import commit successful: ${commitImportData.message}`);

  // 11. Test Period Locking
  console.log('\nSTEP 11: Testing Period Lock Security Endpoint...');
  const lockRes = await fetch(`${BASE_URL}/api/attendance/lock`, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify({
      year: 2026,
      month: 8,
      reason: 'E2E Test: Pre-payroll attendance locking verification',
    }),
  });
  const lockData = await lockRes.json();
  if (!lockData.success) logFail('Period lock failed', lockData);
  logPass(`Period lock executed: ${lockData.message}`);

  // 12. Query Attendance Stats & Roster Grid
  console.log('\nSTEP 12: Querying Live Attendance KPIs and Roster Grid...');
  const statsRes = await fetch(`${BASE_URL}/api/attendance/stats`, { headers: defaultHeaders });
  const statsData = await statsRes.json();
  if (!statsData.success) logFail('Failed to fetch attendance stats', statsData);
  logPass(`Attendance KPIs: Active Staff = ${statsData.data.today.totalActiveEmployees}, Present = ${statsData.data.today.present}, Period Rate = ${statsData.data.period.attendanceRate}%`);

  const rosterRes = await fetch(`${BASE_URL}/api/attendance/roster`, { headers: defaultHeaders });
  const rosterData = await rosterRes.json();
  if (!rosterData.success) logFail('Failed to fetch roster', rosterData);
  logPass(`Visual Roster Grid: Generated for ${rosterData.data.roster.length} personnel across ${rosterData.data.days.length} days`);

  console.log('\n================================================================');
  console.log('  ✅ ALL PHASE 4 E2E HTTP INTEGRATION TESTS PASSED (PORT 3005)!');
  console.log('================================================================\n');
}

runE2eTests().catch((err) => {
  console.error('Fatal E2E test execution error:', err);
  process.exit(1);
});
