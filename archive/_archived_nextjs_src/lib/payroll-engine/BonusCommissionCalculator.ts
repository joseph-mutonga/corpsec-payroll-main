// CorpSec HR Payroll — Bonus & Commission Calculator Engine
// Aggregates approved bonuses, commissions, arrears, and one-off additions

import { DecimalMath } from './DecimalMath';

export interface OtherEarningInput {
  id: string;
  title: string;
  earningType: string; // BONUS_ONE_OFF, COMMISSION_ONE_OFF, BACK_PAY, ARREARS, REIMBURSEMENT, SPECIAL_ALLOWANCE
  amount: number;
  isTaxable: boolean;
  approvalStatus: string;
  effectiveDate: Date | string;
  notes?: string | null;
}

export interface BonusCommissionCalculationResult {
  totalBonusPay: number;
  totalCommissionPay: number;
  totalOtherEarnings: number;
  taxableEarnings: number;
  nonTaxableEarnings: number;
  items: Array<{
    id: string;
    title: string;
    type: string;
    amount: number;
    isTaxable: boolean;
  }>;
  trace: {
    totalBonus: number;
    totalCommission: number;
    totalOther: number;
    breakdown: string[];
  };
}

export class BonusCommissionCalculator {
  /**
   * Evaluates approved other earnings for an employee in the payroll period.
   */
  static calculate(earnings: OtherEarningInput[] = []): BonusCommissionCalculationResult {
    let totalBonusPay = 0;
    let totalCommissionPay = 0;
    let totalOtherEarnings = 0;
    let taxableEarnings = 0;
    let nonTaxableEarnings = 0;

    const items: BonusCommissionCalculationResult['items'] = [];
    const breakdown: string[] = [];

    const approvedEarnings = (earnings || []).filter((e) => e.approvalStatus === 'APPROVED' && e.amount > 0);

    for (const earn of approvedEarnings) {
      const amount = earn.amount;

      if (earn.earningType.includes('BONUS')) {
        totalBonusPay = DecimalMath.sum(totalBonusPay, amount);
      } else if (earn.earningType.includes('COMMISSION')) {
        totalCommissionPay = DecimalMath.sum(totalCommissionPay, amount);
      } else {
        totalOtherEarnings = DecimalMath.sum(totalOtherEarnings, amount);
      }

      if (earn.isTaxable) {
        taxableEarnings = DecimalMath.sum(taxableEarnings, amount);
      } else {
        nonTaxableEarnings = DecimalMath.sum(nonTaxableEarnings, amount);
      }

      items.push({
        id: earn.id,
        title: earn.title,
        type: earn.earningType,
        amount,
        isTaxable: earn.isTaxable,
      });

      breakdown.push(
        `${earn.title} (${earn.earningType}): KES ${amount.toLocaleString()} (Taxable: ${earn.isTaxable ? 'Yes' : 'No'})`
      );
    }

    return {
      totalBonusPay,
      totalCommissionPay,
      totalOtherEarnings,
      taxableEarnings,
      nonTaxableEarnings,
      items,
      trace: {
        totalBonus: totalBonusPay,
        totalCommission: totalCommissionPay,
        totalOther: totalOtherEarnings,
        breakdown,
      },
    };
  }
}
