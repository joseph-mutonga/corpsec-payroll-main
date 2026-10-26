export {};
const BASE_URL = process.env.BASE_URL || 'http://localhost:3005';

async function runE2EPhase6Tests() {
  console.log('================================================================');
  console.log(`🌐 CORPSEC HR PAYROLL — PHASE 6 HTTP E2E TEST SUITE (${BASE_URL})`);
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, title: string, detail?: any) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
      if (detail) console.error('     Detail:', detail);
    }
  }

  // 1. Authenticate as Super Admin
  console.log('--- 1. Authenticating as Super Admin ---');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@corpsec.co.ke',
      password: 'Admin@CorpSec2026!',
    }),
  });

  const loginData = await loginRes.json();
  assert(loginRes.ok && loginData.success, 'Super Admin authenticated successfully');
  const cookie = loginRes.headers.get('set-cookie') || '';

  const headers = {
    'Content-Type': 'application/json',
    Cookie: cookie,
  };

  // 2. Fetch Payroll Configuration Statistics
  console.log('\n--- 2. Testing /api/payroll/stats ---');
  const statsRes = await fetch(`${BASE_URL}/api/payroll/stats`, { headers });
  const statsData = await statsRes.json();
  assert(statsRes.ok && statsData.success, 'Fetched payroll stats successfully');
  assert(statsData.data.activePayrollPeriod !== null, 'Active payroll period detected (August 2026)');
  assert(statsData.data.totalEmployeesWithSalary > 0, `Employees with active salary: ${statsData.data.totalEmployeesWithSalary}`);

  // 3. Fetch & Create Payroll Periods
  console.log('\n--- 3. Testing /api/payroll/periods ---');
  const periodsRes = await fetch(`${BASE_URL}/api/payroll/periods?year=2026`, { headers });
  const periodsData = await periodsRes.json();
  assert(periodsRes.ok && periodsData.success, 'Fetched 2026 payroll periods');
  assert(periodsData.data.length === 12, '12 monthly periods returned for 2026');

  // Test creating non-overlapping future period (e.g. 2029 January)
  const randMonth = Math.floor(Math.random() * 11) + 1;
  const testPeriodCode = `PRD-2029-${String(randMonth).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;
  const startDay = `2029-${String(randMonth).padStart(2, '0')}-01`;
  const endDay = `2029-${String(randMonth).padStart(2, '0')}-28`;

  const createPrdRes = await fetch(`${BASE_URL}/api/payroll/periods`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      periodNumber: testPeriodCode,
      name: `Month ${randMonth} 2029 Monthly Payroll`,
      startDate: startDay,
      endDate: endDay,
      payrollMonth: randMonth,
      payrollYear: 2029,
      payFrequency: 'MONTHLY',
      status: 'OPEN',
      cutoffDate: `2029-${String(randMonth).padStart(2, '0')}-24`,
      paymentDate: `2029-${String(randMonth).padStart(2, '0')}-28`,
    }),
  });
  const text = await createPrdRes.text();
  let createPrdData: any = {};
  try {
    createPrdData = JSON.parse(text);
  } catch (e) {
    console.error('Raw response text from /api/payroll/periods:', text);
  }
  if (!createPrdData.success) {
    console.error('Period creation response error:', createPrdRes.status, createPrdData);
  }
  assert(createPrdRes.status === 201 && createPrdData.success, `Created future period ${testPeriodCode}`);
  const createdPeriodId = createPrdData.data?.id;

  // Test period locking
  if (createdPeriodId) {
    const lockRes = await fetch(`${BASE_URL}/api/payroll/periods/${createdPeriodId}/lock`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'LOCK' }),
    });
    const lockData = await lockRes.json();
    assert(lockRes.ok && lockData.data?.status === 'LOCKED', 'Locked payroll period successfully');

    const unlockRes = await fetch(`${BASE_URL}/api/payroll/periods/${createdPeriodId}/lock`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'UNLOCK' }),
    });
    const unlockData = await unlockRes.json();
    assert(unlockRes.ok && unlockData.data?.status === 'OPEN', 'Unlocked payroll period successfully');
  }

  // 4. Test Employee Salaries & Salary Revision Lifecycle
  console.log('\n--- 4. Testing /api/payroll/salaries & Approval Lifecycle ---');
  const salariesRes = await fetch(`${BASE_URL}/api/payroll/salaries`, { headers });
  const salariesData = await salariesRes.json();
  assert(salariesRes.ok && salariesData.success, 'Fetched employee salary records');

  // Grab an employee to test proposal lifecycle
  const targetSalary = salariesData.data[0];
  const targetEmpId = targetSalary?.employeeId;

  if (targetEmpId) {
    const proposeRes = await fetch(`${BASE_URL}/api/payroll/salaries`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        employeeId: targetEmpId,
        basicSalary: 42500,
        payFrequency: 'MONTHLY',
        effectiveFrom: '2026-09-01',
        changeReason: 'Merit Promotion to Senior Shift Supervisor',
        status: 'PENDING_APPROVAL',
      }),
    });
    const proposeData = await proposeRes.json();
    if (!proposeData.success) {
      console.error('Propose salary error:', proposeData);
    }
    assert(proposeRes.status === 201 && proposeData.data?.status === 'PENDING_APPROVAL', 'Submitted salary revision proposal (PENDING_APPROVAL)');
    const proposedSalaryId = proposeData.data?.id;

    // Approve the proposal
    if (proposedSalaryId) {
      const approveRes = await fetch(`${BASE_URL}/api/payroll/salaries/${proposedSalaryId}/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'APPROVE',
          notes: 'Approved during annual executive compensation review',
        }),
      });
      const approveData = await approveRes.json();
      assert(approveRes.ok && approveData.data.status === 'ACTIVE', 'Approved salary revision proposal -> status transitioned to ACTIVE');
    }
  }

  // 5. Test Allowances Management
  console.log('\n--- 5. Testing /api/payroll/allowances/types & assignments ---');
  const alwTypesRes = await fetch(`${BASE_URL}/api/payroll/allowances/types`, { headers });
  const alwTypesData = await alwTypesRes.json();
  assert(alwTypesRes.ok && alwTypesData.data.length >= 6, 'Fetched allowance types catalog');

  const testAlwCode = `ALW-TEST-${Date.now().toString().slice(-4)}`;
  const createAlwRes = await fetch(`${BASE_URL}/api/payroll/allowances/types`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      code: testAlwCode,
      name: 'Tactical Radio Allowance',
      description: 'Equipment custody allowance',
      calculationMethod: 'FIXED_AMOUNT',
      defaultAmount: 2500,
      isTaxable: true,
      isPensionable: false,
      isRecurring: true,
      status: 'ACTIVE',
    }),
  });
  const createAlwData = await createAlwRes.json();
  assert(createAlwRes.status === 201 && createAlwData.success, `Created custom allowance type ${testAlwCode}`);

  if (targetEmpId && createAlwData.data?.id) {
    const assignAlwRes = await fetch(`${BASE_URL}/api/payroll/allowances/assignments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        employeeId: targetEmpId,
        allowanceTypeId: createAlwData.data.id,
        amount: 2500,
        calculationMethod: 'FIXED_AMOUNT',
        effectiveFrom: '2026-08-01',
        isRecurring: true,
        status: 'ACTIVE',
      }),
    });
    const assignAlwData = await assignAlwRes.json();
    assert(assignAlwRes.status === 201 && assignAlwData.success, 'Assigned allowance to employee');
  }

  // 6. Test Deductions Management
  console.log('\n--- 6. Testing /api/payroll/deductions/types & assignments ---');
  const dedTypesRes = await fetch(`${BASE_URL}/api/payroll/deductions/types`, { headers });
  const dedTypesData = await dedTypesRes.json();
  assert(dedTypesRes.ok && dedTypesData.data.length >= 6, 'Fetched deduction types catalog');

  if (targetEmpId && dedTypesData.data.length > 0) {
    const assignDedRes = await fetch(`${BASE_URL}/api/payroll/deductions/assignments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        employeeId: targetEmpId,
        deductionTypeId: dedTypesData.data[0].id,
        amount: 1500,
        totalTargetAmount: 6000,
        currentBalance: 6000,
        effectiveFrom: '2026-08-01',
        isRecurring: true,
        status: 'ACTIVE',
      }),
    });
    const assignDedData = await assignDedRes.json();
    assert(assignDedRes.status === 201 && assignDedData.success, 'Assigned deduction with balance tracking to employee');
  }

  // 7. Test Statutory Rules & Progressive Tax Bands
  console.log('\n--- 7. Testing /api/payroll/statutory/rules & tax-bands ---');
  const statRulesRes = await fetch(`${BASE_URL}/api/payroll/statutory/rules`, { headers });
  const statRulesData = await statRulesRes.json();
  assert(statRulesRes.ok && statRulesData.data.length >= 4, 'Fetched Kenyan statutory rules (PAYE, NSSF, SHA, Housing Levy)');

  const taxBandsRes = await fetch(`${BASE_URL}/api/payroll/statutory/tax-bands`, { headers });
  const taxBandsData = await taxBandsRes.json();
  assert(taxBandsRes.ok && taxBandsData.data.length === 5, 'Fetched 5 progressive PAYE tax bands (Kenya 2026)');

  // 8. Test Payroll Company Settings
  console.log('\n--- 8. Testing /api/payroll/settings ---');
  const settingsRes = await fetch(`${BASE_URL}/api/payroll/settings`, { headers });
  const settingsData = await settingsRes.json();
  assert(settingsRes.ok && settingsData.data.payFrequency === 'MONTHLY', 'Fetched company payroll settings (Monthly, PayDay 28)');

  const updateSettingRes = await fetch(`${BASE_URL}/api/payroll/settings`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      overtimeHourlyDivisor: 225,
      roundingMethod: 'ROUND_NEAREST_1',
    }),
  });
  const updateSettingData = await updateSettingRes.json();
  assert(updateSettingRes.ok && updateSettingData.success, 'Updated payroll company configuration settings');

  // 9. Test Payroll Diagnostic Readiness Scan
  console.log('\n--- 9. Testing /api/payroll/readiness ---');
  const readyRes = await fetch(`${BASE_URL}/api/payroll/readiness`, { headers });
  const readyData = await readyRes.json();
  assert(readyRes.ok && readyData.success, 'Executed payroll readiness diagnostic scan');
  assert(readyData.data.totalChecked > 0, `Scanned ${readyData.data.totalChecked} active employees for calculation readiness`);

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`📊 PHASE 6 HTTP E2E SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('================================================================\n');

  if (passed === total) {
    console.log('🎉 All Phase 6 REST API endpoints and workflows passed End-to-End!');
  } else {
    console.error(`⚠️ ${total - passed} HTTP tests failed.`);
    process.exit(1);
  }
}

runE2EPhase6Tests().catch((err) => {
  console.error('Fatal error in HTTP E2E tests:', err);
  process.exit(1);
});
