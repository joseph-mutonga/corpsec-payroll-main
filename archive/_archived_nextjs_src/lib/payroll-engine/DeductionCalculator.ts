// CorpSec HR Payroll — Voluntary & Non-Statutory Deduction Calculator Engine
// Handles welfare, SACCOs, HELB, and balance-based diminishing loan/advance recoveries

import { DecimalMath } from './DecimalMath';

export interface EmployeeDeductionInput {
  id: string;
  deductionTypeId: string;
  amount: number;
  calculationMethod: string; // FIXED_AMOUNT, PERCENTAGE_OF_BASIC, BALANCE_BASED
  percentageValue?: number | null;
  totalTargetAmount?: number | null;
  currentBalance?: number | null;
  monthlyInstallment?: number | null;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
  status: string;
  deductionType: {
    code: string;
    name: string;
    isStatutory: boolean;
  };
}

export interface OtherDeductionInput {
  id: string;
  title: string;
  deductionType: string;
  amount: number;
  approvalStatus: string;
}

export interface DeductionCalculationResult {
  totalOtherDeductions: number;
  items: Array<{
    id: string;
    code: string;
    name: string;
    method: string;
    amount: number;
    originalBalance?: number | null;
    newBalance?: number | null;
    isFullyRecovered?: boolean;
  }>;
  balanceUpdates: Array<{
    assignmentId: string;
    deductedAmount: number;
    newBalance: number;
    isFinished: boolean;
  }>;
  trace: {
    totalItems: number;
    totalDeducted: number;
    breakdown: string[];
  };
}

export class DeductionCalculator {
  /**
   * Evaluates all non-statutory employee deductions for the payroll period.
   */
  static calculate(
    deductionAssignments: EmployeeDeductionInput[] = [],
    otherDeductions: OtherDeductionInput[] = [],
    basicSalary: number
  ): DeductionCalculationResult {
    let totalOtherDeductions = 0;
    const items: DeductionCalculationResult['items'] = [];
    const balanceUpdates: DeductionCalculationResult['balanceUpdates'] = [];
    const breakdown: string[] = [];

    // Filter active regular deductions
    const activeAssignments = (deductionAssignments || []).filter(
      (d) => d.status === 'ACTIVE' && (!d.deductionType || !d.deductionType.isStatutory)
    );

    for (const d of activeAssignments) {
      let finalAmount = 0;
      let newBalance: number | null = null;
      let isFullyRecovered = false;
      let desc = '';

      if (d.calculationMethod === 'BALANCE_BASED') {
        const currentBal = d.currentBalance ?? 0;
        const installment = d.monthlyInstallment ?? d.amount ?? 0;

        if (currentBal <= 0) {
          // Finished loan
          continue;
        }

        finalAmount = Math.min(currentBal, installment);
        newBalance = DecimalMath.sub(currentBal, finalAmount);
        isFullyRecovered = newBalance <= 0;

        balanceUpdates.push({
          assignmentId: d.id,
          deductedAmount: finalAmount,
          newBalance,
          isFinished: isFullyRecovered,
        });

        desc = `Balance-based (Remaining: KES ${currentBal.toLocaleString()} -> New Bal: KES ${newBalance.toLocaleString()})`;
      } else if (d.calculationMethod === 'PERCENTAGE_OF_BASIC' && d.percentageValue) {
        finalAmount = DecimalMath.mul(basicSalary, d.percentageValue / 100);
        desc = `${d.percentageValue}% of Basic (KES ${basicSalary.toLocaleString()})`;
      } else {
        finalAmount = d.amount || 0;
        desc = 'Fixed Amount';
      }

      totalOtherDeductions = DecimalMath.sum(totalOtherDeductions, finalAmount);

      items.push({
        id: d.id,
        code: d.deductionType?.code || 'DED',
        name: d.deductionType?.name || 'Deduction',
        method: d.calculationMethod,
        amount: finalAmount,
        originalBalance: d.currentBalance,
        newBalance,
        isFullyRecovered,
      });

      breakdown.push(
        `${d.deductionType?.name || 'Deduction'} (${d.deductionType?.code}): KES ${finalAmount.toLocaleString()} [${desc}]`
      );
    }

    // Process approved one-off deductions
    const approvedOneOffs = (otherDeductions || []).filter((o) => o.approvalStatus === 'APPROVED' && o.amount > 0);

    for (const o of approvedOneOffs) {
      totalOtherDeductions = DecimalMath.sum(totalOtherDeductions, o.amount);

      items.push({
        id: o.id,
        code: o.deductionType,
        name: o.title,
        method: 'ONE_OFF',
        amount: o.amount,
      });

      breakdown.push(`One-off: ${o.title} (${o.deductionType}): KES ${o.amount.toLocaleString()}`);
    }

    return {
      totalOtherDeductions,
      items,
      balanceUpdates,
      trace: {
        totalItems: items.length,
        totalDeducted: totalOtherDeductions,
        breakdown,
      },
    };
  }
}
