// CorpSec HR Payroll — Phase 10 HTTP E2E & IDOR Security Test Suite
// Verifies all 15 REST endpoints, authentication resolution, IDOR blocks, and administrative workflows.

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3005';

let passedTests = 0;
let failedTests = 0;

function assert(condition: any, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${details ? ` - ${details}` : ''}`);
    failedTests++;
  }
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed for ${email}: ${res.status} ${text}`);
  }

  // Extract session token from Set-Cookie header
  const cookies = res.headers.get('set-cookie');
  if (!cookies) {
    throw new Error(`No cookies returned from login for ${email}`);
  }

  // Extract corpsec_session cookie value
  const match = cookies.match(/corpsec_session=([^;]+)/);
  if (!match) {
    throw new Error(`corpsec_session cookie not found in Set-Cookie: ${cookies}`);
  }

  return match[1];
}

async function runE2ETests() {
  console.log('\n=============================================================');
  console.log('  CORPSEC HR PAYROLL — PHASE 10 HTTP E2E & IDOR SECURITY TEST');
  console.log(`  Target URL: ${BASE_URL}`);
  console.log('=============================================================\n');

  try {
    // 1. Authentication for test personas
    console.log('--- 1. Authenticating Test Personas ---');
    const jacksonToken = await login('jackson.kamau@corpsec.co.ke', 'Employee@CorpSec2026!');
    assert(!!jacksonToken, 'Employee Jackson (CORP-000001) logged in successfully');

    const emmanuelToken = await login('emmanuel.wanyonyi@corpsec.co.ke', 'Employee@CorpSec2026!');
    assert(!!emmanuelToken, 'Employee Emmanuel (CORP-000002) logged in successfully');

    const hrAdminToken = await login('hr.admin@corpsec.co.ke', 'HrAdmin@CorpSec2026!');
    assert(!!hrAdminToken, 'HR Admin (hr.admin@corpsec.co.ke) logged in successfully');

    // Helper for authenticated fetch
    const authFetch = (path: string, token: string, options: RequestInit = {}) => {
      return fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
          ...options.headers,
          Cookie: `corpsec_session=${token}`,
        },
      });
    };

    // 2. Employee Dashboard
    console.log('\n--- 2. Employee Portal Dashboard (GET /api/portal/dashboard) ---');
    const dashRes = await authFetch('/api/portal/dashboard', jacksonToken);
    assert(dashRes.status === 200, 'GET /api/portal/dashboard returns 200 OK');
    const dashData = await dashRes.json();
    assert(dashData.success === true, 'Dashboard API returns success: true');
    assert(dashData.data.employee.fullName.includes('Jackson') && dashData.data.employee.fullName.includes('Kamau'), `Dashboard resolves to Jackson Kamau (Got: ${dashData.data.employee.fullName})`);
    assert(typeof dashData.data.currentNetPay === 'number', 'Current net pay is numeric');
    assert(dashData.data.leaveSummary !== undefined, 'Leave summary present in dashboard payload');

    // 3. Employee Profile
    console.log('\n--- 3. Employee Profile & Masking (GET /api/portal/profile) ---');
    const profRes = await authFetch('/api/portal/profile', jacksonToken);
    assert(profRes.status === 200, 'GET /api/portal/profile returns 200 OK');
    const profData = await profRes.json();
    assert(profData.success === true, 'Profile API returns success: true');
    assert(profData.data.employeeNumber === 'CORP-000001', 'Profile matches Jackson employee number');
    assert(profData.data.nationalIdMasked?.includes('****'), 'National ID is properly masked');

    // 4. Submit Profile Change Request
    console.log('\n--- 4. Profile Change Request (POST /api/portal/profile/change-request) ---');
    const changeReqRes = await authFetch('/api/portal/profile/change-request', jacksonToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changeCategory: 'CONTACT',
        subject: 'Update Alternative Mobile Line',
        description: 'New Airtel line for off-duty communications.',
        proposedData: {
          alternativePhone: '+254733445566',
        },
      }),
    });
    assert(changeReqRes.status === 200, 'POST /api/portal/profile/change-request returns 200 OK');
    const changeReqData = await changeReqRes.json();
    assert(changeReqData.success === true, 'Change request created successfully');
    const createdTicketId = changeReqData.data.id;
    assert(!!createdTicketId, `Ticket created with ID: ${createdTicketId}`);

    // 5. Employee Payslips Listing & Detail
    console.log('\n--- 5. Payslips Vault (GET /api/portal/payslips & GET /api/portal/payslips/[id]) ---');
    const payslipsRes = await authFetch('/api/portal/payslips', jacksonToken);
    assert(payslipsRes.status === 200, 'GET /api/portal/payslips returns 200 OK');
    const payslipsData = await payslipsRes.json();
    assert(Array.isArray(payslipsData.data), 'Payslips returned as array');

    // Fetch Emmanuel payslips
    const emmanuelPayslipsRes = await authFetch('/api/portal/payslips', emmanuelToken);
    const emmanuelPayslips = await emmanuelPayslipsRes.json();

    let emmanuelRecordId: string | null = null;
    if (emmanuelPayslips.data && emmanuelPayslips.data.length > 0) {
      emmanuelRecordId = emmanuelPayslips.data[0].id;
    }

    // 6. IDOR Security Guard on Payslips & Receipts
    console.log('\n--- 6. IDOR Security Guard: Cross-Employee Isolation ---');
    // Import Prisma directly in test to find an Emmanuel record
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const emmanuel = await prisma.employee.findFirst({
      where: { employeeNumber: 'CORP-000002' },
    });

    let emmanuelRecord = await prisma.payrollEmployeeRecord.findFirst({
      where: { employeeId: emmanuel?.id },
    });

    if (!emmanuelRecord && emmanuel) {
      // Find a run
      const run = await prisma.payrollRun.findFirst();
      if (run) {
        emmanuelRecord = await prisma.payrollEmployeeRecord.create({
          data: {
            payrollRunId: run.id,
            employeeId: emmanuel.id,
            employmentStatus: 'ACTIVE',
            jobTitle: emmanuel.jobTitle,
            basicSalary: 28000,
            proratedBasicPay: 28000,
            grossPay: 32000,
            taxableGross: 32000,
            netPay: 26500,
            calculationTrace: '{}',
          },
        });
      }
    }

    if (emmanuelRecord) {
      // Jackson attempts to access Emmanuel's payslip
      const idorRes = await authFetch(`/api/portal/payslips/${emmanuelRecord.id}`, jacksonToken);
      assert(
        idorRes.status === 403,
        `IDOR BLOCKED: Jackson access to Emmanuel payslip returned 403 Forbidden (Got: ${idorRes.status})`
      );
    }

    await prisma.$disconnect();

    // 7. Payment History & Receipt
    console.log('\n--- 7. Payment History & Receipts (GET /api/portal/payments) ---');
    const paymentsRes = await authFetch('/api/portal/payments', jacksonToken);
    assert(paymentsRes.status === 200, 'GET /api/portal/payments returns 200 OK');
    const paymentsData = await paymentsRes.json();
    assert(Array.isArray(paymentsData.data), 'Payments returned as array');

    // 8. Leave Self-Service Endpoints
    console.log('\n--- 8. Leave Self-Service (GET /api/portal/leave) ---');
    const leaveRes = await authFetch('/api/portal/leave', jacksonToken);
    assert(leaveRes.status === 200, 'GET /api/portal/leave returns 200 OK');
    const leaveData = await leaveRes.json();
    assert(Array.isArray(leaveData.data.entitlements), 'Leave entitlements returned as array');
    assert(Array.isArray(leaveData.data.requests), 'Leave requests returned as array');

    // 9. Attendance Summary
    console.log('\n--- 9. Attendance Timesheet (GET /api/portal/attendance) ---');
    const attRes = await authFetch('/api/portal/attendance', jacksonToken);
    assert(attRes.status === 200, 'GET /api/portal/attendance returns 200 OK');
    const attData = await attRes.json();
    assert(attData.data.summary !== undefined, 'Attendance summary present');

    // 10. HR Requests Service Desk & Confidentiality
    console.log('\n--- 10. HR Requests Service Desk & Confidentiality Scrub ---');
    const requestsRes = await authFetch('/api/portal/requests', jacksonToken);
    assert(requestsRes.status === 200, 'GET /api/portal/requests returns 200 OK');
    const requestsData = await requestsRes.json();
    assert(Array.isArray(requestsData.data), 'Requests returned as array');

    // Single request detail for Jackson
    const singleReqRes = await authFetch(`/api/portal/requests/${createdTicketId}`, jacksonToken);
    assert(singleReqRes.status === 200, 'GET /api/portal/requests/[id] returns 200 OK');
    const singleReqData = await singleReqRes.json();
    assert(
      singleReqData.data.internalHrNotes === null,
      'CONFIDENTIALITY SCRUB: internalHrNotes is null for employee viewing ticket'
    );

    // 11. HR Administrative Queue (HR Admin role)
    console.log('\n--- 11. HR Administrative Review Hub (GET & PATCH /api/hr/requests) ---');
    const hrQueueRes = await authFetch('/api/hr/requests', hrAdminToken);
    assert(hrQueueRes.status === 200, 'GET /api/hr/requests returns 200 OK for HR Admin');
    const hrQueueData = await hrQueueRes.json();
    assert(Array.isArray(hrQueueData.data.items), 'HR queue returns items array');
    assert(hrQueueData.data.stats !== undefined, 'HR queue stats returned');

    // Non-HR (Jackson) attempts to access HR Administrative queue
    const nonHrQueueRes = await authFetch('/api/hr/requests', jacksonToken);
    assert(
      nonHrQueueRes.status === 403,
      `RBAC GUARD: Standard Employee access to /api/hr/requests blocked with 403 Forbidden (Got: ${nonHrQueueRes.status})`
    );

    // HR Admin reviews and updates the ticket
    const updateTicketRes = await authFetch(`/api/hr/requests/${createdTicketId}`, hrAdminToken, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'RESOLVED',
        employeeVisibleResponse: 'Alternative phone number has been updated in your record.',
        internalHrNotes: 'CONFIDENTIAL: Identity verified by HR Operations Commander.',
      }),
    });
    assert(updateTicketRes.status === 200, 'PATCH /api/hr/requests/[id] returns 200 OK for HR Admin');

    // 12. Employee Document Vault & Letters
    console.log('\n--- 12. Document Vault & Letter Orders ---');
    const docsRes = await authFetch('/api/portal/documents', jacksonToken);
    assert(docsRes.status === 200, 'GET /api/portal/documents returns 200 OK');

    const letterOrderRes = await authFetch('/api/portal/letters/request', jacksonToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        letterType: 'PROOF_OF_EMPLOYMENT',
        purpose: 'Apartment Lease Verification',
        addressedTo: 'Property Management Office',
      }),
    });
    assert(letterOrderRes.status === 200, 'POST /api/portal/letters/request returns 200 OK');

    // 13. Notifications Center
    console.log('\n--- 13. Notifications Center ---');
    const notifsRes = await authFetch('/api/portal/notifications', jacksonToken);
    assert(notifsRes.status === 200, 'GET /api/portal/notifications returns 200 OK');
    const notifsData = await notifsRes.json();
    assert(Array.isArray(notifsData.data.notifications), 'Notifications returned as array');

    const markAllRes = await authFetch('/api/portal/notifications/read-all', jacksonToken, {
      method: 'POST',
    });
    assert(markAllRes.status === 200, 'POST /api/portal/notifications/read-all returns 200 OK');

    // Summary
    console.log('\n=============================================================');
    console.log(`  PHASE 10 HTTP E2E & IDOR TESTS COMPLETE: ${passedTests} Passed, ${failedTests} Failed`);
    console.log('=============================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error during HTTP E2E test execution:', error);
    process.exit(1);
  }
}

runE2ETests();

export {};
