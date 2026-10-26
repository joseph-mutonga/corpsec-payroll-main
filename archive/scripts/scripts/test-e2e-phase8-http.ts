// CorpSec HR Payroll — Phase 8 End-to-End HTTP Test Suite
// Validates all Phase 8 REST endpoints against running Next.js instance on port 3005
export {};

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3005';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: any) {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}`, detail || '');
    failed++;
  }
}

async function loginAs(email: string, pass: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass }),
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${email} with status ${res.status}`);
  }
  const cookies = res.headers.get('set-cookie');
  if (!cookies) {
    throw new Error(`No cookies returned for ${email}`);
  }
  return cookies.split(';')[0];
}

async function runE2E() {
  console.log('\n🚀 ========================================================');
  console.log('   CORPSEC HR PAYROLL — PHASE 8 E2E HTTP TEST SUITE');
  console.log(`   Target: ${BASE_URL}`);
  console.log('========================================================\n');

  console.log('🔑 Authenticating as Payroll Officer (payroll@corpsec.co.ke)...');
  const authCookie = await loginAs('payroll@corpsec.co.ke', 'Payroll@CorpSec2026!');
  const headers = {
    Cookie: authCookie,
    'Content-Type': 'application/json',
  };

  // Step 1: Query open periods and existing runs
  console.log('\n--- STEP 1: Discover Active Period & Payroll Run ---');
  const periodsRes = await fetch(`${BASE_URL}/api/payroll/periods?year=2026`, { headers });
  const periodsData = await periodsRes.json();
  assert(periodsData.success && periodsData.data.length > 0, 'Periods endpoint returned valid periods list');

  const openPeriod = periodsData.data.find((p: any) => p.status === 'OPEN') || periodsData.data[0];
  const periodId = openPeriod.id;
  console.log(`  ℹ️ Target period: ${openPeriod.name} (${openPeriod.id})`);

  let runsRes = await fetch(`${BASE_URL}/api/payroll/runs?payrollPeriodId=${periodId}`, { headers });
  let runsData = await runsRes.json();
  let targetRun = runsData.data && runsData.data.length > 0 ? runsData.data[0] : null;

  // If no run exists, calculate one
  if (!targetRun) {
    console.log('  ℹ️ No run found. Creating and calculating a test run for period...');
    const createRunRes = await fetch(`${BASE_URL}/api/payroll/runs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        payrollPeriodId: periodId,
        runType: 'REGULAR',
        notes: 'Phase 8 E2E Test Run',
      }),
    });
    const createdRunData = await createRunRes.json();
    targetRun = createdRunData.data;

    await fetch(`${BASE_URL}/api/payroll/runs/${targetRun.id}/calculate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
  }

  assert(targetRun && targetRun.id, `Target payroll run active: ${targetRun.runNumber}`);

  // Step 2: Test Payslips API
  console.log('\n--- STEP 2: Payslips Directory & Formatter Endpoint ---');
  const slipsRes = await fetch(`${BASE_URL}/api/payroll/payslips?runId=${targetRun.id}`, { headers });
  const slipsData = await slipsRes.json();
  assert(slipsRes.status === 200 && slipsData.success, 'GET /api/payroll/payslips returns 200 OK');
  assert(slipsData.data.length > 0, `GET /api/payroll/payslips returned ${slipsData.data.length} formatted payslips`);

  const firstSlip = slipsData.data[0];
  assert(firstSlip.recordId && firstSlip.employee.fullName, 'Formatted payslip contains recordId and employee bio');
  assert(typeof firstSlip.earnings.grossPay === 'number', 'Formatted payslip contains numeric grossPay');
  assert(typeof firstSlip.summary.netPay === 'number', 'Formatted payslip contains numeric netPay');
  assert(firstSlip.company.kraPin === 'P051234567Z' || Boolean(firstSlip.company.kraPin), 'Formatted payslip contains employer KRA PIN');

  // Step 3: Single Payslip Details Endpoint
  console.log('\n--- STEP 3: Single Payslip Details with Audit Log ---');
  console.log(`  ℹ️ Requesting /api/payroll/payslips/${firstSlip.recordId}`);
  const singleSlipRes = await fetch(`${BASE_URL}/api/payroll/payslips/${firstSlip.recordId}`, { headers });
  const singleSlipData = await singleSlipRes.json();
  console.log('  ℹ️ Single slip response:', singleSlipRes.status, singleSlipData);
  assert(singleSlipRes.status === 200 && singleSlipData.success, 'GET /api/payroll/payslips/[recordId] returns 200 OK');
  assert(singleSlipData.data?.recordId === firstSlip.recordId, 'Single payslip recordId matches requested ID');

  // Step 4: Email Payslip Endpoint
  console.log('\n--- STEP 4: Email Payslip Dispatch & Audit ---');
  const emailRes = await fetch(`${BASE_URL}/api/payroll/payslips/${firstSlip.recordId}/email`, {
    method: 'POST',
    headers,
  });
  const emailData = await emailRes.json();
  assert(emailRes.status === 200 && emailData.success, 'POST /api/payroll/payslips/[recordId]/email returns 200 OK');
  assert(emailData.data.recipientEmail && emailData.data.sentAt, 'Email endpoint logged recipient email and sentAt timestamp');

  // Step 5: Bulk Payslips Endpoint
  console.log('\n--- STEP 5: Bulk Payslips Generation Endpoint ---');
  const bulkRes = await fetch(`${BASE_URL}/api/payroll/payslips/bulk`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ runId: targetRun.id }),
  });
  const bulkData = await bulkRes.json();
  assert(bulkRes.status === 200 && bulkData.success, 'POST /api/payroll/payslips/bulk returns 200 OK');
  assert(bulkData.data.generatedCount > 0, `Bulk generation produced ${bulkData.data.generatedCount} payslips`);

  // Step 6: Payroll Summary Report (JSON & CSV)
  console.log('\n--- STEP 6: Payroll Financial Summary Report ---');
  const sumRes = await fetch(`${BASE_URL}/api/payroll/reports/summary?runId=${targetRun.id}`, { headers });
  const sumData = await sumRes.json();
  assert(sumRes.status === 200 && sumData.success, 'GET /api/payroll/reports/summary returns 200 OK');
  assert(sumData.data.totals && typeof sumData.data.totals.grossPay === 'number', 'Summary report contains totals object with grossPay');
  assert(typeof sumData.data.totals.netPay === 'number', 'Summary report contains totals netPay');
  assert(typeof sumData.data.totals.employerCost === 'number', 'Summary report contains total employer cost');

  const sumCsvRes = await fetch(`${BASE_URL}/api/payroll/reports/summary?runId=${targetRun.id}&format=csv`, { headers });
  const sumCsvText = await sumCsvRes.text();
  assert(sumCsvRes.status === 200, 'GET /api/payroll/reports/summary?format=csv returns 200 OK');
  assert(sumCsvText.includes('PAYROLL SUMMARY REPORT') && sumCsvText.includes('TOTALS'), 'Summary CSV contains title and totals row');

  // Step 7: Payroll Register Report (JSON & CSV)
  console.log('\n--- STEP 7: Master Payroll Register Report ---');
  const regRes = await fetch(`${BASE_URL}/api/payroll/reports/register?runId=${targetRun.id}`, { headers });
  const regData = await regRes.json();
  assert(regRes.status === 200 && regData.success, 'GET /api/payroll/reports/register returns 200 OK');
  assert(regData.data.rows && regData.data.rows.length > 0, `Register returned ${regData.data.rows.length} employee rows`);
  assert(regData.data.totals && regData.data.totals.employeeCount > 0, 'Register totals contains employeeCount');

  const regCsvRes = await fetch(`${BASE_URL}/api/payroll/reports/register?runId=${targetRun.id}&format=csv`, { headers });
  const regCsvText = await regCsvRes.text();
  assert(regCsvRes.status === 200, 'GET /api/payroll/reports/register?format=csv returns 200 OK');
  assert(regCsvText.includes('OFFICIAL PAYROLL REGISTER'), 'Register CSV contains official title');

  // Step 8: Statutory Returns Schedules (PAYE, NSSF, SHA, Housing Levy)
  console.log('\n--- STEP 8: Kenyan Statutory Returns Schedules ---');
  for (const regime of ['PAYE', 'NSSF', 'SHA', 'HOUSING_LEVY']) {
    const statRes = await fetch(`${BASE_URL}/api/payroll/reports/statutory?runId=${targetRun.id}&regime=${regime}`, { headers });
    const statData = await statRes.json();
    assert(statRes.status === 200 && statData.success, `GET /api/payroll/reports/statutory?regime=${regime} returns 200 OK`);
    assert(statData.data.report.regime === regime, `Statutory schedule regime is ${regime}`);
    assert(statData.data.report.totalPayableAmount >= 0, `Statutory schedule totalPayableAmount calculated`);

    const statCsvRes = await fetch(`${BASE_URL}/api/payroll/reports/statutory?runId=${targetRun.id}&regime=${regime}&format=csv`, { headers });
    assert(statCsvRes.status === 200, `GET /api/payroll/reports/statutory?regime=${regime}&format=csv returns 200 OK`);
  }

  // Step 9: Employer Cost Report (JSON & CSV)
  console.log('\n--- STEP 9: Employer True Labor Cost Report ---');
  const costRes = await fetch(`${BASE_URL}/api/payroll/reports/employer-cost?runId=${targetRun.id}`, { headers });
  const costData = await costRes.json();
  assert(costRes.status === 200 && costData.success, 'GET /api/payroll/reports/employer-cost returns 200 OK');
  assert(typeof costData.data.report.totalTrueEmployerCost === 'number', 'Employer cost report calculates totalTrueEmployerCost');
  assert(costData.data.report.departmentBreakdown.length > 0, 'Employer cost report includes department breakdown');
  assert(costData.data.report.branchBreakdown.length > 0, 'Employer cost report includes branch breakdown');

  const costCsvRes = await fetch(`${BASE_URL}/api/payroll/reports/employer-cost?runId=${targetRun.id}&format=csv`, { headers });
  assert(costCsvRes.status === 200, 'GET /api/payroll/reports/employer-cost?format=csv returns 200 OK');

  // Step 10: Payment Status Update API (Single & Bulk)
  console.log('\n--- STEP 10: Payment Status Update API ---');
  const singleStatusRes = await fetch(`${BASE_URL}/api/payroll/records/${firstSlip.recordId}/payment-status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      paymentStatus: 'PAID',
      paymentReference: 'MPESA-TEST-99218',
      paymentNotes: 'Disbursed via corporate M-Pesa bulk payout',
    }),
  });
  const singleStatusData = await singleStatusRes.json();
  assert(singleStatusRes.status === 200 && singleStatusData.success, 'PATCH /api/payroll/records/[recordId]/payment-status returns 200 OK');
  assert(singleStatusData.data.paymentStatus === 'PAID', 'Record paymentStatus updated to PAID');
  assert(singleStatusData.data.paymentReference === 'MPESA-TEST-99218', 'Record paymentReference recorded');

  const bulkStatusRes = await fetch(`${BASE_URL}/api/payroll/runs/${targetRun.id}/payment-status/bulk`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      paymentStatus: 'PAID',
      paymentReference: 'EFT-BULK-20260828',
    }),
  });
  const bulkStatusData = await bulkStatusRes.json();
  assert(bulkStatusRes.status === 200 && bulkStatusData.success, 'POST /api/payroll/runs/[id]/payment-status/bulk returns 200 OK');
  assert(bulkStatusData.data.updatedCount > 0, `Bulk payment status updated ${bulkStatusData.data.updatedCount} records to PAID`);

  console.log('\n========================================================');
  console.log(`📊 PHASE 8 HTTP E2E SUMMARY:`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total Endpoints Tested: ${passed + failed}`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runE2E().catch((err) => {
  console.error('Fatal error during Phase 8 HTTP E2E tests:', err);
  process.exit(1);
});
