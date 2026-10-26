// CorpSec HR Payroll — Precision Decimal Math & Rounding Utilities
// Avoids JavaScript floating point errors in financial calculations

export type RoundingMethod = 'ROUND_NEAREST_1' | 'ROUND_UP' | 'ROUND_DOWN' | 'NO_ROUNDING';

export class DecimalMath {
  /**
   * Convert monetary amount to integer cents (e.g. 2400.50 -> 240050)
   */
  static toCents(amount: number): number {
    if (isNaN(amount) || amount === null || amount === undefined) return 0;
    return Math.round((Number(amount) + Number.EPSILON) * 100);
  }

  /**
   * Convert integer cents back to monetary amount with 2 decimal places
   */
  static fromCents(cents: number): number {
    if (isNaN(cents) || cents === null || cents === undefined) return 0;
    return Math.round(cents) / 100;
  }

  /**
   * Sum multiple monetary amounts with cent-level integer precision
   */
  static sum(...amounts: (number | null | undefined)[]): number {
    const totalCents = amounts.reduce<number>((acc, curr) => {
      if (curr === null || curr === undefined || isNaN(curr)) return acc;
      return acc + DecimalMath.toCents(curr);
    }, 0);
    return DecimalMath.fromCents(totalCents);
  }

  /**
   * Subtract b from a (a - b) with cent-level integer precision
   */
  static sub(a: number, b: number): number {
    const aCents = DecimalMath.toCents(a);
    const bCents = DecimalMath.toCents(b);
    return DecimalMath.fromCents(aCents - bCents);
  }

  /**
   * Multiply monetary amount by a rate/factor with 2-decimal cent precision
   */
  static mul(amount: number, factor: number): number {
    if (isNaN(amount) || isNaN(factor)) return 0;
    const result = amount * factor;
    return DecimalMath.fromCents(Math.round((result + Number.EPSILON) * 100));
  }

  /**
   * Divide monetary amount by a divisor with 2-decimal cent precision
   */
  static div(amount: number, divisor: number): number {
    if (isNaN(amount) || !divisor || isNaN(divisor)) return 0;
    const result = amount / divisor;
    return DecimalMath.fromCents(Math.round((result + Number.EPSILON) * 100));
  }

  /**
   * Apply configured company rounding policy
   */
  static round(val: number, method: RoundingMethod = 'ROUND_NEAREST_1'): number {
    if (isNaN(val) || val === null || val === undefined) return 0;
    switch (method) {
      case 'ROUND_NEAREST_1':
        return Math.round(val);
      case 'ROUND_UP':
        return Math.ceil(val);
      case 'ROUND_DOWN':
        return Math.floor(val);
      case 'NO_ROUNDING':
      default:
        return DecimalMath.fromCents(DecimalMath.toCents(val));
    }
  }

  /**
   * Format monetary amount for human display
   */
  static formatCurrency(amount: number, currency = 'KES', decimals = 2): string {
    const safeAmount = isNaN(amount) ? 0 : amount;
    return `${currency} ${safeAmount.toLocaleString('en-KE', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }
}
