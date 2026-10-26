// CorpSec HR Payroll — Overtime Calculator Engine
// Evaluates approved overtime records against rate multipliers and hourly divisors

import { DecimalMath } from './DecimalMath';

export interface OvertimeRecordInput {
  id: string;
  date: Date | string;
  overtimeHours: number;
  overtimeMinutes?: number;
  reason?: string;
  approvalStatus: string;
}

export interface OvertimeRateConfigInput {
  code: string;
  overtimeType: string;
  rateMultiplier: number;
  hourlyDivisor?: number;
  status: string;
}

export interface OvertimeCalculationResult {
  totalOvertimeHours: number;
  totalOvertimePay: number;
  hourlyRate: number;
  hourlyDivisor: number;
  isEligible: boolean;
  entries: Array<{
    id: string;
    date: string;
    hours: number;
    multiplier: number;
    rate: number;
    amount: number;
  }>;
  trace: {
    hourlyDivisorUsed: number;
    baseHourlyRate: number;
    totalApprovedHours: number;
    totalApprovedPay: number;
    calculationDetails: string[];
  };
}

export class OvertimeCalculator {
  /**
   * Calculates overtime earnings for an employee based on approved overtime records,
   * basic salary, hourly divisor, and rate multipliers.
   */
  static calculate(
    basicSalary: number,
    overtimeRecords: OvertimeRecordInput[],
    rateConfigs: OvertimeRateConfigInput[] = [],
    isEligible = true,
    defaultHourlyDivisor = 225
  ): OvertimeCalculationResult {
    const divisor = defaultHourlyDivisor > 0 ? defaultHourlyDivisor : 225;
    const hourlyRate = DecimalMath.div(basicSalary, divisor);

    if (!isEligible || basicSalary <= 0 || !overtimeRecords || overtimeRecords.length === 0) {
      return {
        totalOvertimeHours: 0,
        totalOvertimePay: 0,
        hourlyRate,
        hourlyDivisor: divisor,
        isEligible,
        entries: [],
        trace: {
          hourlyDivisorUsed: divisor,
          baseHourlyRate: hourlyRate,
          totalApprovedHours: 0,
          totalApprovedPay: 0,
          calculationDetails: [
            !isEligible
              ? 'Employee is not eligible for overtime compensation'
              : 'No approved overtime records in period',
          ],
        },
      };
    }

    // Default rate multipliers fallback
    const rateMap: Record<string, number> = {
      NORMAL: 1.5,
      REST_DAY: 2.0,
      PUBLIC_HOLIDAY: 2.0,
      NIGHT: 1.5,
    };

    for (const cfg of rateConfigs) {
      if (cfg.status === 'ACTIVE') {
        rateMap[cfg.overtimeType] = cfg.rateMultiplier;
      }
    }

    let totalHours = 0;
    let totalPay = 0;
    const entries: OvertimeCalculationResult['entries'] = [];
    const details: string[] = [];

    // Filter only approved overtime records
    const approvedRecords = overtimeRecords.filter(
      (r) => r.approvalStatus === 'APPROVED' && (r.overtimeHours > 0 || (r.overtimeMinutes && r.overtimeMinutes > 0))
    );

    for (const rec of approvedRecords) {
      const hours = rec.overtimeHours > 0 ? rec.overtimeHours : (rec.overtimeMinutes || 0) / 60;
      // Default to 1.5x multiplier if not specified
      const multiplier = rateMap['NORMAL'] || 1.5;
      const effectiveRate = DecimalMath.mul(hourlyRate, multiplier);
      const amount = DecimalMath.mul(effectiveRate, hours);

      totalHours += hours;
      totalPay = DecimalMath.sum(totalPay, amount);

      const dateStr = typeof rec.date === 'string' ? rec.date.slice(0, 10) : new Date(rec.date).toISOString().slice(0, 10);

      entries.push({
        id: rec.id,
        date: dateStr,
        hours,
        multiplier,
        rate: effectiveRate,
        amount,
      });

      details.push(
        `${dateStr}: ${hours} hrs @ ${multiplier}x (KES ${effectiveRate}/hr) = KES ${amount.toLocaleString()}`
      );
    }

    return {
      totalOvertimeHours: totalHours,
      totalOvertimePay: totalPay,
      hourlyRate,
      hourlyDivisor: divisor,
      isEligible: true,
      entries,
      trace: {
        hourlyDivisorUsed: divisor,
        baseHourlyRate: hourlyRate,
        totalApprovedHours: totalHours,
        totalApprovedPay: totalPay,
        calculationDetails: details,
      },
    };
  }
}
