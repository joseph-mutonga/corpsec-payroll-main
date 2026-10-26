// CorpSec HR Payroll — Allowance Calculator Engine
// Computes active fixed & percentage allowances with taxability & pensionability segregation

import { DecimalMath } from './DecimalMath';

export interface EmployeeAllowanceInput {
  id: string;
  allowanceTypeId: string;
  amount: number;
  calculationMethod: string; // FIXED_AMOUNT, PERCENTAGE_OF_BASIC, PERCENTAGE_OF_GROSS
  percentageValue?: number | null;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
  status: string;
  allowanceType: {
    code: string;
    name: string;
    isTaxable: boolean;
    isPensionable: boolean;
  };
}

export interface PayrollPeriodInput {
  startDate: Date | string;
  endDate: Date | string;
}

export interface AllowanceCalculationResult {
  totalAllowances: number;
  taxableAllowances: number;
  nonTaxableAllowances: number;
  pensionableAllowances: number;
  items: Array<{
    id: string;
    code: string;
    name: string;
    method: string;
    amount: number;
    isTaxable: boolean;
    isPensionable: boolean;
    isProrated: boolean;
  }>;
  trace: {
    totalItems: number;
    totalAmount: number;
    taxableTotal: number;
    pensionableTotal: number;
    breakdown: string[];
  };
}

export class AllowanceCalculator {
  /**
   * Calculates allowances for an employee for the given payroll period.
   */
  static calculate(
    allowanceAssignments: EmployeeAllowanceInput[],
    basicSalary: number,
    period: PayrollPeriodInput,
    prorationBaseDays = 30
  ): AllowanceCalculationResult {
    const periodStart = new Date(period.startDate);
    const periodEnd = new Date(period.endDate);
    periodStart.setUTCHours(0, 0, 0, 0);
    periodEnd.setUTCHours(23, 59, 59, 999);

    const msPerDay = 1000 * 60 * 60 * 24;
    const totalPeriodDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / msPerDay) + 1;
    const divisorDays = prorationBaseDays > 0 ? prorationBaseDays : totalPeriodDays;

    let totalAllowances = 0;
    let taxableAllowances = 0;
    let nonTaxableAllowances = 0;
    let pensionableAllowances = 0;
    const items: AllowanceCalculationResult['items'] = [];
    const breakdown: string[] = [];

    // Filter active allowances that intersect with the period
    const activeAssignments = (allowanceAssignments || []).filter((a) => {
      if (a.status !== 'ACTIVE') return false;
      const from = new Date(a.effectiveFrom);
      from.setUTCHours(0, 0, 0, 0);
      const to = a.effectiveTo ? new Date(a.effectiveTo) : null;
      if (to) to.setUTCHours(23, 59, 59, 999);

      const startsBeforeOrDuring = from <= periodEnd;
      const endsAfterOrDuring = !to || to >= periodStart;
      return startsBeforeOrDuring && endsAfterOrDuring;
    });

    for (const item of activeAssignments) {
      let rawAmount = item.amount || 0;
      let methodDesc = 'Fixed Amount';

      if (item.calculationMethod === 'PERCENTAGE_OF_BASIC' && item.percentageValue) {
        rawAmount = DecimalMath.mul(basicSalary, item.percentageValue / 100);
        methodDesc = `${item.percentageValue}% of Basic (KES ${basicSalary.toLocaleString()})`;
      }

      // Check if proration is required
      const itemFrom = new Date(item.effectiveFrom);
      itemFrom.setUTCHours(0, 0, 0, 0);
      const itemTo = item.effectiveTo ? new Date(item.effectiveTo) : null;
      if (itemTo) itemTo.setUTCHours(23, 59, 59, 999);

      const sliceStart = itemFrom > periodStart ? itemFrom : periodStart;
      const sliceEnd = itemTo && itemTo < periodEnd ? itemTo : periodEnd;
      const activeDays = Math.max(0, Math.round((sliceEnd.getTime() - sliceStart.getTime()) / msPerDay) + 1);

      let finalAmount = rawAmount;
      let isProrated = false;

      if (activeDays < totalPeriodDays) {
        isProrated = true;
        const dailyRate = DecimalMath.div(rawAmount, divisorDays);
        finalAmount = DecimalMath.mul(dailyRate, activeDays);
        methodDesc += ` [Prorated: ${activeDays}/${totalPeriodDays} days]`;
      }

      totalAllowances = DecimalMath.sum(totalAllowances, finalAmount);

      if (item.allowanceType.isTaxable) {
        taxableAllowances = DecimalMath.sum(taxableAllowances, finalAmount);
      } else {
        nonTaxableAllowances = DecimalMath.sum(nonTaxableAllowances, finalAmount);
      }

      if (item.allowanceType.isPensionable) {
        pensionableAllowances = DecimalMath.sum(pensionableAllowances, finalAmount);
      }

      items.push({
        id: item.id,
        code: item.allowanceType.code,
        name: item.allowanceType.name,
        method: item.calculationMethod,
        amount: finalAmount,
        isTaxable: item.allowanceType.isTaxable,
        isPensionable: item.allowanceType.isPensionable,
        isProrated,
      });

      breakdown.push(
        `${item.allowanceType.name} (${item.allowanceType.code}): KES ${finalAmount.toLocaleString()} (${methodDesc}, Taxable: ${item.allowanceType.isTaxable ? 'Yes' : 'No'}, Pensionable: ${item.allowanceType.isPensionable ? 'Yes' : 'No'})`
      );
    }

    return {
      totalAllowances,
      taxableAllowances,
      nonTaxableAllowances,
      pensionableAllowances,
      items,
      trace: {
        totalItems: items.length,
        totalAmount: totalAllowances,
        taxableTotal: taxableAllowances,
        pensionableTotal: pensionableAllowances,
        breakdown,
      },
    };
  }
}
