// CorpSec HR Payroll — Salary Calculator Engine
// Handles applicable basic salary resolution, mid-month salary transitions, and unpaid leave proration

import { DecimalMath } from './DecimalMath';

export interface SalaryRecordInput {
  id: string;
  basicSalary: number;
  payFrequency: string;
  currency: string;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
  status: string;
  isOvertimeEligible?: boolean;
}

export interface PayrollPeriodInput {
  id: string;
  startDate: Date | string;
  endDate: Date | string;
  payrollMonth: number;
  payrollYear: number;
}

export interface UnpaidLeaveInput {
  id: string;
  startDate: Date | string;
  endDate: Date | string;
  totalDays: number;
  approvalStatus: string;
  leaveType?: {
    code: string;
    isPaid: boolean;
  };
}

export interface SalaryCalculationResult {
  nominalBasicSalary: number;
  proratedBasicPay: number;
  unpaidLeaveDays: number;
  unpaidLeaveDeduction: number;
  absenceDays: number;
  absenceDeduction: number;
  isOvertimeEligible: boolean;
  trace: {
    method: string;
    periodDays: number;
    dailyRate: number;
    slices: Array<{
      basicSalary: number;
      effectiveFrom: string;
      effectiveTo: string | null;
      daysActive: number;
      proratedAmount: number;
    }>;
    unpaidLeaveCount: number;
    unpaidLeaveDeductionAmount: number;
    absenceCount: number;
    absenceDeductionAmount: number;
    notes: string[];
  };
}

export class SalaryCalculator {
  /**
   * Calculates the exact payable basic salary for an employee across a payroll period,
   * accounting for effective dates, mid-month transitions, and approved unpaid leaves.
   */
  static calculate(
    salaryRecords: SalaryRecordInput[],
    period: PayrollPeriodInput,
    unpaidLeaves: UnpaidLeaveInput[] = [],
    absenceDays = 0,
    prorationBaseDays = 30
  ): SalaryCalculationResult {
    const periodStart = new Date(period.startDate);
    const periodEnd = new Date(period.endDate);
    
    // Normalize to midnight UTC
    periodStart.setUTCHours(0, 0, 0, 0);
    periodEnd.setUTCHours(23, 59, 59, 999);

    const msPerDay = 1000 * 60 * 60 * 24;
    const totalCalendarDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / msPerDay) + 1;
    const divisorDays = prorationBaseDays > 0 ? prorationBaseDays : totalCalendarDays;

    // Filter salary records that intersect with the period and are ACTIVE or approved
    const activeRecords = salaryRecords
      .filter((s) => s.status === 'ACTIVE' || s.status === 'SUPERSEDED')
      .map((s) => ({
        ...s,
        from: new Date(s.effectiveFrom),
        to: s.effectiveTo ? new Date(s.effectiveTo) : null,
      }))
      .filter((s) => {
        const fromMidnight = new Date(s.from);
        fromMidnight.setUTCHours(0, 0, 0, 0);
        const toMidnight = s.to ? new Date(s.to) : null;
        if (toMidnight) toMidnight.setUTCHours(23, 59, 59, 999);

        const startsBeforeOrDuring = fromMidnight <= periodEnd;
        const endsAfterOrDuring = !toMidnight || toMidnight >= periodStart;
        return startsBeforeOrDuring && endsAfterOrDuring;
      })
      .sort((a, b) => a.from.getTime() - b.from.getTime());

    if (activeRecords.length === 0) {
      throw new Error(`No applicable active salary record found for period ${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`);
    }

    const latestActive = activeRecords[activeRecords.length - 1];
    const nominalBasicSalary = latestActive.basicSalary;
    const isOvertimeEligible = latestActive.isOvertimeEligible ?? true;

    // Handle mid-month transitions
    const slices: SalaryCalculationResult['trace']['slices'] = [];
    const notes: string[] = [];
    let accumulatedProrated = 0;

    if (activeRecords.length === 1 && activeRecords[0].from <= periodStart && (!activeRecords[0].to || activeRecords[0].to >= periodEnd)) {
      // Full uninterrupted period
      accumulatedProrated = activeRecords[0].basicSalary;
      slices.push({
        basicSalary: activeRecords[0].basicSalary,
        effectiveFrom: activeRecords[0].from.toISOString().slice(0, 10),
        effectiveTo: activeRecords[0].to ? activeRecords[0].to.toISOString().slice(0, 10) : null,
        daysActive: totalCalendarDays,
        proratedAmount: activeRecords[0].basicSalary,
      });
      notes.push(`Full period single salary rate of KES ${activeRecords[0].basicSalary.toLocaleString()}`);
    } else {
      // Split into time slices across the period
      for (const rec of activeRecords) {
        const sliceStart = new Date(rec.from.getTime() > periodStart.getTime() ? rec.from.getTime() : periodStart.getTime());
        const sliceEnd = new Date(rec.to && rec.to.getTime() < periodEnd.getTime() ? rec.to.getTime() : periodEnd.getTime());

        sliceStart.setUTCHours(0, 0, 0, 0);
        sliceEnd.setUTCHours(0, 0, 0, 0);

        const activeDaysInSlice = Math.max(0, Math.round((sliceEnd.getTime() - sliceStart.getTime()) / msPerDay) + 1);
        const dailyRate = DecimalMath.div(rec.basicSalary, divisorDays);
        const sliceAmount = DecimalMath.mul(dailyRate, activeDaysInSlice);

        accumulatedProrated = DecimalMath.sum(accumulatedProrated, sliceAmount);
        slices.push({
          basicSalary: rec.basicSalary,
          effectiveFrom: sliceStart.toISOString().slice(0, 10),
          effectiveTo: sliceEnd.toISOString().slice(0, 10),
          daysActive: activeDaysInSlice,
          proratedAmount: sliceAmount,
        });

        notes.push(`Prorated slice: KES ${rec.basicSalary} for ${activeDaysInSlice} days (${sliceStart.toISOString().slice(0, 10)} to ${sliceEnd.toISOString().slice(0, 10)}) = KES ${sliceAmount}`);
      }
    }

    // Daily rate for unpaid leave / absence deductions (based on latest active salary and divisor)
    const standardDailyRate = DecimalMath.div(nominalBasicSalary, divisorDays);

    // Calculate approved unpaid leave days
    let totalUnpaidLeaveDays = 0;
    for (const l of unpaidLeaves) {
      if (l.approvalStatus === 'APPROVED' && (!l.leaveType || !l.leaveType.isPaid)) {
        totalUnpaidLeaveDays += l.totalDays || 0;
      }
    }

    const unpaidLeaveDeduction = DecimalMath.mul(standardDailyRate, totalUnpaidLeaveDays);
    const absenceDeduction = DecimalMath.mul(standardDailyRate, absenceDays);

    // Final prorated basic after unpaid leave / absence
    const finalProratedBasic = Math.max(
      0,
      DecimalMath.sub(accumulatedProrated, DecimalMath.sum(unpaidLeaveDeduction, absenceDeduction))
    );

    if (totalUnpaidLeaveDays > 0) {
      notes.push(`Deducted ${totalUnpaidLeaveDays} approved unpaid leave days @ KES ${standardDailyRate}/day = KES ${unpaidLeaveDeduction}`);
    }
    if (absenceDays > 0) {
      notes.push(`Deducted ${absenceDays} absence days @ KES ${standardDailyRate}/day = KES ${absenceDeduction}`);
    }

    return {
      nominalBasicSalary,
      proratedBasicPay: finalProratedBasic,
      unpaidLeaveDays: totalUnpaidLeaveDays,
      unpaidLeaveDeduction,
      absenceDays,
      absenceDeduction,
      isOvertimeEligible,
      trace: {
        method: prorationBaseDays > 0 ? `FIXED_${prorationBaseDays}_DAYS` : 'CALENDAR_DAYS',
        periodDays: totalCalendarDays,
        dailyRate: standardDailyRate,
        slices,
        unpaidLeaveCount: totalUnpaidLeaveDays,
        unpaidLeaveDeductionAmount: unpaidLeaveDeduction,
        absenceCount: absenceDays,
        absenceDeductionAmount: absenceDeduction,
        notes,
      },
    };
  }
}
