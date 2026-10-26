// CorpSec HR Payroll — Phase 6 Payroll Configuration & Readiness Validator
// Pure TypeScript engine to validate payroll periods, tax bands, and employee readiness before calculation.

export interface TaxBandInput {
  bandOrder: number;
  bandName: string;
  lowerThreshold: number;
  upperThreshold?: number | null;
  ratePercentage: number;
}

export interface PayrollPeriodInput {
  startDate: Date | string;
  endDate: Date | string;
  payrollMonth: number;
  payrollYear: number;
}

export interface EmployeeReadinessInput {
  id: string;
  fullName: string;
  employeeNumber: string;
  employmentStatus: string;
  kraPin?: string | null;
  nssfNumber?: string | null;
  shaNumber?: string | null;
  preferredPaymentMethod?: string | null;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  mpesaPhoneNumber?: string | null;
  activeSalary?: {
    basicSalary: number;
    status: string;
    effectiveFrom: Date | string;
  } | null;
}

export interface ReadinessCheckResult {
  isReady: boolean;
  totalChecked: number;
  readyCount: number;
  missingSalaryCount: number;
  missingPaymentDetailsCount: number;
  missingStatutoryDetailsCount: number;
  warnings: Array<{
    employeeId: string;
    employeeNumber: string;
    fullName: string;
    category: 'SALARY' | 'PAYMENT' | 'STATUTORY' | 'STATUS';
    severity: 'ERROR' | 'WARNING';
    message: string;
  }>;
}

/**
 * Validates progressive tax bands for monotonic order, non-overlapping ranges, and positive rates
 */
export function validateTaxBands(bands: TaxBandInput[]): { isValid: boolean; error?: string } {
  if (!bands || bands.length === 0) {
    return { isValid: false, error: 'At least one tax band is required.' };
  }

  // Sort by bandOrder ascending
  const sorted = [...bands].sort((a, b) => a.bandOrder - b.bandOrder);

  if (sorted[0].lowerThreshold !== 0) {
    return { isValid: false, error: `The lowest tax band (Band ${sorted[0].bandOrder}) must start at lowerThreshold 0.00.` };
  }

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];

    if (current.lowerThreshold < 0) {
      return { isValid: false, error: `Band ${current.bandOrder} lower threshold cannot be negative.` };
    }

    if (current.upperThreshold !== null && current.upperThreshold !== undefined) {
      if (current.upperThreshold <= current.lowerThreshold) {
        return {
          isValid: false,
          error: `Band ${current.bandOrder} upper threshold (${current.upperThreshold}) must be greater than lower threshold (${current.lowerThreshold}).`,
        };
      }
    } else {
      // If upper threshold is null, it must be the highest/last band
      if (i !== sorted.length - 1) {
        return {
          isValid: false,
          error: `Only the top tax band (Band ${sorted.length}) can have an unbounded upper threshold.`,
        };
      }
    }

    if (current.ratePercentage < 0 || current.ratePercentage > 100) {
      return {
        isValid: false,
        error: `Band ${current.bandOrder} rate percentage must be between 0% and 100%.`,
      };
    }

    // Check gap or overlap with previous band
    if (i > 0) {
      const prev = sorted[i - 1];
      if (prev.upperThreshold !== null && prev.upperThreshold !== undefined) {
        if (Math.abs(current.lowerThreshold - prev.upperThreshold) > 1.0) {
          return {
            isValid: false,
            error: `Gap or overlap detected between Band ${prev.bandOrder} (upper: ${prev.upperThreshold}) and Band ${current.bandOrder} (lower: ${current.lowerThreshold}).`,
          };
        }
      }
    }
  }

  return { isValid: true };
}

/**
 * Detects if a new payroll period overlaps with existing periods
 */
export function detectPeriodOverlap(
  existingPeriods: Array<{ id: string; startDate: Date | string; endDate: Date | string; status: string }>,
  newStart: Date | string,
  newEnd: Date | string,
  excludePeriodId?: string
): { hasOverlap: boolean; overlappingPeriodId?: string } {
  const start = new Date(newStart).getTime();
  const end = new Date(newEnd).getTime();

  if (end < start) {
    throw new Error('Payroll period end date cannot be earlier than start date.');
  }

  for (const p of existingPeriods) {
    if (excludePeriodId && p.id === excludePeriodId) continue;
    if (p.status === 'CLOSED' || p.status === 'DRAFT') continue; // Closed or draft periods don't block

    const pStart = new Date(p.startDate).getTime();
    const pEnd = new Date(p.endDate).getTime();

    // Check overlap: max(start, pStart) <= min(end, pEnd)
    if (Math.max(start, pStart) <= Math.min(end, pEnd)) {
      return { hasOverlap: true, overlappingPeriodId: p.id };
    }
  }

  return { hasOverlap: false };
}

/**
 * Scans active workforce and evaluates readiness for payroll calculation
 */
export function evaluatePayrollReadiness(employees: EmployeeReadinessInput[]): ReadinessCheckResult {
  const warnings: ReadinessCheckResult['warnings'] = [];
  let readyCount = 0;
  let missingSalaryCount = 0;
  let missingPaymentDetailsCount = 0;
  let missingStatutoryDetailsCount = 0;

  for (const emp of employees) {
    let empHasError = false;

    // 1. Check Active Salary Structure
    if (!emp.activeSalary || emp.activeSalary.basicSalary <= 0) {
      missingSalaryCount++;
      empHasError = true;
      warnings.push({
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        fullName: emp.fullName,
        category: 'SALARY',
        severity: 'ERROR',
        message: 'No active basic salary structure configured.',
      });
    }

    // 2. Check Payment Details (Bank Account or M-Pesa Phone)
    const hasBank = Boolean(emp.bankAccountNumber && emp.bankName);
    const hasMpesa = Boolean(emp.mpesaPhoneNumber);
    if (!hasBank && !hasMpesa) {
      missingPaymentDetailsCount++;
      empHasError = true;
      warnings.push({
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        fullName: emp.fullName,
        category: 'PAYMENT',
        severity: 'ERROR',
        message: 'Missing disbursement details (neither Bank Account nor M-Pesa phone registered).',
      });
    }

    // 3. Check Statutory Information (KRA PIN, NSSF, SHA)
    if (!emp.kraPin) {
      missingStatutoryDetailsCount++;
      empHasError = true;
      warnings.push({
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        fullName: emp.fullName,
        category: 'STATUTORY',
        severity: 'ERROR',
        message: 'Missing KRA PIN for statutory PAYE and tax deduction compliance.',
      });
    }

    if (!emp.nssfNumber) {
      warnings.push({
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        fullName: emp.fullName,
        category: 'STATUTORY',
        severity: 'WARNING',
        message: 'Missing NSSF number (defaulting to National ID reference for pension registration).',
      });
    }

    if (!emp.shaNumber) {
      warnings.push({
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        fullName: emp.fullName,
        category: 'STATUTORY',
        severity: 'WARNING',
        message: 'Missing SHA / NHIF number.',
      });
    }

    if (!empHasError) {
      readyCount++;
    }
  }

  const isReady = warnings.filter((w) => w.severity === 'ERROR').length === 0;

  return {
    isReady,
    totalChecked: employees.length,
    readyCount,
    missingSalaryCount,
    missingPaymentDetailsCount,
    missingStatutoryDetailsCount,
    warnings,
  };
}
