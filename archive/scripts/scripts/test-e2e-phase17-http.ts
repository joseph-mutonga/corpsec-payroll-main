import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3005';

async function main() {
  console.log('================================================================');
  console.log('  CORPSEC PHASE 17: HTTP E2E API VERIFICATION SUITE (PORT 3005) ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${description}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${description}`);
      failed++;
    }
  }

  // 1. Authenticate Admin
  console.log('1. Authenticating Super Admin...');
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@corpsec.co.ke',
      password: 'Admin@CorpSec2026!',
    }),
  });
  const adminCookie = adminLoginRes.headers.get('set-cookie') || '';
  const adminLoginJson = await adminLoginRes.json();
  assert(adminLoginJson.success === true, 'Super Admin authenticated successfully');

  // 2. Authenticate Employee
  console.log('2. Authenticating Guard Jackson...');
  const empLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'jackson.kamau@corpsec.co.ke',
      password: 'Employee@CorpSec2026!',
    }),
  });
  const empCookie = empLoginRes.headers.get('set-cookie') || '';
  const empLoginJson = await empLoginRes.json();
  assert(empLoginJson.success === true, 'Guard Jackson authenticated successfully');

  const adminHeaders = {
    'Content-Type': 'application/json',
    Cookie: adminCookie,
  };

  const empHeaders = {
    'Content-Type': 'application/json',
    Cookie: empCookie,
  };

  const jackson = await prisma.employee.findFirst({
    where: { employeeNumber: 'CORP-000001' },
  });
  if (!jackson) throw new Error('Guard Jackson not found.');

  // Clean up any test attendance records for today to ensure fresh clock flow
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  await prisma.attendanceAdjustment.deleteMany({ where: { employeeId: jackson.id } });
  await prisma.attendanceEvent.deleteMany({ where: { employeeId: jackson.id } });
  await prisma.overtimeRecord.deleteMany({ where: { employeeId: jackson.id } });
  await prisma.attendanceRecord.deleteMany({ where: { employeeId: jackson.id } });

  // 3. Attendance Dashboard
  console.log('\n3. Testing GET /api/attendance/dashboard...');
  const dashRes = await fetch(`${BASE_URL}/api/attendance/dashboard`, { headers: adminHeaders });
  const dashJson = await dashRes.json();
  assert(dashJson.success === true && !!dashJson.data.kpis, 'Dashboard returned live KPIs and department summaries');

  // 4. Employee Attendance List
  console.log('\n4. Testing GET /api/attendance/employees...');
  const empAttRes = await fetch(`${BASE_URL}/api/attendance/employees`, { headers: adminHeaders });
  const empAttJson = await empAttRes.json();
  assert(empAttJson.success === true && Array.isArray(empAttJson.data), 'Listed employee attendance directory');

  // 5. Shift Management
  console.log('\n5. Testing Shifts API...');
  const shiftCode = `E2E-SHIFT-${Date.now()}`;
  const createShiftRes = await fetch(`${BASE_URL}/api/attendance/shifts`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      code: shiftCode,
      name: 'E2E Day Patrol Shift',
      startTime: '06:00',
      endTime: '18:00',
      shiftType: 'DAY',
      gracePeriodMinutes: 15,
      breakDurationMinutes: 60,
    }),
  });
  const createShiftJson = await createShiftRes.json();
  assert(createShiftJson.success === true, 'Created new guarding shift via API');

  const listShiftsRes = await fetch(`${BASE_URL}/api/attendance/shifts`, { headers: adminHeaders });
  const listShiftsJson = await listShiftsRes.json();
  assert(listShiftsJson.success === true && listShiftsJson.data.length > 0, 'Listed shifts via API');

  // 6. Schedule Management
  console.log('\n6. Testing Schedules API...');
  const schedCode = `E2E-SCHED-${Date.now()}`;
  const createSchedRes = await fetch(`${BASE_URL}/api/attendance/schedules`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      code: schedCode,
      name: 'E2E Standard Weekly Schedule',
      patternType: 'STANDARD_WEEKLY',
      cycleDays: 7,
    }),
  });
  const createSchedJson = await createSchedRes.json();
  assert(createSchedJson.success === true, 'Created work schedule via API');

  // 7. Attendance Clocking Actions (In, Break, Out)
  console.log('\n7. Testing Clocking Actions /api/attendance/clock...');
  const clockInRes = await fetch(`${BASE_URL}/api/attendance/clock`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      action: 'CLOCK_IN',
      employeeId: jackson.id,
      notes: 'Reporting for E2E post test',
    }),
  });
  const clockInJson = await clockInRes.json();
  assert(clockInJson.success === true && !!clockInJson.data.actualClockIn, 'Clock-in API recorded successfully');

  const breakStartRes = await fetch(`${BASE_URL}/api/attendance/clock`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      action: 'BREAK_START',
      employeeId: jackson.id,
    }),
  });
  const breakStartJson = await breakStartRes.json();
  assert(breakStartJson.success === true && breakStartJson.data.isBreakActive === true, 'Break start API recorded successfully');

  const breakEndRes = await fetch(`${BASE_URL}/api/attendance/clock`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      action: 'BREAK_END',
      employeeId: jackson.id,
    }),
  });
  const breakEndJson = await breakEndRes.json();
  assert(breakEndJson.success === true && breakEndJson.data.isBreakActive === false, 'Break end API recorded successfully');

  const clockOutRes = await fetch(`${BASE_URL}/api/attendance/clock`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      action: 'CLOCK_OUT',
      employeeId: jackson.id,
      notes: 'Shift concluded successfully',
    }),
  });
  const clockOutJson = await clockOutRes.json();
  assert(clockOutJson.success === true && !!clockOutJson.data.actualClockOut, 'Clock-out API recorded successfully');

  // 8. Roster API
  console.log('\n8. Testing GET /api/attendance/roster...');
  const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
  const rosterRes = await fetch(`${BASE_URL}/api/attendance/roster?startDate=${todayStr}&endDate=${todayStr}&employeeId=${jackson.id}`, {
    headers: adminHeaders,
  });
  const rosterJson = await rosterRes.json();
  assert(rosterJson.success === true && rosterJson.data.length > 0, 'Roster API returned team schedule for target date');

  // 9. Attendance Corrections API
  console.log('\n9. Testing Attendance Corrections API...');
  const recordId = clockOutJson.data.id;
  const submitCorrRes = await fetch(`${BASE_URL}/api/attendance/corrections`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      attendanceRecordId: recordId,
      employeeId: jackson.id,
      fieldChanged: 'STATUS',
      requestedValue: 'PRESENT',
      reason: 'E2E Correction request verification',
    }),
  });
  const submitCorrJson = await submitCorrRes.json();
  assert(submitCorrJson.success === true && submitCorrJson.data.status === 'PENDING_REVIEW', 'Correction request submitted');

  const reviewCorrRes = await fetch(`${BASE_URL}/api/attendance/corrections/${submitCorrJson.data.id}/review`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      decision: 'APPROVE',
      comments: 'Approved by manager',
    }),
  });
  const reviewCorrJson = await reviewCorrRes.json();
  assert(reviewCorrJson.success === true && reviewCorrJson.data.status === 'APPLIED', 'Correction reviewed and applied');

  // 10. Timesheets API
  console.log('\n10. Testing Timesheets API...');
  const genTsRes = await fetch(`${BASE_URL}/api/attendance/timesheets`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      employeeId: jackson.id,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    }),
  });
  const genTsJson = await genTsRes.json();
  assert(genTsJson.success === true && genTsJson.data.timesheetNumber.startsWith('TS-2026-'), 'Generated timesheet via API');

  const reviewTsRes = await fetch(`${BASE_URL}/api/attendance/timesheets/${genTsJson.data.id}`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      action: 'REVIEW',
      decision: 'APPROVE',
    }),
  });
  const reviewTsJson = await reviewTsRes.json();
  assert(reviewTsJson.success === true && reviewTsJson.data.status === 'APPROVED', 'Approved timesheet via API');

  // 11. Overtime API
  console.log('\n11. Testing Overtime API...');
  const requestOtRes = await fetch(`${BASE_URL}/api/attendance/overtime`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      employeeId: jackson.id,
      attendanceRecordId: recordId,
      date: todayStr,
      overtimeHours: 2.0,
      overtimeType: 'NORMAL',
      reason: 'Emergency escort guarding support',
    }),
  });
  const requestOtJson = await requestOtRes.json();
  assert(requestOtJson.success === true, 'Overtime request submitted via API');

  const reviewOtRes = await fetch(`${BASE_URL}/api/attendance/overtime/${requestOtJson.data.id}/review`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      decision: 'APPROVE',
      level: 'MANAGER',
    }),
  });
  const reviewOtJson = await reviewOtRes.json();
  assert(reviewOtJson.success === true && reviewOtJson.data.approvalStatus === 'APPROVED', 'Overtime approved via API');

  // 12. Station Coverage API
  console.log('\n12. Testing Station Coverage API...');
  const coverageRes = await fetch(`${BASE_URL}/api/attendance/coverage?date=${todayStr}`, { headers: adminHeaders });
  const coverageJson = await coverageRes.json();
  assert(coverageJson.success === true && Array.isArray(coverageJson.data), 'Retrieved guarding coverage matrix');

  // 13. Devices API
  console.log('\n13. Testing Devices API...');
  const devCode = `E2E-DEV-${Date.now()}`;
  const createDevRes = await fetch(`${BASE_URL}/api/attendance/devices`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      deviceCode: devCode,
      name: 'West Wing Access Reader',
      deviceType: 'RFID',
    }),
  });
  const createDevJson = await createDevRes.json();
  assert(createDevJson.success === true, 'Registered new device via API');

  // 14. Policies API
  console.log('\n14. Testing Policies API...');
  const getPolRes = await fetch(`${BASE_URL}/api/attendance/policies`, { headers: adminHeaders });
  const getPolJson = await getPolRes.json();
  assert(getPolJson.success === true && !!getPolJson.data.id, 'Retrieved attendance policy via API');

  // 15. CSV Import API (Preview & Execute)
  console.log('\n15. Testing CSV Import Preview & Execution...');
  const testCsv = `Employee Number,Date,Clock In,Clock Out,Source\n${jackson.employeeNumber},2026-08-25,06:00,18:00,CSV_TEST`;
  const previewRes = await fetch(`${BASE_URL}/api/attendance/import/preview`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ csvText: testCsv }),
  });
  const previewJson = await previewRes.json();
  assert(previewJson.success === true && previewJson.data.validCount === 1, 'CSV import preview validated row');

  const execImportRes = await fetch(`${BASE_URL}/api/attendance/import/execute`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ csvText: testCsv }),
  });
  const execImportJson = await execImportRes.json();
  assert(execImportJson.success === true && execImportJson.data.importedCount === 1, 'Executed CSV batch punch import');

  // 16. Payroll Export API
  console.log('\n16. Testing Payroll Export Dataset API...');
  const payrollRes = await fetch(`${BASE_URL}/api/attendance/payroll-export?startDate=2026-08-01&endDate=2026-08-31`, {
    headers: adminHeaders,
  });
  const payrollJson = await payrollRes.json();
  assert(payrollJson.success === true && Array.isArray(payrollJson.data), 'Exported non-mutating payroll attendance interface');

  // 17. Reports & Streaming API
  console.log('\n17. Testing Reports API...');
  const repJsonRes = await fetch(`${BASE_URL}/api/attendance/reports?type=ATTENDANCE_REGISTER&format=json&startDate=2026-08-01&endDate=2026-08-31`, {
    headers: adminHeaders,
  });
  const repJson = await repJsonRes.json();
  assert(repJson.success === true && Array.isArray(repJson.data), 'Retrieved JSON attendance register report');

  const repCsvRes = await fetch(`${BASE_URL}/api/attendance/reports?type=ATTENDANCE_REGISTER&format=csv&startDate=2026-08-01&endDate=2026-08-31`, {
    headers: adminHeaders,
  });
  const repCsvText = await repCsvRes.text();
  assert(repCsvText.includes('Employee Number') && repCsvText.includes(jackson.employeeNumber), 'Retrieved CSV attendance register stream');

  // 18. Employee Portal Attendance API
  console.log('\n18. Testing Employee Portal /api/portal/attendance...');
  const portalRes = await fetch(`${BASE_URL}/api/portal/attendance`, { headers: empHeaders });
  const portalJson = await portalRes.json();
  assert(portalJson.success === true && !!portalJson.data.todayStatus, 'Employee self-service portal returned attendance profile');

  console.log('\n================================================================');
  console.log(`  E2E TEST COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal E2E error:', err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
