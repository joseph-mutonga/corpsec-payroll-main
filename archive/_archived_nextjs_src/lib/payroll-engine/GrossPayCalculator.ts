// CorpSec HR Payroll — Gross Pay Calculator Engine
// Aggregates all earnings components into total gross pay and taxable gross

import { DecimalMath } from './DecimalMath';

export interface GrossPayInput {
  proratedBasicPay: number;
  totalAllowances: number;
  taxableAllowances: number;
  pensionableAllowances: number;
  totalOvertimePay: number;
  totalBonusPay: number;
  totalCommissionPay: number;
  totalOtherEarnings: number;
  taxableOtherEarnings: number;
}

export interface GrossPayCalculationResult {
  grossPay: number;
  taxableGross: number;
  pensionableEarnings: number;
  trace: {
    components: {
      basicPay: number;
      allowances: number;
      overtime: number;
      bonuses: number;
      commissions: number;
      otherEarnings: number;
    };
    grossTotal: number;
    taxableTotal: number;
    pensionableTotal: number;
    summary: string;
  };
}

export class GrossPayCalculator {
  /**
   * Computes the total gross earnings, taxable gross, and pensionable base.
   */
  static calculate(input: GrossPayInput): GrossPayCalculationResult {
    const grossPay = DecimalMath.sum(
      input.proratedBasicPay,
      input.totalAllowances,
      input.totalOvertimePay,
      input.totalBonusPay,
      input.totalCommissionPay,
      input.totalOtherEarnings
    );

    const taxableGross = DecimalMath.sum(
      input.proratedBasicPay,
      input.taxableAllowances,
      input.totalOvertimePay, // Overtime is taxable in Kenya
      input.taxableOtherEarnings,
      input.totalBonusPay,
      input.totalCommissionPay
    );

    const pensionableEarnings = DecimalMath.sum(
      input.proratedBasicPay,
      input.pensionableAllowances
    );

    return {
      grossPay,
      taxableGross,
      pensionableEarnings,
      trace: {
        components: {
          basicPay: input.proratedBasicPay,
          allowances: input.totalAllowances,
          overtime: input.totalOvertimePay,
          bonuses: input.totalBonusPay,
          commissions: input.totalCommissionPay,
          otherEarnings: input.totalOtherEarnings,
        },
        grossTotal: grossPay,
        taxableTotal: taxableGross,
        pensionableTotal: pensionableEarnings,
        summary: `Gross Pay = KES ${grossPay.toLocaleString()} (Basic: ${input.proratedBasicPay.toLocaleString()} + Allowances: ${input.totalAllowances.toLocaleString()} + Overtime: ${input.totalOvertimePay.toLocaleString()} + Bonuses/Other: ${(input.totalBonusPay + input.totalCommissionPay + input.totalOtherEarnings).toLocaleString()})`,
      },
    };
  }
}
