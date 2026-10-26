// CorpSec HR Payroll — Phase 6 Salary Effective Resolver
// Pure TypeScript engine to resolve active salaries, allowances, and deductions as of any target date.

export interface RawSalaryRecord {
  id: string;
  employeeId: string;
  basicSalary: number;
  payFrequency: string;
  currency: string;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
  status: string;
  isOvertimeEligible: boolean;
  changeReason?: string | null;
}

export interface RawAllowanceAssignment {
  id: string;
  employeeId: string;
  allowanceTypeId: string;
  amount: number;
  calculationMethod: string; // FIXED_AMOUNT, PERCENTAGE_OF_BASIC, PERCENTAGE_OF_GROSS, MANUAL
  percentageValue?: number | null;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
  isRecurring: boolean;
  status: string;
  allowanceType?: {
    id: string;
    code: string;
    name: string;
    isTaxable: boolean;
    isPensionable: boolean;
  };
}

export interface RawDeductionAssignment {
  id: string;
  employeeId: string;
  deductionTypeId: string;
  amount: number;
  calculationMethod: string; // FIXED_AMOUNT, PERCENTAGE_OF_BASIC, PERCENTAGE_OF_GROSS, BALANCE_BASED
  percentageValue?: number | null;
  totalTargetAmount?: number | null;
  currentBalance?: number | null;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
  isRecurring: boolean;
  status: string;
  deductionType?: {
    id: string;
    code: string;
    name: string;
    isStatutory: boolean;
  };
}

export interface ResolvedCompensation {
  targetDate: string;
  hasActiveSalary: boolean;
  salaryRecord: RawSalaryRecord | null;
  basicSalary: number;
  currency: string;
  payFrequency: string;
  isOvertimeEligible: boolean;
  activeAllowances: Array<{
    assignmentId: string;
    allowanceCode: string;
    allowanceName: string;
    calculationMethod: string;
    percentageValue?: number | null;
    computedAmount: number;
    isTaxable: boolean;
    isPensionable: boolean;
  }>;
  totalEstimatedAllowances: number;
  activeDeductions: Array<{
    assignmentId: string;
    deductionCode: string;
    deductionName: string;
    calculationMethod: string;
    percentageValue?: number | null;
    currentBalance?: number | null;
    computedAmount: number;
    isStatutory: boolean;
  }>;
  totalEstimatedDeductions: number;
}

/**
 * Checks if a given target date falls within an effective date range [effectiveFrom, effectiveTo]
 */
export function isDateWithinRange(
  targetDate: Date | string,
  effectiveFrom: Date | string,
  effectiveTo?: Date | string | null
): boolean {
  const target = new Date(targetDate).getTime();
  const start = new Date(effectiveFrom).getTime();
  const end = effectiveTo ? new Date(effectiveTo).getTime() : Number.POSITIVE_INFINITY;
  return target >= start && target <= end;
}

/**
 * Resolves the applicable salary record for an employee on a target date.
 * If multiple records exist, picks the most recent active/superseded record effective on that date.
 */
export function resolveEffectiveSalary(
  salaryRecords: RawSalaryRecord[],
  targetDate: Date | string = new Date()
): RawSalaryRecord | null {
  const target = new Date(targetDate).getTime();

  // Filter records that encompass targetDate and are not REJECTED or PENDING_APPROVAL
  const valid = salaryRecords.filter((rec) => {
    if (rec.status === 'REJECTED' || rec.status === 'PENDING_APPROVAL') return false;
    const start = new Date(rec.effectiveFrom).getTime();
    const end = rec.effectiveTo ? new Date(rec.effectiveTo).getTime() : Number.POSITIVE_INFINITY;
    return target >= start && target <= end;
  });

  if (valid.length === 0) return null;

  // Sort by effectiveFrom descending (newest effective first)
  valid.sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
  return valid[0];
}

/**
 * Computes individual allowance amount based on method & basic salary
 */
export function computeAllowanceValue(
  assignment: RawAllowanceAssignment,
  basicSalary: number
): number {
  if (assignment.calculationMethod === 'PERCENTAGE_OF_BASIC' && assignment.percentageValue) {
    return Math.round((basicSalary * assignment.percentageValue) / 100);
  }
  return assignment.amount || 0;
}

/**
 * Computes individual deduction amount based on method & basic salary
 */
export function computeDeductionValue(
  assignment: RawDeductionAssignment,
  basicSalary: number
): number {
  if (assignment.calculationMethod === 'PERCENTAGE_OF_BASIC' && assignment.percentageValue) {
    return Math.round((basicSalary * assignment.percentageValue) / 100);
  }
  if (assignment.calculationMethod === 'BALANCE_BASED') {
    // If balance is less than standard monthly instalment, deduct remaining balance
    if (assignment.currentBalance !== undefined && assignment.currentBalance !== null) {
      return Math.min(assignment.amount, Math.max(0, assignment.currentBalance));
    }
  }
  return assignment.amount || 0;
}

/**
 * Resolves complete compensation profile (Salary + Allowances + Deductions) for an employee on a target date
 */
export function resolveEmployeeCompensation(
  salaryRecords: RawSalaryRecord[],
  allowanceAssignments: RawAllowanceAssignment[],
  deductionAssignments: RawDeductionAssignment[],
  targetDate: Date | string = new Date()
): ResolvedCompensation {
  const targetStr = typeof targetDate === 'string' ? targetDate : targetDate.toISOString().slice(0, 10);
  const activeSalary = resolveEffectiveSalary(salaryRecords, targetDate);

  const basic = activeSalary ? activeSalary.basicSalary : 0;
  const currency = activeSalary ? activeSalary.currency : 'KES';
  const frequency = activeSalary ? activeSalary.payFrequency : 'MONTHLY';
  const otEligible = activeSalary ? activeSalary.isOvertimeEligible : false;

  // Resolve active allowances
  const activeAllowances = allowanceAssignments
    .filter((a) => a.status === 'ACTIVE' && isDateWithinRange(targetDate, a.effectiveFrom, a.effectiveTo))
    .map((a) => {
      const computed = computeAllowanceValue(a, basic);
      return {
        assignmentId: a.id,
        allowanceCode: a.allowanceType?.code || 'ALW-CUSTOM',
        allowanceName: a.allowanceType?.name || 'Allowance',
        calculationMethod: a.calculationMethod,
        percentageValue: a.percentageValue,
        computedAmount: computed,
        isTaxable: a.allowanceType?.isTaxable ?? true,
        isPensionable: a.allowanceType?.isPensionable ?? false,
      };
    });

  const totalAllowances = activeAllowances.reduce((acc, a) => acc + a.computedAmount, 0);

  // Resolve active deductions
  const activeDeductions = deductionAssignments
    .filter((d) => d.status === 'ACTIVE' && isDateWithinRange(targetDate, d.effectiveFrom, d.effectiveTo))
    .map((d) => {
      const computed = computeDeductionValue(d, basic);
      return {
        assignmentId: d.id,
        deductionCode: d.deductionType?.code || 'DED-CUSTOM',
        deductionName: d.deductionType?.name || 'Deduction',
        calculationMethod: d.calculationMethod,
        percentageValue: d.percentageValue,
        currentBalance: d.currentBalance,
        computedAmount: computed,
        isStatutory: d.deductionType?.isStatutory ?? false,
      };
    });

  const totalDeductions = activeDeductions.reduce((acc, d) => acc + d.computedAmount, 0);

  return {
    targetDate: targetStr,
    hasActiveSalary: activeSalary !== null,
    salaryRecord: activeSalary,
    basicSalary: basic,
    currency,
    payFrequency: frequency,
    isOvertimeEligible: otEligible,
    activeAllowances,
    totalEstimatedAllowances: totalAllowances,
    activeDeductions,
    totalEstimatedDeductions: totalDeductions,
  };
}

export const resolveActiveSalaryOnDate = resolveEffectiveSalary;

export function calculateResolvedAllowances(
  basicSalary: number,
  allowanceAssignments: RawAllowanceAssignment[],
  targetDate: Date | string = new Date()
) {
  return allowanceAssignments
    .filter((a) => a.status === 'ACTIVE' && isDateWithinRange(targetDate, a.effectiveFrom, a.effectiveTo))
    .map((a) => ({
      ...a,
      computedAmount: computeAllowanceValue(a, basicSalary),
    }));
}

export function calculateResolvedDeductions(
  basicSalary: number,
  deductionAssignments: RawDeductionAssignment[],
  targetDate: Date | string = new Date()
) {
  return deductionAssignments
    .filter((d) => d.status === 'ACTIVE' && isDateWithinRange(targetDate, d.effectiveFrom, d.effectiveTo))
    .map((d) => ({
      ...d,
      computedAmount: computeDeductionValue(d, basicSalary),
    }));
}

