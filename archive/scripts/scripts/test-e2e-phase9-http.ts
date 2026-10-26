// ============================================================================
// CORPSEC HR PAYROLL — PHASE 9 HTTP E2E INTEGRATION TEST SUITE
// Tests all REST API endpoints for Batches, Processing, History, Receipts & Reconciliation
// ============================================================================
export {};

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3005';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function loginAs(email: string, password = 'Admin@CorpSec2026!') {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${email} with status ${res.status}`);
  }
  const cookies = res.headers.get('set-cookie');
  return cookies || '';
}

async function runE2E() {
  console.log('\n🚀 ========================================================');
  console.log('   CORPSEC HR PAYROLL — PHASE 9 E2E HTTP TEST SUITE');
  console.log(`   Target: ${BASE_URL}`);
  console.log('========================================================\n');

  console.log('🔑 Authenticating as Super Admin (admin@corpsec.co.ke)...');
  const adminCookie = await loginAs('admin@corpsec.co.ke');
  assert(Boolean(adminCookie), 'Super Admin authenticated successfully');

  // --- STEP 1: Discover Active Period & Finalized Run ---
  console.log('\n--- STEP 1: Discover Active Period & Payroll Run ---');
  const periodRes = await fetch(`${BASE_URL}/api/payroll/periods?year=2026`, {
    headers: { Cookie: adminCookie },
  });
  const periodData = await periodRes.json();
  assert(periodRes.ok && periodData.success, 'GET /api/payroll/periods returned 200 OK');

  const period = periodData.data.find((p: any) => p.payrollMonth === 8) || periodData.data[0];
  console.log(`  ℹ️ Target period: ${period.name} (${period.id})`);

  const runRes = await fetch(`${BASE_URL}/api/payroll/runs?payrollPeriodId=${period.id}`, {
    headers: { Cookie: adminCookie },
  });
  const runData = await runRes.json();
  assert(runRes.ok && runData.success, 'GET /api/payroll/runs returned 200 OK');
  const targetRun = runData.data.find((r: any) => ['FINALIZED', 'APPROVED'].includes(r.status)) || runData.data[0];
  assert(Boolean(targetRun), `Discovered target payroll run: ${targetRun?.runNumber} (${targetRun?.status})`);

  // --- STEP 2: Disbursement Dashboard Stats Endpoint ---
  console.log('\n--- STEP 2: Disbursement Dashboard Statistics ---');
  const statsRes = await fetch(`${BASE_URL}/api/payroll/payments/stats?payrollPeriodId=${period.id}`, {
    headers: { Cookie: adminCookie },
  });
  const statsData = await statsRes.json();
  assert(statsRes.ok && statsData.success, 'GET /api/payroll/payments/stats returns 200 OK');
  assert(typeof statsData.data.totalNetPayroll === 'number', 'Stats contains numeric totalNetPayroll');
  assert(typeof statsData.data.completionPercentage === 'number', 'Stats contains numeric completionPercentage');

  // --- STEP 3: Payment Batches List Endpoint ---
  console.log('\n--- STEP 3: Payment Batches Listing ---');
  const batchesRes = await fetch(`${BASE_URL}/api/payroll/payments/batches?payrollPeriodId=${period.id}`, {
    headers: { Cookie: adminCookie },
  });
  const batchesData = await batchesRes.json();
  assert(batchesRes.ok && batchesData.success, 'GET /api/payroll/payments/batches returns 200 OK');
  assert(Array.isArray(batchesData.data), 'Batches endpoint returned array');

  // --- STEP 4: Create Batch or Retrieve Active Batch ---
  console.log('\n--- STEP 4: Payment Batch Lifecycle & State Machine ---');
  let batchId = '';
  if (batchesData.data.length > 0) {
    batchId = batchesData.data[0].id;
    console.log(`  ℹ️ Utilizing existing test batch: ${batchesData.data[0].batchNumber} (${batchId})`);
  } else {
    const createRes = await fetch(`${BASE_URL}/api/payroll/payments/batches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        payrollRunId: targetRun.id,
        name: 'E2E HTTP Test Disbursement Batch',
        paymentMethod: 'MIXED',
        notes: 'Automated E2E HTTP verification batch',
      }),
    });
    const createData = await createRes.json();
    assert(createRes.ok && createData.success, 'POST /api/payroll/payments/batches returns 200 OK');
    batchId = createData.data.id;
  }
  assert(Boolean(batchId), `Active payment batch ready with ID ${batchId}`);

  // --- STEP 5: Single Batch Details & Masked Review Endpoint ---
  console.log('\n--- STEP 5: Single Batch Details & Review Destination Matrix ---');
  const detailRes = await fetch(`${BASE_URL}/api/payroll/payments/batches/${batchId}`, {
    headers: { Cookie: adminCookie },
  });
  const detailData = await detailRes.json();
  assert(detailRes.ok && detailData.success, 'GET /api/payroll/payments/batches/[id] returns 200 OK');
  assert(Boolean(detailData.data.batch.batchNumber), 'Batch detail contains batchNumber');
  assert(Array.isArray(detailData.data.reviewItems), 'Batch detail contains reviewItems array');

  const firstItem = detailData.data.reviewItems[0];
  if (firstItem) {
    assert(firstItem.destinationMasked.includes('****'), `Destination account is properly masked: ${firstItem.destinationMasked}`);
  }

  // --- STEP 6: Submit Batch (if in DRAFT) ---
  if (detailData.data.batch.status === 'DRAFT') {
    console.log('\n--- STEP 6: Submit Batch (DRAFT -> READY) ---');
    const submitRes = await fetch(`${BASE_URL}/api/payroll/payments/batches/${batchId}/submit`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    const submitData = await submitRes.json();
    assert(submitRes.ok && submitData.success, 'POST /api/payroll/payments/batches/[id]/submit returns 200 OK');
    assert(submitData.data.status === 'READY', 'Batch transitioned to READY');
  }

  // --- STEP 7: Approve Batch (if in READY) ---
  const currentDetailRes = await fetch(`${BASE_URL}/api/payroll/payments/batches/${batchId}`, {
    headers: { Cookie: adminCookie },
  });
  const currentDetail = await currentDetailRes.json();
  if (currentDetail.data.batch.status === 'READY') {
    console.log('\n--- STEP 7: Authorize & Approve Batch (READY -> APPROVED) ---');
    const approveRes = await fetch(`${BASE_URL}/api/payroll/payments/batches/${batchId}/approve`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    const approveData = await approveRes.json();
    assert(approveRes.ok && approveData.success, 'POST /api/payroll/payments/batches/[id]/approve returns 200 OK');
    assert(approveData.data.status === 'APPROVED', 'Batch transitioned to APPROVED');
  }

  // --- STEP 8: Process Batch (if in APPROVED) ---
  const beforeProcessRes = await fetch(`${BASE_URL}/api/payroll/payments/batches/${batchId}`, {
    headers: { Cookie: adminCookie },
  });
  const beforeProcess = await beforeProcessRes.json();
  if (beforeProcess.data.batch.status === 'APPROVED') {
    console.log('\n--- STEP 8: Execute Batch Payout Processing (APPROVED -> COMPLETED) ---');
    const processRes = await fetch(`${BASE_URL}/api/payroll/payments/batches/${batchId}/process`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    const processData = await processRes.json();
    assert(processRes.ok && processData.success, 'POST /api/payroll/payments/batches/[id]/process returns 200 OK');
    assert(['COMPLETED', 'PARTIALLY_FAILED'].includes(processData.data.status), `Batch finished with status ${processData.data.status}`);
  }

  // --- STEP 9: Search Historical Payment Transactions ---
  console.log('\n--- STEP 9: Search Historical Payment Transactions ---');
  const txRes = await fetch(`${BASE_URL}/api/payroll/payments/transactions?pageSize=10`, {
    headers: { Cookie: adminCookie },
  });
  const txData = await txRes.json();
  assert(txRes.ok && txData.success, 'GET /api/payroll/payments/transactions returns 200 OK');
  assert(Array.isArray(txData.data), 'Transactions search returned array');
  assert(txData.data.length > 0, `Transactions returned (${txData.data.length} records)`);

  const sampleTx = txData.data[0];
  assert(Boolean(sampleTx.transactionNumber), `Transaction contains transactionNumber (${sampleTx.transactionNumber})`);
  assert(sampleTx.destinationMasked.includes('****'), 'Transaction contains masked destination');

  // --- STEP 10: Formatted Payment Receipt Endpoint ---
  console.log('\n--- STEP 10: Formatted Payment Receipt Endpoint ---');
  const receiptRes = await fetch(`${BASE_URL}/api/payroll/payments/transactions/${sampleTx.id}/receipt`, {
    headers: { Cookie: adminCookie },
  });
  const receiptData = await receiptRes.json();
  assert(receiptRes.ok && receiptData.success, 'GET /api/payroll/payments/transactions/[id]/receipt returns 200 OK');
  assert(Boolean(receiptData.data.company.kraPin), `Receipt contains company KRA PIN (${receiptData.data.company.kraPin})`);
  assert(Boolean(receiptData.data.employee.fullName), `Receipt contains employee bio (${receiptData.data.employee.fullName})`);
  assert(typeof receiptData.data.amount === 'number', `Receipt contains numeric amount (KES ${receiptData.data.amount})`);

  // --- STEP 11: Payment Reconciliation Endpoint ---
  console.log('\n--- STEP 11: Payment Reconciliation Engine Endpoint ---');
  const recRes = await fetch(`${BASE_URL}/api/payroll/payments/reconciliation?payrollPeriodId=${period.id}&runId=${targetRun.id}`, {
    headers: { Cookie: adminCookie },
  });
  const recData = await recRes.json();
  assert(recRes.ok && recData.success, 'GET /api/payroll/payments/reconciliation returns 200 OK');
  assert(typeof recData.data.summary.expectedAmount === 'number', 'Reconciliation contains expectedAmount');
  assert(typeof recData.data.summary.actualPaidAmount === 'number', 'Reconciliation contains actualPaidAmount');
  assert(Array.isArray(recData.data.discrepancies), 'Reconciliation contains discrepancies list');

  // --- STEP 12: Save Official Reconciliation Report ---
  console.log('\n--- STEP 12: Save Official Reconciliation Audit Report ---');
  const saveRecRes = await fetch(`${BASE_URL}/api/payroll/payments/reconciliation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      payrollPeriodId: period.id,
      runId: targetRun.id,
      notes: 'HTTP E2E verification test reconciliation report',
    }),
  });
  const saveRecData = await saveRecRes.json();
  assert(saveRecRes.ok && saveRecData.success, 'POST /api/payroll/payments/reconciliation returns 200 OK');
  assert(Boolean(saveRecData.data.reconciliationNumber), `Reconciliation report saved: ${saveRecData.data.reconciliationNumber}`);

  // --- STEP 13: Retry Transaction Endpoint ---
  console.log('\n--- STEP 13: Retry Transaction Endpoint ---');
  const retryRes = await fetch(`${BASE_URL}/api/payroll/payments/transactions/${sampleTx.id}/retry`, {
    method: 'POST',
    headers: { Cookie: adminCookie },
  });
  // If transaction was already SUCCESS, it should cleanly report message or update status
  assert(retryRes.status === 200 || retryRes.status === 400, 'POST /api/payroll/payments/transactions/[id]/retry handled appropriately');

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n========================================================');
  console.log(`📊 PHASE 9 HTTP E2E SUMMARY:`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total Endpoints Tested: ${passed + failed}`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runE2E().catch((err) => {
  console.error('Fatal error during Phase 9 HTTP E2E tests:', err);
  process.exit(1);
});
