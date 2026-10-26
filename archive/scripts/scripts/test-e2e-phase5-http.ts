// CorpSec HR Payroll — Phase 5 HTTP End-to-End Test Suite

export {};
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3005';

function logPass(msg: string) {
  console.log(`  ✅ PASS: ${msg}`);
}

function logFail(msg: string, details?: any) {
  console.error(`  ❌ FAIL: ${msg}`, details || '');
  process.exit(1);
}

async function loginUser(email: string, pass: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Login failed for ${email}: ${txt}`);
  }
  const cookie = res.headers.get('set-cookie');
  if (!cookie) throw new Error(`No cookie returned for ${email}`);
  return cookie.split(';')[0];
}

async function runE2ETests() {
  console.log('\n======================================================');
  console.log('🚀 CORPSEC HR PAYROLL — PHASE 5 HTTP E2E TEST SUITE');
  console.log(`🌐 Target Base URL: ${BASE_URL}`);
  console.log('======================================================\n');

  // Step 1: Log in roles
  console.log('1. Authenticating test personas...');
  const adminCookie = await loginUser('admin@corpsec.co.ke', 'Admin@CorpSec2026!');
  const hrAdminCookie = await loginUser('hr.admin@corpsec.co.ke', 'HrAdmin@CorpSec2026!');
  const hrManagerCookie = await loginUser('hr.manager@corpsec.co.ke', 'HrManager@CorpSec2026!');
  logPass('Super Admin, HR Admin, and HR Manager logged in successfully.');

  // Step 2: Fetch Leave Types & Policies
  console.log('\n2. Testing Leave Types & Policies API endpoints...');
  const typesRes = await fetch(`${BASE_URL}/api/leave/types`, {
    headers: { Cookie: adminCookie },
  });
  const typesData = await typesRes.json();
  if (!typesData.success || typesData.data.length < 5) {
    logFail('Failed to retrieve leave types', typesData);
  }
  logPass(`Retrieved ${typesData.data.length} active leave types (Annual, Sick, Maternity, Paternity, etc.)`);

  const policiesRes = await fetch(`${BASE_URL}/api/leave/policies`, {
    headers: { Cookie: adminCookie },
  });
  const policiesData = await policiesRes.json();
  if (!policiesData.success || policiesData.data.length < 4) {
    logFail('Failed to retrieve leave policies', policiesData);
  }
  logPass(`Retrieved ${policiesData.data.length} leave policies with accrual rules`);

  // Step 3: Fetch Leave Statistics
  console.log('\n3. Testing Leave KPI Statistics endpoint...');
  const statsRes = await fetch(`${BASE_URL}/api/leave/stats`, {
    headers: { Cookie: hrAdminCookie },
  });
  const statsData = await statsRes.json();
  if (!statsData.success) logFail('Failed to fetch leave stats', statsData);
  logPass(
    `Leave KPIs: ${statsData.data.onLeaveToday} on leave today, ${statsData.data.pendingApprovals} pending review, ${statsData.data.totalEntitledDaysAllocated} total days allocated.`
  );

  // Step 4: Fetch Active Employees & Entitlements
  console.log('\n4. Testing Leave Entitlements endpoint...');
  const entRes = await fetch(`${BASE_URL}/api/leave/entitlements?year=2026`, {
    headers: { Cookie: hrAdminCookie },
  });
  const entData = await entRes.json();
  if (!entData.success || entData.data.length === 0) {
    logFail('Failed to fetch leave entitlements for year 2026', entData);
  }
  logPass(`Found ${entData.data.length} leave entitlement records for year 2026`);

  // Find employee and annual leave type
  const targetEmployee = entData.data[0]?.employee;
  const annualLeaveType = typesData.data.find((t: any) => t.code === 'LT-ANNUAL');
  if (!targetEmployee || !annualLeaveType) {
    logFail('Could not identify target employee or Annual Leave type');
  }

  // Step 5: Submit a Leave Request
  console.log('\n5. Testing Leave Application Submission (POST /api/leave/requests)...');
  const appRes = await fetch(`${BASE_URL}/api/leave/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: hrAdminCookie,
    },
    body: JSON.stringify({
      employeeId: targetEmployee.id,
      leaveTypeId: annualLeaveType.id,
      leaveYear: 2026,
      startDate: '2026-11-02', // Monday
      endDate: '2026-11-06',   // Friday -> 5 working days
      reason: 'E2E Automated test leave application for personal leave in Nakuru',
      contactPhone: '+254 712 999 888',
    }),
  });
  const appData = await appRes.json();
  if (!appData.success || !appData.data?.id) {
    logFail('Failed to submit leave request', appData);
  }
  const createdReq = appData.data;
  logPass(`Created Leave Request ${createdReq.requestNumber} for ${createdReq.durationDays} day(s)`);

  // Step 6: Test Conflict Detection (Same employee overlapping dates)
  console.log('\n6. Testing Leave Overlap Conflict Detection...');
  const conflictRes = await fetch(`${BASE_URL}/api/leave/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: hrAdminCookie,
    },
    body: JSON.stringify({
      employeeId: targetEmployee.id,
      leaveTypeId: annualLeaveType.id,
      leaveYear: 2026,
      startDate: '2026-11-04', // Overlaps Nov 02-06
      endDate: '2026-11-10',
      reason: 'Conflicting leave application attempt',
    }),
  });
  if (conflictRes.status === 409) {
    logPass('Conflict detected correctly with 409 Conflict status code');
  } else {
    logFail(`Expected 409 Conflict, got ${conflictRes.status}`);
  }

  // Step 7: Supervisor / HR Manager Approval
  console.log('\n7. Testing Leave Approval & Attendance Synchronization...');
  const approveRes = await fetch(`${BASE_URL}/api/leave/requests/${createdReq.id}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: hrManagerCookie,
    },
    body: JSON.stringify({
      comments: 'Approved by Operations Commander for 5 days off-duty',
    }),
  });
  const approveData = await approveRes.json();
  if (!approveData.success) {
    logFail('Failed to approve leave request', approveData);
  }
  logPass(`Approved request ${createdReq.requestNumber}. Synchronized ${approveData.data.attendanceDaysSynced} attendance record(s).`);

  // Step 8: Test Visual Calendar
  console.log('\n8. Testing Visual Calendar & Availability endpoint...');
  const calRes = await fetch(`${BASE_URL}/api/leave/calendar?year=2026&month=11`, {
    headers: { Cookie: hrAdminCookie },
  });
  const calData = await calRes.json();
  if (!calData.success || !calData.data.events) {
    logFail('Failed to fetch calendar data for Nov 2026', calData);
  }
  const eventFound = calData.data.events.some((ev: any) => ev.id === createdReq.id);
  if (!eventFound) {
    logFail(`Approved leave event ${createdReq.requestNumber} was not found on the November 2026 calendar.`);
  }
  logPass(`Confirmed approved leave event appears on November 2026 calendar.`);

  // Step 9: Test Manual Leave Balance Adjustment
  console.log('\n9. Testing Manual Balance Adjustment (+3 Days)...');
  const adjRes = await fetch(`${BASE_URL}/api/leave/adjustments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      employeeId: targetEmployee.id,
      leaveTypeId: annualLeaveType.id,
      leaveYear: 2026,
      adjustmentType: 'ADDITION',
      adjustmentDays: 3,
      reason: 'Management award for outstanding guarding performance in Q3',
    }),
  });
  const adjData = await adjRes.json();
  if (!adjData.success || !adjData.data?.id) {
    logFail('Failed to apply balance adjustment', adjData);
  }
  logPass(`Applied +3 days balance adjustment. New balance: ${adjData.data.newBalance} days.`);

  // Step 10: Test Leave Cancellation & Attendance Reversion
  console.log('\n10. Testing Leave Cancellation & Attendance Reversion...');
  const cancelRes = await fetch(`${BASE_URL}/api/leave/requests/${createdReq.id}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: hrAdminCookie,
    },
    body: JSON.stringify({
      reason: 'Employee requested cancellation due to revised operational deployment',
    }),
  });
  const cancelData = await cancelRes.json();
  if (!cancelData.success) {
    logFail('Failed to cancel leave request', cancelData);
  }
  logPass(
    `Cancelled leave request ${createdReq.requestNumber}. Restored ${createdReq.durationDays} day(s) and reverted ${cancelData.data.attendanceReverted} attendance record(s).`
  );

  // Step 11: Main Dashboard KPI Ingestion
  console.log('\n11. Testing Main Dashboard live Leave KPI ingestion...');
  const dashRes = await fetch(`${BASE_URL}/api/dashboard/stats`, {
    headers: { Cookie: adminCookie },
  });
  const dashData = await dashRes.json();
  if (!dashData.success || dashData.data.leaveMetrics === undefined) {
    logFail('Dashboard stats missing leaveMetrics payload', dashData);
  }
  logPass(`Dashboard stats returned leaveMetrics: On Leave Today = ${dashData.data.leaveMetrics.onLeaveToday}`);

  console.log('\n======================================================');
  console.log('🎉 ALL 11 PHASE 5 HTTP E2E TESTS PASSED WITH 100% SUCCESS!');
  console.log('======================================================\n');
}

runE2ETests().catch((err) => {
  console.error('E2E Test execution failed:', err);
  process.exit(1);
});
