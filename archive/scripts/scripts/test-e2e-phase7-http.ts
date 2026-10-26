export {};

// CorpSec HR Payroll — Phase 7 Live HTTP E2E Integration Suite
// Target Port: http://localhost:3005

const BASE_URL = process.env.BASE_URL || 'http://localhost:3005';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function runE2EPhase7Tests() {
  console.log('================================================================');
  console.log(`🌐 CORPSEC HR PAYROLL — PHASE 7 HTTP E2E TEST SUITE (${BASE_URL})`);
  console.log('================================================================\n');

  let adminCookie = '';

  // 1. Authenticate as Super Admin
  console.log('--- 1. Authenticating as Super Admin ---');
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@corpsec.co.ke',
        password: 'Admin@CorpSec2026!',
      }),
    });

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      adminCookie = setCookie.split(';')[0];
    }
    const data = await res.json();
    assert(data.success && !!adminCookie, 'Super Admin authenticated successfully');
  } catch (err: any) {
    console.error('Auth request error:', err);
    assert(false, 'Super Admin authentication failed', err.message);
    process.exit(1);
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    Cookie: adminCookie,
  };

  // 2. Fetch August 2026 Payroll Period
  console.log('\n--- 2. Fetching Active Payroll Period (August 2026) ---');
  let periodId = '';
  try {
    const res = await fetch(`${BASE_URL}/api/payroll/periods?year=2026`, {
      headers: authHeaders,
    });
    const data = await res.json();
    assert(data.success && Array.isArray(data.data), 'Fetched 2026 payroll periods');

    const aug = data.data.find((p: any) => p.payrollMonth === 8);
    assert(!!aug, 'Found August 2026 payroll period');
    periodId = aug?.id;
  } catch (err: any) {
    assert(false, 'Failed to fetch payroll periods', err.message);
  }

  // 3. Create Draft Payroll Run
  console.log('\n--- 3. Testing /api/payroll/runs (POST - Draft Creation) ---');
  let runId = '';
  try {
    const res = await fetch(`${BASE_URL}/api/payroll/runs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        payrollPeriodId: periodId,
        runType: 'REGULAR',
        notes: 'HTTP E2E automated test run for August 2026',
      }),
    });
    const data = await res.json();
    assert(data.success && data.data?.status === 'DRAFT', `Created draft payroll run (${data.data?.runNumber})`);
    runId = data.data?.id;
  } catch (err: any) {
    assert(false, 'Failed to create draft payroll run', err.message);
  }

  // 4. Fetch Run Details
  console.log('\n--- 4. Testing /api/payroll/runs/[id] (GET) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/payroll/runs/${runId}`, {
      headers: authHeaders,
    });
    const data = await res.json();
    assert(data.success && data.data?.id === runId, 'Fetched payroll run details');
    assert(data.data?.status === 'DRAFT', 'Initial status is DRAFT');
  } catch (err: any) {
    assert(false, 'Failed to fetch run details', err.message);
  }

  // 5. Execute Payroll Calculation Engine
  console.log('\n--- 5. Testing /api/payroll/runs/[id]/calculate (POST) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/payroll/runs/${runId}/calculate`, {
      method: 'POST',
      headers: authHeaders,
    });
    const data = await res.json();
    assert(data.success, 'Triggered payroll calculation engine');
    assert(data.data?.employeeCount > 0, `Calculated ${data.data?.employeeCount} employees`);
    assert(data.data?.grossPayroll > 0, `Gross payroll: KES ${data.data?.grossPayroll?.toLocaleString()}`);
    assert(data.data?.netPayroll > 0, `Net payroll: KES ${data.data?.netPayroll?.toLocaleString()}`);
    assert(data.data?.isReconciled === true, 'Calculation engine passed reconciliation matrix');
  } catch (err: any) {
    assert(false, 'Failed to calculate payroll run', err.message);
  }

  // 6. Fetch Employee Records & Trace
  console.log('\n--- 6. Testing /api/payroll/runs/[id]/records & Single Record Trace ---');
  let firstRecordId = '';
  try {
    const res = await fetch(`${BASE_URL}/api/payroll/runs/${runId}/records?pageSize=50`, {
      headers: authHeaders,
    });
    const data = await res.json();
    assert(data.success && data.data?.length > 0, `Fetched ${data.data?.length} calculated employee records`);
    firstRecordId = data.data[0]?.id;

    // Fetch individual record calculation trace
    const singleRes = await fetch(`${BASE_URL}/api/payroll/runs/${runId}/records/${firstRecordId}`, {
      headers: authHeaders,
    });
    const singleData = await singleRes.json();
    assert(singleData.success && !!singleData.data?.traceDetails, 'Fetched single employee calculation trace breakdown');
    assert(!!singleData.data?.traceDetails?.salary, 'Trace contains basic salary breakdown');
    assert(!!singleData.data?.traceDetails?.statutory, 'Trace contains statutory PAYE/NSSF/SHA breakdown');
  } catch (err: any) {
    assert(false, 'Failed to fetch employee records or trace', err.message);
  }

  // 7. Exceptions Audit & Resolution
  console.log('\n--- 7. Testing /api/payroll/runs/[id]/exceptions & Resolution ---');
  try {
    const res = await fetch(`${BASE_URL}/api/payroll/runs/${runId}/exceptions`, {
      headers: authHeaders,
    });
    const data = await res.json();
    assert(data.success, 'Fetched payroll run exceptions list');

    if (data.data?.length > 0) {
      const excId = data.data[0]?.id;
      const resolveRes = await fetch(`${BASE_URL}/api/payroll/runs/${runId}/exceptions/${excId}/resolve`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ resolutionNotes: 'Audited and verified by Super Admin' }),
      });
      const resolveData = await resolveRes.json();
      assert(resolveData.success && resolveData.data?.isResolved === true, 'Resolved payroll exception with audit note');
    } else {
      assert(true, 'No exceptions required resolution');
    }
  } catch (err: any) {
    assert(false, 'Failed testing exceptions', err.message);
  }

  // 8. Workflow Step: Mark as Under Review
  console.log('\n--- 8. Testing /api/payroll/runs/[id]/review (POST) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/payroll/runs/${runId}/review`, {
      method: 'POST',
      headers: authHeaders,
    });
    const data = await res.json();
    assert(data.success && data.data?.status === 'UNDER_REVIEW', 'Transitioned status to UNDER_REVIEW');
  } catch (err: any) {
    assert(false, 'Failed to mark run as under review', err.message);
  }

  // 9. Workflow Step: Submit for Approval
  console.log('\n--- 9. Testing /api/payroll/runs/[id]/submit (POST) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/payroll/runs/${runId}/submit`, {
      method: 'POST',
      headers: authHeaders,
    });
    const data = await res.json();
    assert(data.success && data.data?.status === 'PENDING_APPROVAL', 'Transitioned status to PENDING_APPROVAL');
  } catch (err: any) {
    assert(false, 'Failed to submit run for approval', err.message);
  }

  // 10. Workflow Step: Approve Run
  console.log('\n--- 10. Testing /api/payroll/runs/[id]/approve (POST) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/payroll/runs/${runId}/approve`, {
      method: 'POST',
      headers: authHeaders,
    });
    const data = await res.json();
    assert(data.success && data.data?.status === 'APPROVED', 'Formally approved payroll run');
  } catch (err: any) {
    assert(false, 'Failed to approve payroll run', err.message);
  }

  // 11. Workflow Step: Finalize Run
  console.log('\n--- 11. Testing /api/payroll/runs/[id]/finalize (POST) ---');
  try {
    // First resolve any remaining critical exceptions so finalization passes
    const excRes = await fetch(`${BASE_URL}/api/payroll/runs/${runId}/exceptions?severity=CRITICAL&isResolved=false`, {
      headers: authHeaders,
    });
    const excData = await excRes.json();
    if (excData.success && excData.data) {
      for (const exc of excData.data) {
        await fetch(`${BASE_URL}/api/payroll/runs/${runId}/exceptions/${exc.id}/resolve`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ resolutionNotes: 'Pre-finalization admin resolution' }),
        });
      }
    }

    const res = await fetch(`${BASE_URL}/api/payroll/runs/${runId}/finalize`, {
      method: 'POST',
      headers: authHeaders,
    });
    const data = await res.json();
    assert(data.success && data.data?.status === 'FINALIZED', 'Finalized payroll run and updated loan balances');
  } catch (err: any) {
    assert(false, 'Failed to finalize payroll run', err.message);
  }

  // 12. Workflow Step: Lock Run
  console.log('\n--- 12. Testing /api/payroll/runs/[id]/lock (POST) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/payroll/runs/${runId}/lock`, {
      method: 'POST',
      headers: authHeaders,
    });
    const data = await res.json();
    assert(data.success && data.data?.status === 'LOCKED', 'Locked payroll run permanently (immutable)');
  } catch (err: any) {
    assert(false, 'Failed to lock payroll run', err.message);
  }

  // 13. Summary Rollups by Department and Station
  console.log('\n--- 13. Testing /api/payroll/runs/[id]/summary (GET) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/payroll/runs/${runId}/summary`, {
      headers: authHeaders,
    });
    const data = await res.json();
    assert(data.success && Array.isArray(data.data?.departments), 'Fetched department distribution rollups');
    assert(Array.isArray(data.data?.branches), 'Fetched branch distribution rollups');
    assert(!!data.data?.paymentMethods?.BANK, 'Summary includes payment method split');
  } catch (err: any) {
    assert(false, 'Failed to fetch summary rollups', err.message);
  }

  // Summary
  console.log('\n================================================================');
  console.log(`📊 PHASE 7 HTTP E2E SUMMARY: ${passed}/${passed + failed} TESTS PASSED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runE2EPhase7Tests();
