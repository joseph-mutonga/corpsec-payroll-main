// CorpSec HR Payroll — Master Payroll Calculation Engine Facade
// Orchestrates end-to-end multi-tier payroll calculation, auditing, exception logging, and reconciliation

import prisma from '@/lib/prisma';
import { DecimalMath, RoundingMethod } from './DecimalMath';
import { SalaryCalculator, SalaryRecordInput, UnpaidLeaveInput } from './SalaryCalculator';
import { OvertimeCalculator, OvertimeRecordInput, OvertimeRateConfigInput } from './OvertimeCalculator';
import { AllowanceCalculator, EmployeeAllowanceInput } from './AllowanceCalculator';
import { BonusCommissionCalculator, OtherEarningInput } from './BonusCommissionCalculator';
import { GrossPayCalculator } from './GrossPayCalculator';
import { StatutoryCalculator, StatutoryRuleInput, TaxBandInput } from './StatutoryCalculator';
import { DeductionCalculator, EmployeeDeductionInput, OtherDeductionInput } from './DeductionCalculator';
import { NetPayCalculator } from './NetPayCalculator';
import { PayrollValidator, ExceptionItem } from './PayrollValidator';
import { PayrollReconciler, EmployeeRecordSummary } from './PayrollReconciler';

export interface ExecuteRunOptions {
  payrollRunId: string;
  userId?: string;
}

export class PayrollEngineFacade {
  /**
   * Executes the full payroll calculation engine for a specific payroll run.
   */
  static async execute(options: ExecuteRunOptions) {
    const { payrollRunId, userId } = options;

    // 1. Fetch Payroll Run & associated Period
    const run = await prisma.payrollRun.findUnique({
      where: { id: payrollRunId },
      include: {
        payrollPeriod: true,
      },
    });

    if (!run) {
      throw new Error(`Payroll Run with ID "${payrollRunId}" not found.`);
    }

    if (run.status === 'FINALIZED' || run.status === 'LOCKED') {
      throw new Error(`Payroll Run ${run.runNumber} is ${run.status} and cannot be recalculated.`);
    }

    const period = run.payrollPeriod;
    const periodStart = new Date(period.startDate);
    const periodEnd = new Date(period.endDate);
    periodStart.setUTCHours(0, 0, 0, 0);
    periodEnd.setUTCHours(23, 59, 59, 999);

    // 2. Fetch Company Settings
    const companySettings = await prisma.companyPayrollSetting.findFirst() || {
      payFrequency: 'MONTHLY',
      defaultPayDay: 28,
      cutoffDay: 24,
      defaultCurrency: 'KES',
      roundingMethod: 'ROUND_NEAREST_1',
      prorationBaseDays: 30,
      overtimeHourlyDivisor: 225,
      allowNegativeNetPay: false,
      requireTwoTierApproval: true,
    };

    // 3. Fetch Statutory Rules & Tax Bands
    const statutoryRules = await prisma.statutoryRule.findMany({
      where: { status: 'ACTIVE' },
    });

    const taxBands = await prisma.taxBand.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { bandOrder: 'asc' },
    });

    // 4. Fetch Overtime Rate Configurations
    const overtimeRateConfigs = await prisma.overtimeRateConfig.findMany({
      where: { status: 'ACTIVE' },
    });

    // Snapshot of configuration rules for reproducibility
    const ruleConfigSnapshot = JSON.stringify({
      capturedAt: new Date().toISOString(),
      statutoryRulesCount: statutoryRules.length,
      taxBandsCount: taxBands.length,
      statutoryRules: statutoryRules.map((r: any) => ({
        regimeType: r.regimeType,
        empRate: r.employeeRate ?? r.employeeRatePercentage ?? 0,
        emplrRate: r.employerRate ?? r.employerRatePercentage ?? 0,
        tier1: r.minThreshold ?? r.tier1Limit ?? 8000,
        tier2: r.maxThreshold ?? r.tier2Limit ?? 72000,
      })),
      taxBands: taxBands.map((b) => ({
        order: b.bandOrder,
        name: b.bandName,
        lower: b.lowerThreshold,
        upper: b.upperThreshold,
        rate: b.ratePercentage,
      })),
      companySettings: {
        roundingMethod: companySettings.roundingMethod,
        prorationBaseDays: companySettings.prorationBaseDays,
        overtimeHourlyDivisor: companySettings.overtimeHourlyDivisor,
      },
    });

    // 5. Fetch Target Employees (Active or on leave)
    const employees = await prisma.employee.findMany({
      where: {
        isArchived: false,
        employmentStatus: { in: ['ACTIVE', 'ON_LEAVE'] },
      },
      include: {
        department: true,
        branch: true,
        station: true,
        salaryRecords: {
          orderBy: { effectiveFrom: 'desc' },
        },
        allowanceAssignments: {
          include: { allowanceType: true },
        },
        deductionAssignments: {
          include: { deductionType: true },
        },
        overtimeRecords: {
          where: {
            date: {
              gte: periodStart,
              lte: periodEnd,
            },
          },
        },
        leaveRequests: {
          where: {
            startDate: { lte: periodEnd },
            endDate: { gte: periodStart },
          },
          include: { leaveType: true },
        },
        attendanceRecords: {
          where: {
            date: {
              gte: periodStart,
              lte: periodEnd,
            },
          },
        },
        otherEarnings: {
          where: {
            OR: [
              { payrollPeriodId: period.id },
              { effectiveDate: { gte: periodStart, lte: periodEnd } },
            ],
          },
        },
        otherDeductions: {
          where: {
            OR: [
              { payrollPeriodId: period.id },
              { effectiveDate: { gte: periodStart, lte: periodEnd } },
            ],
          },
        },
      },
      orderBy: { employeeNumber: 'asc' },
    });

    // Run-level accumulator totals
    let runTotalBasicPay = 0;
    let runTotalAllowances = 0;
    let runTotalOvertimePay = 0;
    let runTotalBonusPay = 0;
    let runTotalCommissionPay = 0;
    let runTotalOtherEarnings = 0;
    let runGrossPayroll = 0;
    let runTotalPayeTax = 0;
    let runTotalNssfEmployee = 0;
    let runTotalShaEmployee = 0;
    let runTotalHousingLevyEmployee = 0;
    let runTotalStatutoryDeductions = 0;
    let runTotalOtherDeductions = 0;
    let runTotalDeductions = 0;
    let runTotalNetPayroll = 0;
    let runTotalNssfEmployer = 0;
    let runTotalShaEmployer = 0;
    let runTotalHousingLevyEmployer = 0;
    let runTotalEmployerContributions = 0;

    const employeeRecordsToInsert: any[] = [];
    const exceptionsToInsert: ExceptionItem[] = [];
    const recordsSummaryForReconciliation: EmployeeRecordSummary[] = [];

    for (const emp of employees) {
      // Step A: Pre-validation
      const unapprovedOt = emp.overtimeRecords.filter((ot) => ot.approvalStatus === 'PENDING');
      const unapprovedLeaves = emp.leaveRequests.filter((l) => l.status === 'SUBMITTED' || l.status === 'UNDER_REVIEW');

      const validationExceptions = PayrollValidator.validateEmployee({
        id: emp.id,
        employeeNumber: emp.employeeNumber,
        fullName: emp.fullName,
        employmentStatus: emp.employmentStatus,
        kraPin: emp.kraPin,
        nssfNumber: emp.nssfNumber,
        shaNumber: emp.shaNumber,
        preferredPaymentMethod: emp.preferredPaymentMethod,
        bankAccountNumber: emp.bankAccountNumber,
        bankName: emp.bankName,
        mpesaPhoneNumber: emp.mpesaPhoneNumber,
        salaryRecords: emp.salaryRecords.map((s) => ({ status: s.status, basicSalary: s.basicSalary })),
        unapprovedOvertimeCount: unapprovedOt.length,
        unapprovedLeaveCount: unapprovedLeaves.length,
      }, companySettings.allowNegativeNetPay);

      exceptionsToInsert.push(...validationExceptions);

      // Check if employee has missing salary blocker
      const activeSalaryRecords = emp.salaryRecords.filter((s) => s.status === 'ACTIVE' || s.status === 'SUPERSEDED');
      if (activeSalaryRecords.length === 0) {
        continue; // Cannot calculate salary if no structure exists
      }

      // Step B: Calculate Basic Pay & Proration
      const unpaidLeaveRecords: UnpaidLeaveInput[] = emp.leaveRequests.map((l: any) => ({
        id: l.id,
        startDate: l.startDate,
        endDate: l.endDate,
        totalDays: l.durationDays ?? l.daysCount ?? 0,
        approvalStatus: l.status,
        leaveType: l.leaveType ? { code: l.leaveType.code, isPaid: l.leaveType.isPaid } : undefined,
      }));

      const absentAttendanceCount = emp.attendanceRecords.filter(
        (a) => a.attendanceStatus === 'ABSENT' && a.approvalStatus === 'APPROVED'
      ).length;

      const salaryResult = SalaryCalculator.calculate(
        emp.salaryRecords as unknown as SalaryRecordInput[],
        {
          id: period.id,
          startDate: period.startDate,
          endDate: period.endDate,
          payrollMonth: period.payrollMonth,
          payrollYear: period.payrollYear,
        },
        unpaidLeaveRecords,
        absentAttendanceCount,
        companySettings.prorationBaseDays
      );

      // Step C: Calculate Overtime
      const overtimeResult = OvertimeCalculator.calculate(
        salaryResult.nominalBasicSalary,
        emp.overtimeRecords as unknown as OvertimeRecordInput[],
        overtimeRateConfigs as unknown as OvertimeRateConfigInput[],
        salaryResult.isOvertimeEligible,
        companySettings.overtimeHourlyDivisor
      );

      // Step D: Calculate Allowances
      const allowanceResult = AllowanceCalculator.calculate(
        emp.allowanceAssignments as unknown as EmployeeAllowanceInput[],
        salaryResult.nominalBasicSalary,
        { startDate: period.startDate, endDate: period.endDate },
        companySettings.prorationBaseDays
      );

      // Step E: Calculate Bonuses, Commissions, Arrears
      const bonusResult = BonusCommissionCalculator.calculate(
        emp.otherEarnings as unknown as OtherEarningInput[]
      );

      // Step F: Calculate Gross Pay
      const grossResult = GrossPayCalculator.calculate({
        proratedBasicPay: salaryResult.proratedBasicPay,
        totalAllowances: allowanceResult.totalAllowances,
        taxableAllowances: allowanceResult.taxableAllowances,
        pensionableAllowances: allowanceResult.pensionableAllowances,
        totalOvertimePay: overtimeResult.totalOvertimePay,
        totalBonusPay: bonusResult.totalBonusPay,
        totalCommissionPay: bonusResult.totalCommissionPay,
        totalOtherEarnings: bonusResult.totalOtherEarnings,
        taxableOtherEarnings: bonusResult.taxableEarnings,
      });

      // Step G: Calculate Statutory Deductions & Contributions
      const statutoryResult = StatutoryCalculator.calculate(
        grossResult.grossPay,
        grossResult.taxableGross,
        grossResult.pensionableEarnings,
        statutoryRules as unknown as StatutoryRuleInput[],
        taxBands as unknown as TaxBandInput[]
      );

      // Step H: Calculate Voluntary / Other Deductions
      const deductionResult = DeductionCalculator.calculate(
        emp.deductionAssignments as unknown as EmployeeDeductionInput[],
        emp.otherDeductions as unknown as OtherDeductionInput[],
        salaryResult.nominalBasicSalary
      );

      // Step I: Calculate Net Pay
      const netPayResult = NetPayCalculator.calculate({
        grossPay: grossResult.grossPay,
        totalStatutoryDeductions: statutoryResult.totalStatutoryDeductions,
        totalOtherDeductions: deductionResult.totalOtherDeductions,
        allowNegativeNetPay: companySettings.allowNegativeNetPay,
        roundingMethod: companySettings.roundingMethod as RoundingMethod,
      });

      // Check for negative net pay exception
      if (netPayResult.isNegative && !companySettings.allowNegativeNetPay) {
        exceptionsToInsert.push({
          employeeId: emp.id,
          exceptionType: 'NEGATIVE_NET_PAY',
          severity: 'CRITICAL',
          description: `Employee ${emp.fullName} has negative net salary of KES ${netPayResult.rawNetPay.toLocaleString()} (Gross KES ${grossResult.grossPay.toLocaleString()} minus Total Deductions KES ${netPayResult.totalDeductions.toLocaleString()}).`,
        });
      }

      // Step J: Build Full Calculation Trace Object
      const fullCalculationTrace = {
        meta: {
          employeeNumber: emp.employeeNumber,
          fullName: emp.fullName,
          jobTitle: emp.jobTitle,
          department: emp.department?.name || 'Unassigned',
          branch: emp.branch?.name || 'Unassigned',
          station: emp.station?.name || 'Unassigned',
          payrollPeriod: period.name,
          calculatedAt: new Date().toISOString(),
          calculationVersion: run.calculationVersion,
        },
        salary: {
          nominalBasicSalary: salaryResult.nominalBasicSalary,
          proratedBasicPay: salaryResult.proratedBasicPay,
          unpaidLeaveDays: salaryResult.unpaidLeaveDays,
          unpaidLeaveDeduction: salaryResult.unpaidLeaveDeduction,
          absenceDays: salaryResult.absenceDays,
          absenceDeduction: salaryResult.absenceDeduction,
          trace: salaryResult.trace,
        },
        overtime: {
          totalHours: overtimeResult.totalOvertimeHours,
          totalPay: overtimeResult.totalOvertimePay,
          hourlyRate: overtimeResult.hourlyRate,
          hourlyDivisor: overtimeResult.hourlyDivisor,
          entries: overtimeResult.entries,
          trace: overtimeResult.trace,
        },
        allowances: {
          total: allowanceResult.totalAllowances,
          taxable: allowanceResult.taxableAllowances,
          nonTaxable: allowanceResult.nonTaxableAllowances,
          pensionable: allowanceResult.pensionableAllowances,
          items: allowanceResult.items,
          trace: allowanceResult.trace,
        },
        bonusesCommissions: {
          bonusPay: bonusResult.totalBonusPay,
          commissionPay: bonusResult.totalCommissionPay,
          otherEarnings: bonusResult.totalOtherEarnings,
          items: bonusResult.items,
        },
        grossPay: {
          grossTotal: grossResult.grossPay,
          taxableGross: grossResult.taxableGross,
          pensionableBase: grossResult.pensionableEarnings,
          trace: grossResult.trace,
        },
        statutory: {
          payeTax: statutoryResult.payeTax,
          grossTax: statutoryResult.grossTax,
          personalRelief: statutoryResult.personalRelief,
          taxableIncome: statutoryResult.taxableIncome,
          nssfTier1Employee: statutoryResult.nssfTier1Employee,
          nssfTier2Employee: statutoryResult.nssfTier2Employee,
          totalNssfEmployee: statutoryResult.totalNssfEmployee,
          nssfTier1Employer: statutoryResult.nssfTier1Employer,
          nssfTier2Employer: statutoryResult.nssfTier2Employer,
          totalNssfEmployer: statutoryResult.totalNssfEmployer,
          shaEmployee: statutoryResult.shaEmployee,
          shaEmployer: statutoryResult.shaEmployer,
          housingLevyEmployee: statutoryResult.housingLevyEmployee,
          housingLevyEmployer: statutoryResult.housingLevyEmployer,
          totalStatutoryDeductions: statutoryResult.totalStatutoryDeductions,
          totalEmployerContributions: statutoryResult.totalEmployerContributions,
          taxBandsBreakdown: statutoryResult.taxBandsBreakdown,
          trace: statutoryResult.trace,
        },
        otherDeductions: {
          total: deductionResult.totalOtherDeductions,
          items: deductionResult.items,
          balanceUpdates: deductionResult.balanceUpdates,
          trace: deductionResult.trace,
        },
        netPay: {
          totalDeductions: netPayResult.totalDeductions,
          rawNetPay: netPayResult.rawNetPay,
          netPay: netPayResult.netPay,
          roundingAdjustment: netPayResult.roundingAdjustment,
          trace: netPayResult.trace,
        },
      };

      // Accumulate totals
      runTotalBasicPay = DecimalMath.sum(runTotalBasicPay, salaryResult.proratedBasicPay);
      runTotalAllowances = DecimalMath.sum(runTotalAllowances, allowanceResult.totalAllowances);
      runTotalOvertimePay = DecimalMath.sum(runTotalOvertimePay, overtimeResult.totalOvertimePay);
      runTotalBonusPay = DecimalMath.sum(runTotalBonusPay, bonusResult.totalBonusPay);
      runTotalCommissionPay = DecimalMath.sum(runTotalCommissionPay, bonusResult.totalCommissionPay);
      runTotalOtherEarnings = DecimalMath.sum(runTotalOtherEarnings, bonusResult.totalOtherEarnings);
      runGrossPayroll = DecimalMath.sum(runGrossPayroll, grossResult.grossPay);

      runTotalPayeTax = DecimalMath.sum(runTotalPayeTax, statutoryResult.payeTax);
      runTotalNssfEmployee = DecimalMath.sum(runTotalNssfEmployee, statutoryResult.totalNssfEmployee);
      runTotalShaEmployee = DecimalMath.sum(runTotalShaEmployee, statutoryResult.shaEmployee);
      runTotalHousingLevyEmployee = DecimalMath.sum(runTotalHousingLevyEmployee, statutoryResult.housingLevyEmployee);
      runTotalStatutoryDeductions = DecimalMath.sum(runTotalStatutoryDeductions, statutoryResult.totalStatutoryDeductions);

      runTotalOtherDeductions = DecimalMath.sum(runTotalOtherDeductions, deductionResult.totalOtherDeductions);
      runTotalDeductions = DecimalMath.sum(runTotalDeductions, netPayResult.totalDeductions);
      runTotalNetPayroll = DecimalMath.sum(runTotalNetPayroll, netPayResult.netPay);

      runTotalNssfEmployer = DecimalMath.sum(runTotalNssfEmployer, statutoryResult.totalNssfEmployer);
      runTotalShaEmployer = DecimalMath.sum(runTotalShaEmployer, statutoryResult.shaEmployer);
      runTotalHousingLevyEmployer = DecimalMath.sum(runTotalHousingLevyEmployer, statutoryResult.housingLevyEmployer);
      runTotalEmployerContributions = DecimalMath.sum(runTotalEmployerContributions, statutoryResult.totalEmployerContributions);

      employeeRecordsToInsert.push({
        payrollRunId: run.id,
        employeeId: emp.id,
        employmentStatus: emp.employmentStatus,
        jobTitle: emp.jobTitle,
        departmentName: emp.department?.name || null,
        branchName: emp.branch?.name || null,
        stationName: emp.station?.name || null,
        basicSalary: salaryResult.nominalBasicSalary,
        proratedBasicPay: salaryResult.proratedBasicPay,
        unpaidLeaveDeduction: salaryResult.unpaidLeaveDeduction,
        absenceDeduction: salaryResult.absenceDeduction,
        totalAllowances: allowanceResult.totalAllowances,
        overtimeHours: overtimeResult.totalOvertimeHours,
        totalOvertimePay: overtimeResult.totalOvertimePay,
        totalBonusPay: bonusResult.totalBonusPay,
        totalCommissionPay: bonusResult.totalCommissionPay,
        totalOtherEarnings: bonusResult.totalOtherEarnings,
        grossPay: grossResult.grossPay,
        taxableGross: grossResult.taxableGross,
        payeTax: statutoryResult.payeTax,
        personalRelief: statutoryResult.personalRelief,
        nssfTier1Employee: statutoryResult.nssfTier1Employee,
        nssfTier2Employee: statutoryResult.nssfTier2Employee,
        shaEmployee: statutoryResult.shaEmployee,
        housingLevyEmployee: statutoryResult.housingLevyEmployee,
        totalStatutoryDeductions: statutoryResult.totalStatutoryDeductions,
        totalOtherDeductions: deductionResult.totalOtherDeductions,
        totalDeductions: netPayResult.totalDeductions,
        netPay: netPayResult.netPay,
        nssfTier1Employer: statutoryResult.nssfTier1Employer,
        nssfTier2Employer: statutoryResult.nssfTier2Employer,
        shaEmployer: statutoryResult.shaEmployer,
        housingLevyEmployer: statutoryResult.housingLevyEmployer,
        totalEmployerContributions: statutoryResult.totalEmployerContributions,
        paymentMethod: emp.preferredPaymentMethod,
        bankAccountNumber: emp.bankAccountNumber,
        bankName: emp.bankName,
        mpesaPhoneNumber: emp.mpesaPhoneNumber,
        kraPin: emp.kraPin,
        nssfNumber: emp.nssfNumber,
        shaNumber: emp.shaNumber,
        calculationTrace: JSON.stringify(fullCalculationTrace),
        status: 'CALCULATED',
      });

      recordsSummaryForReconciliation.push({
        basicSalary: salaryResult.nominalBasicSalary,
        proratedBasicPay: salaryResult.proratedBasicPay,
        totalAllowances: allowanceResult.totalAllowances,
        totalOvertimePay: overtimeResult.totalOvertimePay,
        totalBonusPay: bonusResult.totalBonusPay,
        totalCommissionPay: bonusResult.totalCommissionPay,
        totalOtherEarnings: bonusResult.totalOtherEarnings,
        grossPay: grossResult.grossPay,
        payeTax: statutoryResult.payeTax,
        nssfTier1Employee: statutoryResult.nssfTier1Employee,
        nssfTier2Employee: statutoryResult.nssfTier2Employee,
        shaEmployee: statutoryResult.shaEmployee,
        housingLevyEmployee: statutoryResult.housingLevyEmployee,
        totalStatutoryDeductions: statutoryResult.totalStatutoryDeductions,
        totalOtherDeductions: deductionResult.totalOtherDeductions,
        totalDeductions: netPayResult.totalDeductions,
        netPay: netPayResult.netPay,
        nssfTier1Employer: statutoryResult.nssfTier1Employer,
        nssfTier2Employer: statutoryResult.nssfTier2Employer,
        shaEmployer: statutoryResult.shaEmployer,
        housingLevyEmployer: statutoryResult.housingLevyEmployer,
        totalEmployerContributions: statutoryResult.totalEmployerContributions,
      });
    }

    // Step K: Reconcile Rollup Totals against Individual Records
    const reconciliation = PayrollReconciler.reconcile(recordsSummaryForReconciliation, {
      employeeCount: employeeRecordsToInsert.length,
      totalBasicPay: runTotalBasicPay,
      totalAllowances: runTotalAllowances,
      totalOvertimePay: runTotalOvertimePay,
      totalBonusPay: runTotalBonusPay,
      totalCommissionPay: runTotalCommissionPay,
      totalOtherEarnings: runTotalOtherEarnings,
      grossPayroll: runGrossPayroll,
      totalPayeTax: runTotalPayeTax,
      totalNssfEmployee: runTotalNssfEmployee,
      totalShaEmployee: runTotalShaEmployee,
      totalHousingLevyEmployee: runTotalHousingLevyEmployee,
      totalStatutoryDeductions: runTotalStatutoryDeductions,
      totalOtherDeductions: runTotalOtherDeductions,
      totalDeductions: runTotalDeductions,
      totalNetPayroll: runTotalNetPayroll,
      totalEmployerContributions: runTotalEmployerContributions,
    });

    // Step L: Atomic Persistence Transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete previous calculated records and exceptions for this run
      await tx.payrollRunException.deleteMany({
        where: { payrollRunId: run.id },
      });
      await tx.payrollEmployeeRecord.deleteMany({
        where: { payrollRunId: run.id },
      });

      // 2. Insert new employee records
      for (const rec of employeeRecordsToInsert) {
        await tx.payrollEmployeeRecord.create({
          data: rec,
        });
      }

      // 3. Insert generated exceptions
      for (const exc of exceptionsToInsert) {
        await tx.payrollRunException.create({
          data: {
            payrollRunId: run.id,
            employeeId: exc.employeeId,
            exceptionType: exc.exceptionType,
            severity: exc.severity,
            description: exc.description,
          },
        });
      }

      // 4. Update Payroll Run entity
      await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: 'CALCULATED',
          employeeCount: employeeRecordsToInsert.length,
          totalBasicPay: runTotalBasicPay,
          totalAllowances: runTotalAllowances,
          totalOvertimePay: runTotalOvertimePay,
          totalBonusPay: runTotalBonusPay,
          totalCommissionPay: runTotalCommissionPay,
          totalOtherEarnings: runTotalOtherEarnings,
          grossPayroll: runGrossPayroll,
          totalPayeTax: runTotalPayeTax,
          totalNssfEmployee: runTotalNssfEmployee,
          totalShaEmployee: runTotalShaEmployee,
          totalHousingLevyEmployee: runTotalHousingLevyEmployee,
          totalStatutoryDeductions: runTotalStatutoryDeductions,
          totalOtherDeductions: runTotalOtherDeductions,
          totalDeductions: runTotalDeductions,
          totalNetPayroll: runTotalNetPayroll,
          totalNssfEmployer: runTotalNssfEmployer,
          totalShaEmployer: runTotalShaEmployer,
          totalHousingLevyEmployer: runTotalHousingLevyEmployer,
          totalEmployerContributions: runTotalEmployerContributions,
          isReconciled: reconciliation.isReconciled,
          ruleConfigSnapshot,
          calculatedAt: new Date(),
          calculatedById: userId || run.createdById,
          calculationVersion: { increment: 1 },
        },
      });

      // 5. Audit Log Entry
      await tx.auditLog.create({
        data: {
          userId: userId || null,
          action: 'CALCULATE_PAYROLL',
          module: 'PAYROLL',
          entityType: 'PAYROLL_RUN',
          entityId: run.id,
          newValue: JSON.stringify({
            runNumber: run.runNumber,
            employeeCount: employeeRecordsToInsert.length,
            grossPayroll: runGrossPayroll,
            netPayroll: runTotalNetPayroll,
            exceptionsCount: exceptionsToInsert.length,
            isReconciled: reconciliation.isReconciled,
          }),
        },
      });
    });

    return {
      runId: run.id,
      runNumber: run.runNumber,
      employeeCount: employeeRecordsToInsert.length,
      grossPayroll: runGrossPayroll,
      netPayroll: runTotalNetPayroll,
      statutoryDeductions: runTotalStatutoryDeductions,
      otherDeductions: runTotalOtherDeductions,
      totalEmployerContributions: runTotalEmployerContributions,
      exceptionsCount: exceptionsToInsert.length,
      isReconciled: reconciliation.isReconciled,
      discrepancies: reconciliation.discrepancies,
    };
  }
}
