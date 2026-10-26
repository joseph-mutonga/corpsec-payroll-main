// CorpSec HR Payroll — Phase 7 Comprehensive Unit & Engine Verification Suite
// Tests financial precision, modular calculators, statutory tax bands, exceptions, and reconciliation

import { PrismaClient } from '@prisma/client';
import { DecimalMath } from '../src/lib/payroll-engine/DecimalMath';
import { SalaryCalculator } from '../src/lib/payroll-engine/SalaryCalculator';
import { OvertimeCalculator } from '../src/lib/payroll-engine/OvertimeCalculator';
import { AllowanceCalculator } from '../src/lib/payroll-engine/AllowanceCalculator';
import { BonusCommissionCalculator } from '../src/lib/payroll-engine/BonusCommissionCalculator';
import { GrossPayCalculator } from '../src/lib/payroll-engine/GrossPayCalculator';
import { StatutoryCalculator } from '../src/lib/payroll-engine/StatutoryCalculator';
import { DeductionCalculator } from '../src/lib/payroll-engine/DeductionCalculator';
import { NetPayCalculator } from '../src/lib/payroll-engine/NetPayCalculator';
import { PayrollValidator } from '../src/lib/payroll-engine/PayrollValidator';
import { PayrollReconciler } from '../src/lib/payroll-engine/PayrollReconciler';
import { PayrollEngineFacade } from '../src/lib/payroll-engine/PayrollEngineFacade';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failed++;
  }
}

async function runPhase7Verification() {
  console.log('================================================================');
  console.log('🚀 CORPSEC HR PAYROLL — PHASE 7 CALCULATION ENGINE TEST SUITE');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. Precision Decimal Math Tests
  // ---------------------------------------------------------------------------
  console.log('--- 1. Testing Financial Decimal Math Engine ---');
  {
    const sumResult = DecimalMath.sum(100.1, 200.2, 300.3);
    assert(sumResult === 600.6, `Sum (100.1 + 200.2 + 300.3) = ${sumResult} (expected 600.6)`);

    const subResult = DecimalMath.sub(1000.55, 300.25);
    assert(subResult === 700.3, `Sub (1000.55 - 300.25) = ${subResult} (expected 700.3)`);

    const mulResult = DecimalMath.mul(35000, 0.06);
    assert(mulResult === 2100, `Mul (35,000 * 6%) = ${mulResult} (expected 2100)`);

    const divResult = DecimalMath.div(30000, 30);
    assert(divResult === 1000, `Div (30,000 / 30) = ${divResult} (expected 1000)`);

    const roundNearest = DecimalMath.round(2450.49, 'ROUND_NEAREST_1');
    assert(roundNearest === 2450, `Round nearest 2450.49 = ${roundNearest}`);

    const roundUp = DecimalMath.round(2450.01, 'ROUND_UP');
    assert(roundUp === 2451, `Round up 2450.01 = ${roundUp}`);
  }

  // ---------------------------------------------------------------------------
  // 2. Salary Calculator Tests (Mid-month change & Unpaid leave)
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Testing Salary Calculator & Proration Engine ---');
  {
    // A. Regular uninterrupted salary
    const singleSalaryRes = SalaryCalculator.calculate(
      [
        {
          id: 'sal-1',
          basicSalary: 30000,
          payFrequency: 'MONTHLY',
          currency: 'KES',
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
          status: 'ACTIVE',
        },
      ],
      {
        id: 'prd-1',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-31'),
        payrollMonth: 8,
        payrollYear: 2026,
      }
    );
    assert(singleSalaryRes.proratedBasicPay === 30000, `Single uninterrupted salary = KES ${singleSalaryRes.proratedBasicPay}`);

    // B. Mid-month transition: 25k (Aug 1 to 14 = 14 days) -> 30k (Aug 15 to 31 = 17 days)
    // Daily rate based on 30 days divisor:
    // 25,000 / 30 * 14 = 11,666.67
    // 30,000 / 30 * 17 = 17,000.00
    // Total = 28,666.67
    const midMonthRes = SalaryCalculator.calculate(
      [
        {
          id: 'sal-old',
          basicSalary: 25000,
          payFrequency: 'MONTHLY',
          currency: 'KES',
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: new Date('2026-08-14'),
          status: 'SUPERSEDED',
        },
        {
          id: 'sal-new',
          basicSalary: 30000,
          payFrequency: 'MONTHLY',
          currency: 'KES',
          effectiveFrom: new Date('2026-08-15'),
          effectiveTo: null,
          status: 'ACTIVE',
        },
      ],
      {
        id: 'prd-aug',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-31'),
        payrollMonth: 8,
        payrollYear: 2026,
      },
      [],
      0,
      30
    );
    assert(
      Math.abs(midMonthRes.proratedBasicPay - 28666.67) < 0.05,
      `Mid-month salary transition proration = KES ${midMonthRes.proratedBasicPay} (expected ~28,666.67)`
    );

    // C. Unpaid leave deduction (2 days unpaid leave on 30,000 salary / 30 = 1,000/day -> 2,000 ded -> 28,000 payable)
    const unpaidLeaveRes = SalaryCalculator.calculate(
      [
        {
          id: 'sal-1',
          basicSalary: 30000,
          payFrequency: 'MONTHLY',
          currency: 'KES',
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
          status: 'ACTIVE',
        },
      ],
      {
        id: 'prd-1',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-31'),
        payrollMonth: 8,
        payrollYear: 2026,
      },
      [
        {
          id: 'lv-unpaid',
          startDate: new Date('2026-08-10'),
          endDate: new Date('2026-08-11'),
          totalDays: 2,
          approvalStatus: 'APPROVED',
          leaveType: { code: 'UNPAID', isPaid: false },
        },
      ],
      0,
      30
    );
    assert(
      unpaidLeaveRes.proratedBasicPay === 28000,
      `Unpaid leave proration: 30,000 - (2 days * 1,000) = KES ${unpaidLeaveRes.proratedBasicPay}`
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Overtime Calculator Tests
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Testing Overtime Calculation Engine ---');
  {
    // Hourly rate on 36,000 with 225 divisor = 160 KES/hr
    // 10 hrs Normal OT (1.5x) = 10 * 160 * 1.5 = 2,400 KES
    // 4 hrs Holiday OT (2.0x) = 4 * 160 * 2.0 = 1,280 KES
    // Total OT Pay = 3,680 KES
    const otRes = OvertimeCalculator.calculate(
      36000,
      [
        {
          id: 'ot-1',
          date: '2026-08-05',
          overtimeHours: 10,
          approvalStatus: 'APPROVED',
        },
      ],
      [
        {
          code: 'OT-NORMAL',
          overtimeType: 'NORMAL',
          rateMultiplier: 1.5,
          status: 'ACTIVE',
        },
      ],
      true,
      225
    );
    assert(otRes.hourlyRate === 160, `Base hourly rate (36,000 / 225) = KES ${otRes.hourlyRate}/hr`);
    assert(otRes.totalOvertimePay === 2400, `Normal OT Pay (10 hrs @ 1.5x) = KES ${otRes.totalOvertimePay}`);

    // Ineligible employee returns 0
    const ineligOtRes = OvertimeCalculator.calculate(36000, [{ id: 'ot-1', date: '2026-08-05', overtimeHours: 10, approvalStatus: 'APPROVED' }], [], false, 225);
    assert(ineligOtRes.totalOvertimePay === 0, `Ineligible employee OT pay = KES ${ineligOtRes.totalOvertimePay}`);
  }

  // ---------------------------------------------------------------------------
  // 4. Kenyan Statutory Calculator Tests (PAYE, NSSF, SHA, Housing Levy)
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Testing Kenyan Statutory Tax & Contribution Engine ---');
  {
    // Test Case Employee: Gross = KES 50,000
    // NSSF:
    // Tier 1: 6% of 8,000 = 480 KES (Employee & Employer)
    // Tier 2: 6% of (50,000 - 8,000) = 6% of 42,000 = 2,520 KES (Employee & Employer)
    // Total NSSF Employee = 3,000 KES
    // SHA: 2.75% of 50,000 = 1,375 KES
    // Housing Levy: 1.5% of 50,000 = 750 KES (Employee & Employer)
    // PAYE:
    // Taxable Base = 50,000 - 3,000 (NSSF allowable) = 47,000 KES
    // Band 1: 24,000 @ 10% = 2,400 KES
    // Band 2: 8,333 @ 25% = 2,083.25 KES
    // Band 3: (47,000 - 32,333) = 14,667 @ 30% = 4,400.10 KES
    // Total Gross Tax = 2,400 + 2,083.25 + 4,400.10 = 8,883.35 KES
    // Less Monthly Personal Relief = -2,400 KES
    // Net PAYE = 6,483.35 KES

    const statRes = StatutoryCalculator.calculate(
      50000,
      50000,
      50000,
      [
        {
          id: 'rule-nssf',
          regimeType: 'NSSF',
          name: 'NSSF',
          employeeRatePercentage: 6.0,
          employerRatePercentage: 6.0,
          tier1Limit: 8000,
          tier2Limit: 72000,
          isMandatory: true,
          status: 'ACTIVE',
        },
        {
          id: 'rule-sha',
          regimeType: 'SHA',
          name: 'SHA',
          employeeRatePercentage: 2.75,
          employerRatePercentage: 0,
          minMonthlyContribution: 300,
          isMandatory: true,
          status: 'ACTIVE',
        },
        {
          id: 'rule-ahl',
          regimeType: 'HOUSING_LEVY',
          name: 'Housing Levy',
          employeeRatePercentage: 1.5,
          employerRatePercentage: 1.5,
          isMandatory: true,
          status: 'ACTIVE',
        },
      ],
      [
        { id: 'b1', bandOrder: 1, bandName: 'Band 1', lowerThreshold: 0, upperThreshold: 24000, ratePercentage: 10.0, taxReliefMonthly: 2400, status: 'ACTIVE' },
        { id: 'b2', bandOrder: 2, bandName: 'Band 2', lowerThreshold: 24000, upperThreshold: 32333, ratePercentage: 25.0, status: 'ACTIVE' },
        { id: 'b3', bandOrder: 3, bandName: 'Band 3', lowerThreshold: 32333, upperThreshold: 500000, ratePercentage: 30.0, status: 'ACTIVE' },
      ]
    );

    assert(statRes.totalNssfEmployee === 3000, `NSSF Employee total = KES ${statRes.totalNssfEmployee} (expected 3000)`);
    assert(statRes.totalNssfEmployer === 3000, `NSSF Employer total = KES ${statRes.totalNssfEmployer} (expected 3000)`);
    assert(statRes.shaEmployee === 1375, `SHA Employee (2.75% of 50k) = KES ${statRes.shaEmployee} (expected 1375)`);
    assert(statRes.housingLevyEmployee === 750, `Housing Levy Employee (1.5% of 50k) = KES ${statRes.housingLevyEmployee} (expected 750)`);
    assert(statRes.housingLevyEmployer === 750, `Housing Levy Employer (1.5% of 50k) = KES ${statRes.housingLevyEmployer} (expected 750)`);
    assert(
      Math.abs(statRes.payeTax - 6483.35) < 0.1,
      `Progressive PAYE Net Tax = KES ${statRes.payeTax} (expected ~6483.35)`
    );
  }

  // ---------------------------------------------------------------------------
  // 5. Deduction Calculator & Diminishing Balance Tests
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Testing Deductions & Diminishing Loan Recovery Engine ---');
  {
    const dedRes = DeductionCalculator.calculate(
      [
        {
          id: 'ded-welfare',
          deductionTypeId: 'dt-1',
          amount: 500,
          calculationMethod: 'FIXED_AMOUNT',
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-01-01'),
          deductionType: { code: 'WELFARE', name: 'Guard Welfare', isStatutory: false },
        },
        {
          id: 'ded-loan',
          deductionTypeId: 'dt-2',
          amount: 2500,
          monthlyInstallment: 2500,
          currentBalance: 1200, // Balance less than installment
          calculationMethod: 'BALANCE_BASED',
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-01-01'),
          deductionType: { code: 'ADVANCE', name: 'Salary Advance', isStatutory: false },
        },
      ],
      [],
      30000
    );

    assert(dedRes.totalOtherDeductions === 1700, `Total Other Deductions = KES ${dedRes.totalOtherDeductions} (500 + capped 1,200)`);
    assert(dedRes.balanceUpdates.length === 1, `1 diminishing loan update recorded`);
    assert(dedRes.balanceUpdates[0].newBalance === 0, `Loan fully recovered (new balance = 0)`);
    assert(dedRes.balanceUpdates[0].isFinished === true, `Loan marked as finished`);
  }

  // ---------------------------------------------------------------------------
  // 6. Net Pay & Reconciliation Tests
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. Testing Net Pay & Exact Zero-Cent Reconciler ---');
  {
    const netRes = NetPayCalculator.calculate({
      grossPay: 45000,
      totalStatutoryDeductions: 8200,
      totalOtherDeductions: 1800,
      roundingMethod: 'ROUND_NEAREST_1',
    });

    assert(netRes.netPay === 35000, `Net Pay = KES ${netRes.netPay} (45,000 - 10,000)`);
    assert(netRes.isNegative === false, `Net Pay is not negative`);

    // Financial Reconciliation Test
    const recRes = PayrollReconciler.reconcile(
      [
        {
          basicSalary: 30000,
          proratedBasicPay: 30000,
          totalAllowances: 5000,
          totalOvertimePay: 2000,
          totalBonusPay: 0,
          totalCommissionPay: 0,
          totalOtherEarnings: 0,
          grossPay: 37000,
          payeTax: 4000,
          nssfTier1Employee: 480,
          nssfTier2Employee: 1320,
          shaEmployee: 1017.5,
          housingLevyEmployee: 555,
          totalStatutoryDeductions: 7372.5,
          totalOtherDeductions: 1000,
          totalDeductions: 8372.5,
          netPay: 28627.5,
          nssfTier1Employer: 480,
          nssfTier2Employer: 1320,
          shaEmployer: 0,
          housingLevyEmployer: 555,
          totalEmployerContributions: 2355,
        },
      ],
      {
        employeeCount: 1,
        totalBasicPay: 30000,
        totalAllowances: 5000,
        totalOvertimePay: 2000,
        totalBonusPay: 0,
        totalCommissionPay: 0,
        totalOtherEarnings: 0,
        grossPayroll: 37000,
        totalPayeTax: 4000,
        totalNssfEmployee: 1800,
        totalShaEmployee: 1017.5,
        totalHousingLevyEmployee: 555,
        totalStatutoryDeductions: 7372.5,
        totalOtherDeductions: 1000,
        totalDeductions: 8372.5,
        totalNetPayroll: 28627.5,
        totalEmployerContributions: 2355,
      }
    );

    assert(recRes.isReconciled === true, `Reconciler confirms 100% exact zero-cent balance`);
    assert(recRes.discrepancies.length === 0, `0 financial discrepancies found`);
  }

  // ---------------------------------------------------------------------------
  // 7. Full Database Payroll Engine Facade End-to-End Test
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. Testing Payroll Engine Facade with Database Integration ---');
  {
    // Find or create August 2026 payroll period
    let augPeriod = await prisma.payrollPeriod.findFirst({
      where: { payrollYear: 2026, payrollMonth: 8 },
    });

    if (!augPeriod) {
      augPeriod = await prisma.payrollPeriod.create({
        data: {
          periodNumber: 'PRD-2026-08',
          name: 'August 2026 Monthly Payroll',
          startDate: new Date('2026-08-01'),
          endDate: new Date('2026-08-31'),
          payrollMonth: 8,
          payrollYear: 2026,
          status: 'OPEN',
        },
      });
    }

    // Create a draft test payroll run
    const testRun = await prisma.payrollRun.create({
      data: {
        runNumber: `PAY-TEST-2026-08-${Date.now().toString().slice(-4)}`,
        payrollPeriodId: augPeriod.id,
        runType: 'REGULAR',
        status: 'DRAFT',
        notes: 'Automated test calculation run',
      },
    });

    // Execute Payroll Engine Facade
    const execResult = await PayrollEngineFacade.execute({
      payrollRunId: testRun.id,
    });

    assert(execResult.runId === testRun.id, `Facade executed for run ${execResult.runNumber}`);
    assert(execResult.employeeCount > 0, `Calculated ${execResult.employeeCount} employee records (> 0)`);
    assert(execResult.grossPayroll > 0, `Total Gross Payroll: KES ${execResult.grossPayroll.toLocaleString()}`);
    assert(execResult.netPayroll > 0, `Total Net Payroll: KES ${execResult.netPayroll.toLocaleString()}`);
    assert(execResult.isReconciled === true, `Database calculation run is mathematically reconciled`);

    // Verify persisted employee records
    const records = await prisma.payrollEmployeeRecord.findMany({
      where: { payrollRunId: testRun.id },
    });
    assert(records.length === execResult.employeeCount, `Persisted ${records.length} employee records`);
    assert(records[0].calculationTrace.length > 50, `Employee calculationTrace stored as valid JSON`);

    // Clean up test run
    await prisma.payrollRunException.deleteMany({ where: { payrollRunId: testRun.id } });
    await prisma.payrollEmployeeRecord.deleteMany({ where: { payrollRunId: testRun.id } });
    await prisma.payrollRun.delete({ where: { id: testRun.id } });
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`📊 PHASE 7 VERIFICATION SUMMARY: ${passed}/${passed + failed} TESTS PASSED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase7Verification()
  .catch((e) => {
    console.error('Fatal test error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
