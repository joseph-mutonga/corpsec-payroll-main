// CorpSec HR Payroll — Phase 8 Verification Test Suite
// Verifies PayslipFormatter, CsvExporter, StatutoryReportBuilder, EmployerCostCalculator, and Payment Status updates

import prisma from '../src/lib/prisma';
import { PayslipFormatter } from '../src/lib/payroll-reports/PayslipFormatter';
import { CsvExporter } from '../src/lib/payroll-reports/CsvExporter';
import { StatutoryReportBuilder } from '../src/lib/payroll-reports/StatutoryReportBuilder';
import { EmployerCostCalculator } from '../src/lib/payroll-reports/EmployerCostCalculator';
import { DecimalMath } from '../src/lib/payroll-engine/DecimalMath';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`, details || '');
    failed++;
  }
}

async function runPhase8Verification() {
  console.log('\n🧪 ========================================================');
  console.log('   CORPSEC HR PAYROLL — PHASE 8 VERIFICATION TEST SUITE');
  console.log('   Payslips, Payroll Reports, Statutory Outputs & Costs');
  console.log('========================================================\n');

  // Test Group 1: PayslipFormatter Unit Tests
  console.log('--- TEST GROUP 1: PayslipFormatter Unit Tests ---');
  const mockRecord = {
    id: 'rec-001',
    payrollRunId: 'run-001',
    employeeId: 'emp-001',
    basicSalary: 60000,
    proratedBasicPay: 60000,
    totalAllowances: 15000,
    totalOvertimePay: 4500,
    overtimeHours: 12,
    totalBonusPay: 5000,
    totalCommissionPay: 2000,
    totalOtherEarnings: 0,
    grossPay: 86500,
    taxableGross: 86500,
    payeTax: 15420.50,
    personalRelief: 2400,
    nssfTier1Employee: 420,
    nssfTier2Employee: 1740,
    shaEmployee: 2378.75,
    housingLevyEmployee: 1297.50,
    totalStatutoryDeductions: 21256.75,
    totalOtherDeductions: 3000,
    totalDeductions: 24256.75,
    netPay: 62243.25,
    nssfTier1Employer: 420,
    nssfTier2Employer: 1740,
    shaEmployer: 0,
    housingLevyEmployer: 1297.50,
    totalEmployerContributions: 3457.50,
    paymentMethod: 'BANK',
    bankName: 'Equity Bank',
    bankAccountNumber: '0123456789',
    kraPin: 'A012345678Z',
    nssfNumber: 'NSSF-9921',
    shaNumber: 'SHA-8821',
    paymentStatus: 'PAID',
    paidAt: new Date('2026-08-28T10:00:00Z'),
    employee: {
      id: 'emp-001',
      employeeNumber: 'SEC-001',
      fullName: 'John Kamau',
      nationalId: '12345678',
      jobTitle: 'Senior Guard Commander',
      employmentType: 'PERMANENT',
      department: { name: 'Guarding Operations' },
      branch: { name: 'Nairobi HQ' },
      station: { name: 'Upper Hill Post' },
    },
    payrollRun: {
      id: 'run-001',
      runNumber: 'PAY-2026-08-001',
      payrollPeriod: {
        id: 'per-001',
        name: 'August 2026',
        payrollMonth: 8,
        payrollYear: 2026,
        payDate: new Date('2026-08-28'),
      },
    },
    calculationTrace: JSON.stringify({
      allowances: {
        items: [
          { name: 'House Allowance', amount: 10000 },
          { name: 'Commuter Allowance', amount: 5000 },
        ],
      },
      otherDeductions: {
        items: [
          { name: 'SACCO Savings', amount: 3000, currentBalance: 45000 },
        ],
      },
    }),
  };

  const formatted = PayslipFormatter.format(mockRecord);
  assert(formatted.employee.fullName === 'John Kamau', 'PayslipFormatter formats employee full name correctly');
  assert(formatted.employee.employeeNumber === 'SEC-001', 'PayslipFormatter formats employee number correctly');
  assert(formatted.earnings.grossPay === 86500, 'PayslipFormatter gross pay matches source record');
  assert(formatted.earnings.allowances.length === 2, 'PayslipFormatter extracts itemized allowances from trace');
  assert(formatted.deductions.otherDeductions.length === 1, 'PayslipFormatter extracts itemized other deductions with balance');
  assert(formatted.deductions.totalNssf === 2160, 'PayslipFormatter calculates total employee NSSF (Tier 1 + Tier 2 = 2,160)');
  assert(formatted.deductions.housingLevy === 1297.50, 'PayslipFormatter captures Housing Levy (1,297.50)');
  assert(formatted.summary.netPay === 62243.25, 'PayslipFormatter net pay matches calculated amount');
  assert(formatted.employerContributions.totalContributions === 3457.50, 'PayslipFormatter captures total employer contributions');
  assert(formatted.paymentStatus === 'PAID', 'PayslipFormatter preserves payment status');

  // Test Group 2: CsvExporter Unit Tests
  console.log('\n--- TEST GROUP 2: CsvExporter Unit Tests ---');
  const sampleData = [
    { empNo: 'SEC-001', name: 'John Kamau', gross: 86500, net: 62243.25 },
    { empNo: 'SEC-002', name: 'Grace Achieng', gross: 55000, net: 42100.00 },
  ];

  const csvResult = CsvExporter.generate({
    title: 'TEST PAYROLL REPORT',
    periodName: 'August 2026',
    generatedBy: 'Admin User',
    columns: [
      { header: 'Emp No', key: 'empNo' },
      { header: 'Employee Name', key: 'name' },
      { header: 'Gross Pay', key: 'gross' },
      { header: 'Net Pay', key: 'net' },
    ],
    data: sampleData,
    totalsKeys: ['gross', 'net'],
  });

  assert(csvResult.includes('CORPSEC HR & PAYROLL MANAGEMENT SYSTEM'), 'CSV export includes CorpSec header banner');
  assert(csvResult.includes('TEST PAYROLL REPORT'), 'CSV export includes specified report title');
  assert(csvResult.includes('August 2026'), 'CSV export includes period name');
  assert(csvResult.includes('"John Kamau"'), 'CSV export properly quotes string fields');
  assert(csvResult.includes('141500.00'), 'CSV export correctly sums numeric totals for gross (86,500 + 55,000 = 141,500)');
  assert(csvResult.includes('104343.25'), 'CSV export correctly sums numeric totals for net (62,243.25 + 42,100 = 104,343.25)');

  // Test Group 3: StatutoryReportBuilder Unit Tests
  console.log('\n--- TEST GROUP 3: StatutoryReportBuilder Unit Tests ---');
  const testRecords = [
    {
      basicSalary: 50000,
      grossPay: 60000,
      taxableGross: 60000,
      payeTax: 9233.50,
      personalRelief: 2400,
      nssfTier1Employee: 420,
      nssfTier2Employee: 1740,
      nssfTier1Employer: 420,
      nssfTier2Employer: 1740,
      shaEmployee: 1650,
      housingLevyEmployee: 900,
      housingLevyEmployer: 900,
      kraPin: 'P011111111A',
      nssfNumber: 'NS-101',
      shaNumber: 'SH-101',
      employee: { employeeNumber: 'E001', fullName: 'Guard Alpha' },
    },
    {
      basicSalary: 40000,
      grossPay: 45000,
      taxableGross: 45000,
      payeTax: 5633.50,
      personalRelief: 2400,
      nssfTier1Employee: 420,
      nssfTier2Employee: 1740,
      nssfTier1Employer: 420,
      nssfTier2Employer: 1740,
      shaEmployee: 1237.50,
      housingLevyEmployee: 675,
      housingLevyEmployer: 675,
      kraPin: 'P022222222B',
      nssfNumber: 'NS-102',
      shaNumber: 'SH-102',
      employee: { employeeNumber: 'E002', fullName: 'Guard Beta' },
    },
  ];

  const payeSchedule = StatutoryReportBuilder.build(testRecords, 'PAYE');
  assert(payeSchedule.regime === 'PAYE', 'StatutoryReportBuilder sets regime to PAYE');
  assert(payeSchedule.totalEmployeeCount === 2, 'StatutoryReportBuilder counts 2 contributors');
  assert(payeSchedule.totalPayableAmount === 14867, 'StatutoryReportBuilder sums PAYE liability (9,233.50 + 5,633.50 = 14,867)');

  const nssfSchedule = StatutoryReportBuilder.build(testRecords, 'NSSF');
  assert(nssfSchedule.regime === 'NSSF', 'StatutoryReportBuilder sets regime to NSSF');
  assert(nssfSchedule.totalPayableAmount === 8640, 'StatutoryReportBuilder sums Grand Total NSSF ((2,160 + 2,160) * 2 = 8,640)');

  const shaSchedule = StatutoryReportBuilder.build(testRecords, 'SHA');
  assert(shaSchedule.regime === 'SHA', 'StatutoryReportBuilder sets regime to SHA');
  assert(shaSchedule.totalPayableAmount === 2887.50, 'StatutoryReportBuilder sums SHA 2.75% liability (1,650 + 1,237.50 = 2,887.50)');

  const ahlSchedule = StatutoryReportBuilder.build(testRecords, 'HOUSING_LEVY');
  assert(ahlSchedule.regime === 'HOUSING_LEVY', 'StatutoryReportBuilder sets regime to HOUSING_LEVY');
  assert(ahlSchedule.totalPayableAmount === 3150, 'StatutoryReportBuilder sums Housing Levy (900*2 + 675*2 = 3,150)');

  // Test Group 4: EmployerCostCalculator Unit Tests
  console.log('\n--- TEST GROUP 4: EmployerCostCalculator Unit Tests ---');
  const mockRun = {
    id: 'run-100',
    runNumber: 'PAY-2026-08-001',
    payrollPeriod: { name: 'August 2026' },
  };
  const costRecords = [
    {
      proratedBasicPay: 50000,
      totalAllowances: 10000,
      grossPay: 60000,
      nssfTier1Employer: 420,
      nssfTier2Employer: 1740,
      housingLevyEmployer: 900,
      shaEmployer: 0,
      departmentName: 'Guarding Operations',
      branchName: 'Nairobi HQ',
    },
    {
      proratedBasicPay: 40000,
      totalAllowances: 5000,
      grossPay: 45000,
      nssfTier1Employer: 420,
      nssfTier2Employer: 1740,
      housingLevyEmployer: 675,
      shaEmployer: 0,
      departmentName: 'Investigation Unit',
      branchName: 'Mombasa Coastal Branch',
    },
  ];

  const costReport = EmployerCostCalculator.calculate(mockRun, costRecords);
  assert(costReport.totalGrossSalaries === 105000, 'EmployerCostCalculator sums gross salaries (60,000 + 45,000 = 105,000)');
  assert(costReport.totalEmployerNssf === 4320, 'EmployerCostCalculator sums employer NSSF (2,160 + 2,160 = 4,320)');
  assert(costReport.totalEmployerHousingLevy === 1575, 'EmployerCostCalculator sums employer Housing Levy (900 + 675 = 1,575)');
  assert(costReport.totalEmployerContributions === 5895, 'EmployerCostCalculator sums employer contributions (4,320 + 1,575 = 5,895)');
  assert(costReport.totalTrueEmployerCost === 110895, 'EmployerCostCalculator computes True Labor Cost (105,000 + 5,895 = 110,895)');
  assert(costReport.departmentBreakdown.length === 2, 'EmployerCostCalculator breaks down cost into 2 departments');
  assert(costReport.branchBreakdown.length === 2, 'EmployerCostCalculator breaks down cost into 2 branches');

  // Test Group 5: Database Operations & Payment Status Transitions
  console.log('\n--- TEST GROUP 5: Database Operations & Payment Status Transitions ---');
  // Find or create an employee payroll record
  let dbRecord = await prisma.payrollEmployeeRecord.findFirst();
  if (dbRecord) {
    // Test updating payment status to PROCESSING
    const updatedProcessing = await prisma.payrollEmployeeRecord.update({
      where: { id: dbRecord.id },
      data: {
        paymentStatus: 'PROCESSING',
        paymentReference: 'BATCH-TEST-001',
      },
    });
    assert(updatedProcessing.paymentStatus === 'PROCESSING', 'Database record updated to PROCESSING status');

    // Test updating payment status to PAID with timestamp
    const now = new Date();
    const updatedPaid = await prisma.payrollEmployeeRecord.update({
      where: { id: dbRecord.id },
      data: {
        paymentStatus: 'PAID',
        paidAt: now,
        payslipGeneratedAt: now,
      },
    });
    assert(updatedPaid.paymentStatus === 'PAID', 'Database record updated to PAID status');
    assert(updatedPaid.paidAt !== null, 'Database record paidAt timestamp populated');
    assert(updatedPaid.payslipGeneratedAt !== null, 'Database record payslipGeneratedAt timestamp populated');
  } else {
    console.log('  ⚠️ Note: No existing PayrollEmployeeRecord found in DB to test DB update directly.');
  }

  console.log('\n========================================================');
  console.log(`📊 PHASE 8 VERIFICATION SUMMARY:`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total Tests: ${passed + failed}`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase8Verification().catch((err) => {
  console.error('Fatal error running Phase 8 verification:', err);
  process.exit(1);
});
