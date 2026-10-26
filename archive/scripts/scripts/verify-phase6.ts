import { PrismaClient } from '@prisma/client';
import {
  resolveActiveSalaryOnDate,
  calculateResolvedAllowances,
  calculateResolvedDeductions,
} from '../src/lib/salary-effective-resolver';
import {
  validateTaxBands,
  detectPeriodOverlap,
  evaluatePayrollReadiness,
} from '../src/lib/payroll-config-validator';

const prisma = new PrismaClient();

async function runPhase6Verification() {
  console.log('================================================================');
  console.log('🚀 CORPSEC HR PAYROLL — PHASE 6 COMPREHENSIVE VERIFICATION SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      if (detail) console.error(`     Detail: ${detail}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. PURE ENGINE TEST: TAX BAND PROGRESSIVE MONOTONICITY & GAP CHECK
  // ---------------------------------------------------------------------------
  console.log('--- 1. Testing Tax Band Progressive Monotonicity Engine ---');

  const validBands = [
    { bandOrder: 1, bandName: 'Band 1', lowerThreshold: 0, upperThreshold: 24000, ratePercentage: 10 },
    { bandOrder: 2, bandName: 'Band 2', lowerThreshold: 24000, upperThreshold: 32333, ratePercentage: 25 },
    { bandOrder: 3, bandName: 'Band 3', lowerThreshold: 32333, upperThreshold: 500000, ratePercentage: 30 },
    { bandOrder: 4, bandName: 'Band 4', lowerThreshold: 500000, upperThreshold: 800000, ratePercentage: 32.5 },
    { bandOrder: 5, bandName: 'Band 5', lowerThreshold: 800000, upperThreshold: null, ratePercentage: 35 },
  ];
  const validResult = validateTaxBands(validBands);
  assert(validResult.isValid === true, 'Standard 5-tier Kenyan progressive PAYE tax bands validate cleanly');

  const gapBands = [
    { bandOrder: 1, bandName: 'Band 1', lowerThreshold: 0, upperThreshold: 24000, ratePercentage: 10 },
    { bandOrder: 2, bandName: 'Band 2', lowerThreshold: 25000, upperThreshold: 32333, ratePercentage: 25 }, // GAP between 24000 and 25000
    { bandOrder: 3, bandName: 'Band 3', lowerThreshold: 32333, upperThreshold: null, ratePercentage: 30 },
  ];
  const gapResult = validateTaxBands(gapBands);
  assert(gapResult.isValid === false, 'Tax bands with threshold gaps are properly rejected', gapResult.error);

  const nonZeroStartBands = [
    { bandOrder: 1, bandName: 'Band 1', lowerThreshold: 1000, upperThreshold: 24000, ratePercentage: 10 },
    { bandOrder: 2, bandName: 'Band 2', lowerThreshold: 24000, upperThreshold: null, ratePercentage: 30 },
  ];
  const nonZeroResult = validateTaxBands(nonZeroStartBands);
  assert(nonZeroResult.isValid === false, 'Tax bands starting above 0 are rejected', nonZeroResult.error);

  // ---------------------------------------------------------------------------
  // 2. PURE ENGINE TEST: PAYROLL PERIOD OVERLAP DETECTION
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Testing Payroll Period Overlap Detection Engine ---');

  const existingPeriods = [
    { id: 'prd-1', startDate: new Date('2026-01-01'), endDate: new Date('2026-01-31'), status: 'OPEN' },
    { id: 'prd-2', startDate: new Date('2026-02-01'), endDate: new Date('2026-02-28'), status: 'OPEN' },
  ];

  const noOverlap = detectPeriodOverlap(existingPeriods, '2026-03-01', '2026-03-31');
  assert(noOverlap.hasOverlap === false, 'Non-overlapping period (March) is permitted');

  const partialOverlap = detectPeriodOverlap(existingPeriods, '2026-02-15', '2026-03-15');
  assert(partialOverlap.hasOverlap === true, 'Partially overlapping period is caught and flagged', partialOverlap.overlappingPeriodId);

  const insideOverlap = detectPeriodOverlap(existingPeriods, '2026-01-10', '2026-01-20');
  assert(insideOverlap.hasOverlap === true, 'Enclosed period date range is caught and flagged');

  // ---------------------------------------------------------------------------
  // 3. PURE ENGINE TEST: EFFECTIVE DATING SALARY RESOLUTION & COMPENSATIONS
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Testing Effective-Dating Salary & Allowances Calculation Engine ---');

  const salaryHistory = [
    {
      id: 'sal-1',
      employeeId: 'emp-001',
      basicSalary: 25000,
      payFrequency: 'MONTHLY',
      currency: 'KES',
      isOvertimeEligible: true,
      effectiveFrom: new Date('2025-01-01'),
      effectiveTo: new Date('2025-12-31'),
      status: 'SUPERSEDED',
    },
    {
      id: 'sal-2',
      employeeId: 'emp-001',
      basicSalary: 30000,
      payFrequency: 'MONTHLY',
      currency: 'KES',
      isOvertimeEligible: true,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: new Date('2026-06-30'),
      status: 'SUPERSEDED',
    },
    {
      id: 'sal-3',
      employeeId: 'emp-001',
      basicSalary: 35000,
      payFrequency: 'MONTHLY',
      currency: 'KES',
      isOvertimeEligible: true,
      effectiveFrom: new Date('2026-07-01'),
      effectiveTo: null,
      status: 'ACTIVE',
    },
  ];

  const salIn2025 = resolveActiveSalaryOnDate(salaryHistory, new Date('2025-06-15'));
  assert(salIn2025?.basicSalary === 25000, 'Resolved 2025 historical salary: KES 25,000');

  const salInMay2026 = resolveActiveSalaryOnDate(salaryHistory, new Date('2026-05-15'));
  assert(salInMay2026?.basicSalary === 30000, 'Resolved early 2026 salary: KES 30,000');

  const salInAug2026 = resolveActiveSalaryOnDate(salaryHistory, new Date('2026-08-15'));
  assert(salInAug2026?.basicSalary === 35000, 'Resolved current active salary: KES 35,000');

  // Allowances computation
  const allowanceAssignments = [
    {
      id: 'alw-1',
      employeeId: 'emp-001',
      allowanceTypeId: 'at-1',
      allowanceType: { id: 'at-1', code: 'ALW-HOUSE', name: 'House Allowance', isTaxable: true, isPensionable: false },
      calculationMethod: 'PERCENTAGE_OF_BASIC',
      percentageValue: 15, // 15% of 35000 = 5250
      amount: 0,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
      status: 'ACTIVE',
      isRecurring: true,
    },
    {
      id: 'alw-2',
      employeeId: 'emp-001',
      allowanceTypeId: 'at-2',
      allowanceType: { id: 'at-2', code: 'ALW-RISK', name: 'Tactical Risk Allowance', isTaxable: true, isPensionable: false },
      calculationMethod: 'FIXED_AMOUNT',
      amount: 3000,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
      status: 'ACTIVE',
      isRecurring: true,
    },
  ];

  const resolvedAllowances = calculateResolvedAllowances(35000, allowanceAssignments, new Date('2026-08-01'));
  assert(resolvedAllowances.length === 2, 'Resolved 2 active allowances');
  assert(resolvedAllowances[0].computedAmount === 5250, '15% of basic resolved to KES 5,250');
  assert(resolvedAllowances[1].computedAmount === 3000, 'Fixed risk allowance resolved to KES 3,000');

  // Deductions computation (Balance-based recovery test)
  const deductionAssignments = [
    {
      id: 'ded-1',
      employeeId: 'emp-001',
      deductionTypeId: 'dt-1',
      deductionType: { id: 'dt-1', code: 'DED-WELFARE', name: 'Staff Welfare', isStatutory: false },
      calculationMethod: 'FIXED_AMOUNT',
      amount: 500,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
      status: 'ACTIVE',
      isRecurring: true,
    },
    {
      id: 'ded-2',
      employeeId: 'emp-001',
      deductionTypeId: 'dt-2',
      deductionType: { id: 'dt-2', code: 'DED-ADVANCE', name: 'Salary Advance Recovery', isStatutory: false },
      calculationMethod: 'BALANCE_BASED',
      amount: 3000, // Monthly recovery target
      currentBalance: 1800, // Outstanding balance less than monthly instalment
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
      status: 'ACTIVE',
      isRecurring: true,
    },
  ];

  const resolvedDeductions = calculateResolvedDeductions(35000, deductionAssignments, new Date('2026-08-01'));
  assert(resolvedDeductions[0].computedAmount === 500, 'Fixed welfare deduction resolved to KES 500');
  assert(resolvedDeductions[1].computedAmount === 1800, 'Balance-based recovery capped at remaining balance (KES 1,800 instead of 3,000)');

  // ---------------------------------------------------------------------------
  // 4. DATABASE INTEGRITY TESTS: VERIFY PHASE 6 SEEDED RECORDS
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Testing Database Schema & Seed Data Integrity ---');

  // 4.1 Company Payroll Setting
  const setting = await prisma.companyPayrollSetting.findFirst();
  assert(Boolean(setting), 'Company payroll setting exists in database');
  assert(setting?.defaultPayDay === 28, 'Default payday configured to 28th');
  assert(setting?.overtimeHourlyDivisor === 225, 'Standard overtime hourly divisor is 225');

  // 4.2 Payroll Periods (12 monthly periods for 2026)
  const periods = await prisma.payrollPeriod.findMany({
    where: { payrollYear: 2026 },
    orderBy: { payrollMonth: 'asc' },
  });
  assert(periods.length === 12, '12 monthly payroll periods seeded for 2026 (PRD-2026-01 to PRD-2026-12)');

  const augPeriod = periods.find((p) => p.payrollMonth === 8);
  assert(augPeriod?.status === 'OPEN', 'August 2026 period is OPEN for active operations');

  // 4.3 Allowance & Deduction Types Catalog
  const allowanceTypesCount = await prisma.allowanceType.count({ where: { status: 'ACTIVE' } });
  assert(allowanceTypesCount >= 6, `Seeded active allowance types: ${allowanceTypesCount} (>= 6)`);

  const deductionTypesCount = await prisma.deductionType.count({ where: { status: 'ACTIVE' } });
  assert(deductionTypesCount >= 6, `Seeded active deduction types: ${deductionTypesCount} (>= 6)`);

  // 4.4 Statutory Rules & Progressive Tax Bands
  const payeRule = await prisma.statutoryRule.findUnique({
    where: { regimeType: 'PAYE' },
    include: { taxBands: { orderBy: { bandOrder: 'asc' } } },
  });
  assert(Boolean(payeRule), 'PAYE statutory rule seeded in database');
  assert(payeRule?.taxBands.length === 5, 'PAYE contains 5 progressive tax bands matching Kenya Finance Act 2023/2026');
  assert(payeRule?.taxBands[0].taxReliefMonthly === 2400, 'PAYE includes monthly personal relief of KES 2,400');

  const nssfRule = await prisma.statutoryRule.findUnique({ where: { regimeType: 'NSSF_TIER_1' } });
  assert(nssfRule?.employeeRate === 6.0, 'NSSF Tier I employee rate configured to 6.0%');

  const shaRule = await prisma.statutoryRule.findUnique({ where: { regimeType: 'SHA' } });
  assert(shaRule?.employeeRate === 2.75, 'SHA rate configured to 2.75%');

  const housingRule = await prisma.statutoryRule.findUnique({ where: { regimeType: 'HOUSING_LEVY' } });
  assert(housingRule?.employeeRate === 1.5, 'Affordable Housing Levy employee rate configured to 1.5%');

  // 4.5 Overtime Rate Configurations
  const otConfigs = await prisma.overtimeRateConfig.findMany({ where: { status: 'ACTIVE' } });
  assert(otConfigs.length >= 3, `Seeded overtime rate configs: ${otConfigs.length} (Normal 1.5x, Holiday 2.0x, Rest Day 2.0x)`);

  // 4.6 Employee Salaries & Historical Revisions
  const totalSalaries = await prisma.salaryRecord.count();
  const activeSalaries = await prisma.salaryRecord.count({ where: { status: 'ACTIVE' } });
  const supersededSalaries = await prisma.salaryRecord.count({ where: { status: 'SUPERSEDED' } });

  assert(activeSalaries >= 10, `Active employee salary structures: ${activeSalaries}`);
  assert(supersededSalaries >= 1, `Historical superseded salary structures: ${supersededSalaries}`);
  assert(totalSalaries >= activeSalaries + supersededSalaries, `Total salary records in audit ledger: ${totalSalaries}`);

  // ---------------------------------------------------------------------------
  // 5. DIAGNOSTIC SCANNER TEST: WORKFORCE READINESS
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Testing Workforce Payroll Readiness Diagnostic Scanner ---');

  const activeEmployees = await prisma.employee.findMany({
    where: { deletedAt: null, isArchived: false, employmentStatus: 'ACTIVE' },
    select: {
      id: true,
      employeeNumber: true,
      fullName: true,
      employmentStatus: true,
      kraPin: true,
      nssfNumber: true,
      shaNumber: true,
      preferredPaymentMethod: true,
      bankAccountNumber: true,
      bankName: true,
      mpesaPhoneNumber: true,
      salaryRecords: {
        where: { status: 'ACTIVE' },
        select: { basicSalary: true, status: true, effectiveFrom: true },
      },
    },
  });

  const formattedEmps = activeEmployees.map((e) => ({
    ...e,
    activeSalary: e.salaryRecords[0] || null,
  }));

  const diagnosticResult = evaluatePayrollReadiness(formattedEmps);
  assert(diagnosticResult.totalChecked === activeEmployees.length, `Diagnostic scanned all ${activeEmployees.length} active guards`);
  assert(diagnosticResult.readyCount > 0, `Ready employees with full compliance: ${diagnosticResult.readyCount}/${diagnosticResult.totalChecked}`);

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`📊 PHASE 6 VERIFICATION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    console.log('✨ All Phase 6 pure calculations, validations, and database seeds verified successfully!');
  } else {
    console.error(`⚠️ ${totalTests - passedTests} tests failed.`);
    process.exit(1);
  }
}

runPhase6Verification()
  .catch((e) => {
    console.error('Fatal error during Phase 6 verification:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
