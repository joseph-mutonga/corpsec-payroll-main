// CorpSec HR Payroll — Phase 11 HTTP E2E & Security Test Suite
// Verifies all Phase 11 REST endpoints, RBAC barriers, and administrative workflows over HTTP.

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

  const cookies = res.headers.get('set-cookie');
  if (!cookies) throw new Error(`No cookies returned for ${email}`);

  const match = cookies.match(/corpsec_session=([^;]+)/);
  if (!match) throw new Error(`corpsec_session not found in cookies: ${cookies}`);

  return match[1];
}

async function runE2ETests() {
  console.log('\n=============================================================');
  console.log('  CORPSEC HR PAYROLL — PHASE 11 HTTP E2E & SECURITY SUITE');
  console.log(`  Target URL: ${BASE_URL}`);
  console.log('=============================================================\n');

  try {
    // 1. Authenticate Test Personas
    console.log('--- 1. Authenticating Personas ---');
    const hrAdminToken = await login('hr.admin@corpsec.co.ke', 'HrAdmin@CorpSec2026!');
    assert(!!hrAdminToken, 'HR Admin logged in successfully');

    const jacksonToken = await login('jackson.kamau@corpsec.co.ke', 'Employee@CorpSec2026!');
    assert(!!jacksonToken, 'Employee Jackson logged in successfully');

    const authFetch = (path: string, token: string, options: RequestInit = {}) => {
      return fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
          ...options.headers,
          Cookie: `corpsec_session=${token}`,
        },
      });
    };

    // 2. HR Command Center Dashboard
    console.log('\n--- 2. HR Command Center (GET /api/hr/dashboard) ---');
    const dashRes = await authFetch('/api/hr/dashboard', hrAdminToken);
    assert(dashRes.status === 200, 'GET /api/hr/dashboard returns 200 OK');
    const dashData = await dashRes.json();
    assert(dashData.success === true, 'Dashboard response indicates success');
    assert(typeof dashData.data.kpis.totalEmployees === 'number', 'Total employees KPI returned');
    assert(Array.isArray(dashData.data.departmentDistribution), 'Department distribution returned');

    // 3. HR Workforce Analytics
    console.log('\n--- 3. HR Workforce Analytics (GET /api/hr/analytics) ---');
    const analyticsRes = await authFetch('/api/hr/analytics', hrAdminToken);
    assert(analyticsRes.status === 200, 'GET /api/hr/analytics returns 200 OK');
    const analyticsData = await analyticsRes.json();
    assert(analyticsData.success === true, 'Analytics response indicates success');
    assert(typeof analyticsData.data.workforceTotals.turnoverRatePercentage === 'number', 'Turnover rate returned');

    // 4. Onboarding Endpoints
    console.log('\n--- 4. Onboarding Hub Endpoints ---');
    const onbListRes = await authFetch('/api/hr/onboarding', hrAdminToken);
    assert(onbListRes.status === 200, 'GET /api/hr/onboarding returns 200 OK');
    const onbListData = await onbListRes.json();
    assert(Array.isArray(onbListData.data.cases), 'Onboarding cases returned as array');

    // Fetch an employee to initiate onboarding
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const testEmp = await prisma.employee.findFirst({ where: { employeeNumber: 'CORP-000003' } });

    if (testEmp) {
      // Clean previous case if any
      await prisma.onboardingTask.deleteMany({ where: { onboardingCase: { employeeId: testEmp.id } } });
      await prisma.onboardingCase.deleteMany({ where: { employeeId: testEmp.id } });

      const onbCreateRes = await authFetch('/api/hr/onboarding', hrAdminToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: testEmp.id,
          notes: 'Standard VIP induction batch test',
        }),
      });
      assert(onbCreateRes.status === 200, 'POST /api/hr/onboarding returns 200 OK');
      const createdOnb = await onbCreateRes.json();
      assert(createdOnb.data.caseNumber.startsWith('ONB-'), 'Created case has ONB prefix');

      // Case detail
      const caseDetailRes = await authFetch(`/api/hr/onboarding/${createdOnb.data.id}`, hrAdminToken);
      assert(caseDetailRes.status === 200, 'GET /api/hr/onboarding/[id] returns 200 OK');
      const detailData = await caseDetailRes.json();
      assert(detailData.data.tasks.length === 9, 'Case detail contains 9 tasks');

      // Toggle task
      const firstTaskId = detailData.data.tasks[0].id;
      const toggleRes = await authFetch(`/api/hr/onboarding/${createdOnb.data.id}`, hrAdminToken, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: firstTaskId,
          isCompleted: true,
        }),
      });
      assert(toggleRes.status === 200, 'PATCH /api/hr/onboarding/[id] toggles task with 200 OK');
    }

    // 5. Offboarding Endpoints & Settlement
    console.log('\n--- 5. Offboarding & Final Settlement Endpoints ---');
    const offListRes = await authFetch('/api/hr/offboarding', hrAdminToken);
    assert(offListRes.status === 200, 'GET /api/hr/offboarding returns 200 OK');

    const testEmp4 = await prisma.employee.findFirst({ where: { employeeNumber: 'CORP-000004' } });
    if (testEmp4) {
      await prisma.offboardingTask.deleteMany({ where: { offboardingCase: { employeeId: testEmp4.id } } });
      await prisma.offboardingCase.deleteMany({ where: { employeeId: testEmp4.id } });

      const offCreateRes = await authFetch('/api/hr/offboarding', hrAdminToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: testEmp4.id,
          exitType: 'RESIGNATION',
          exitDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          reason: 'Relocating abroad',
        }),
      });
      assert(offCreateRes.status === 200, 'POST /api/hr/offboarding returns 200 OK');
      const createdOff = await offCreateRes.json();
      assert(createdOff.data.caseNumber.startsWith('OFF-'), 'Created case has OFF prefix');

      // Settlement forecast
      const stlRes = await authFetch(`/api/hr/offboarding/${createdOff.data.id}/settlement`, hrAdminToken);
      assert(stlRes.status === 200, 'GET /api/hr/offboarding/[id]/settlement returns 200 OK');
      const stlData = await stlRes.json();
      assert(typeof stlData.data.netPayableSettlement === 'number', 'Settlement forecast returned numeric net payout');
    }

    // 6. Contracts Management Endpoints
    console.log('\n--- 6. Contracts Management Endpoints ---');
    const contractsRes = await authFetch('/api/hr/contracts?days=180', hrAdminToken);
    assert(contractsRes.status === 200, 'GET /api/hr/contracts returns 200 OK');
    const contractsData = await contractsRes.json();
    assert(Array.isArray(contractsData.data), 'Contracts returned as array');

    if (contractsData.data.length > 0) {
      const targetContract = contractsData.data[0];
      const renewRes = await authFetch('/api/hr/contracts', hrAdminToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: targetContract.id,
          newStartDate: new Date().toISOString().split('T')[0],
          newEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          reason: 'Contract extension via HTTP E2E test',
        }),
      });
      assert(renewRes.status === 200, 'POST /api/hr/contracts returns 200 OK');
    }

    // 7. Probation Pipeline Endpoints
    console.log('\n--- 7. Probation Pipeline Endpoints ---');
    const probRes = await authFetch('/api/hr/probation', hrAdminToken);
    assert(probRes.status === 200, 'GET /api/hr/probation returns 200 OK');
    const probData = await probRes.json();
    assert(Array.isArray(probData.data), 'Probations returned as array');

    if (testEmp) {
      const probOutcomeRes = await authFetch('/api/hr/probation', hrAdminToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: testEmp.id,
          outcome: 'CONFIRM',
          reason: 'Passed probation during HTTP test',
        }),
      });
      assert(probOutcomeRes.status === 200, 'POST /api/hr/probation records outcome with 200 OK');
    }

    // 8. Employment Types Config Endpoint
    console.log('\n--- 8. Employment Types Endpoint ---');
    const typesRes = await authFetch('/api/hr/employment-types', hrAdminToken);
    assert(typesRes.status === 200, 'GET /api/hr/employment-types returns 200 OK');
    const typesData = await typesRes.json();
    assert(typesData.data.length >= 6, 'Employment types list contains all default configurations');

    // 9. Bulk HR Operations Endpoint
    console.log('\n--- 9. Bulk HR Operations Endpoint ---');
    if (testEmp) {
      const bulkRes = await authFetch('/api/hr/bulk', hrAdminToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeIds: [testEmp.id],
          action: 'CHANGE_STATUS',
          targetStatus: 'ACTIVE',
          reason: 'Bulk activation via HTTP E2E test',
        }),
      });
      assert(bulkRes.status === 200, 'POST /api/hr/bulk executes with 200 OK');
    }

    // 10. CSV Import Preview Endpoint
    console.log('\n--- 10. CSV Import Preview Endpoint ---');
    const previewRes = await authFetch('/api/employees/import/preview', hrAdminToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csvContent: `EmployeeNumber,FirstName,LastName,NationalId,Phone,JobTitle,EmploymentType\nCORP-888001,Jane,Wanjiku,55667788,+254711888999,CCTV Controller,PERMANENT`,
      }),
    });
    assert(previewRes.status === 200, 'POST /api/employees/import/preview returns 200 OK');
    const previewData = await previewRes.json();
    assert(previewData.data.validCount === 1, 'CSV preview parsed 1 valid row');

    // 11. Security & RBAC Guards
    console.log('\n--- 11. Security & RBAC Isolation Guards ---');
    const unauthorizedOnb = await authFetch('/api/hr/onboarding', jacksonToken);
    assert(
      unauthorizedOnb.status === 403,
      `RBAC GUARD: Standard Employee blocked from /api/hr/onboarding with 403 (Got: ${unauthorizedOnb.status})`
    );

    const unauthorizedOff = await authFetch('/api/hr/offboarding', jacksonToken);
    assert(
      unauthorizedOff.status === 403,
      `RBAC GUARD: Standard Employee blocked from /api/hr/offboarding with 403 (Got: ${unauthorizedOff.status})`
    );

    const unauthorizedContracts = await authFetch('/api/hr/contracts', jacksonToken);
    assert(
      unauthorizedContracts.status === 403,
      `RBAC GUARD: Standard Employee blocked from /api/hr/contracts with 403 (Got: ${unauthorizedContracts.status})`
    );

    const unauthorizedProb = await authFetch('/api/hr/probation', jacksonToken);
    assert(
      unauthorizedProb.status === 403,
      `RBAC GUARD: Standard Employee blocked from /api/hr/probation with 403 (Got: ${unauthorizedProb.status})`
    );

    await prisma.$disconnect();

    // Summary
    console.log('\n=============================================================');
    console.log(`  PHASE 11 HTTP E2E TESTS COMPLETE: ${passedTests} Passed, ${failedTests} Failed`);
    console.log('=============================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error during HTTP E2E testing:', error);
    process.exit(1);
  }
}

runE2ETests();

export {};
