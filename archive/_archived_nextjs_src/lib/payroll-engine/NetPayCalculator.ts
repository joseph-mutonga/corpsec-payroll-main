// CorpSec HR Payroll — Net Pay Calculator Engine
// Evaluates net payable salary and enforces deduction ceilings & rounding policies

import { DecimalMath, RoundingMethod } from './DecimalMath';

export interface NetPayInput {
  grossPay: number;
  totalStatutoryDeductions: number;
  totalOtherDeductions: number;
  allowNegativeNetPay?: boolean;
  roundingMethod?: RoundingMethod;
}

export interface NetPayCalculationResult {
  totalDeductions: number;
  rawNetPay: number;
  netPay: number;
  isNegative: boolean;
  roundingAdjustment: number;
  trace: {
    grossPay: number;
    statutoryDeductions: number;
    otherDeductions: number;
    totalDeductions: number;
    unroundedNet: number;
    roundedNet: number;
    roundingPolicy: string;
  };
}

export class NetPayCalculator {
  /**
   * Computes final net pay after statutory and voluntary deductions.
   */
  static calculate(input: NetPayInput): NetPayCalculationResult {
    const totalDeductions = DecimalMath.sum(
      input.totalStatutoryDeductions,
      input.totalOtherDeductions
    );

    const rawNetPay = DecimalMath.sub(input.grossPay, totalDeductions);
    const roundingMethod = input.roundingMethod || 'ROUND_NEAREST_1';
    const roundedNetPay = DecimalMath.round(rawNetPay, roundingMethod);
    const roundingAdjustment = DecimalMath.sub(roundedNetPay, rawNetPay);
    const isNegative = rawNetPay < 0;

    return {
      totalDeductions,
      rawNetPay,
      netPay: roundedNetPay,
      isNegative,
      roundingAdjustment,
      trace: {
        grossPay: input.grossPay,
        statutoryDeductions: input.totalStatutoryDeductions,
        otherDeductions: input.totalOtherDeductions,
        totalDeductions,
        unroundedNet: rawNetPay,
        roundedNet: roundedNetPay,
        roundingPolicy: roundingMethod,
      },
    };
  }
}
