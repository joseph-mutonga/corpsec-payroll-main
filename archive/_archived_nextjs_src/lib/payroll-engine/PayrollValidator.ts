// CorpSec HR Payroll — Payroll Validator & Exception Detector Engine
// Audits workforce readiness, missing statutory identifiers, and financial calculation integrity

export type ExceptionSeverity = 'WARNING' | 'ERROR' | 'CRITICAL';

export interface ExceptionItem {
  employeeId?: string;
  employeeRecordId?: string;
  exceptionType: string;
  severity: ExceptionSeverity;
  description: string;
}

export interface EmployeeValidationInput {
  id: string;
  employeeNumber: string;
  fullName: string;
  employmentStatus: string;
  kraPin?: string | null;
  nssfNumber?: string | null;
  shaNumber?: string | null;
  preferredPaymentMethod?: string | null;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  mpesaPhoneNumber?: string | null;
  salaryRecords?: Array<{ status: string; basicSalary: number }>;
  netPay?: number;
  unapprovedOvertimeCount?: number;
  unapprovedLeaveCount?: number;
}

export class PayrollValidator {
  /**
   * Validates an employee's data integrity before or during a payroll calculation run.
   */
  static validateEmployee(
    emp: EmployeeValidationInput,
    allowNegativeNetPay = false
  ): ExceptionItem[] {
    const exceptions: ExceptionItem[] = [];

    // 1. Employment Status Check
    if (emp.employmentStatus !== 'ACTIVE' && emp.employmentStatus !== 'ON_LEAVE') {
      exceptions.push({
        employeeId: emp.id,
        exceptionType: 'INACTIVE_EMPLOYMENT',
        severity: 'CRITICAL',
        description: `Employee ${emp.fullName} (${emp.employeeNumber}) is in ${emp.employmentStatus} status and should be excluded from active payroll.`,
      });
    }

    // 2. Active Salary Record Check
    const hasActiveSalary = (emp.salaryRecords || []).some(
      (s) => s.status === 'ACTIVE' && s.basicSalary > 0
    );
    if (!hasActiveSalary) {
      exceptions.push({
        employeeId: emp.id,
        exceptionType: 'MISSING_SALARY',
        severity: 'CRITICAL',
        description: `Employee ${emp.fullName} (${emp.employeeNumber}) has no approved active basic salary structure.`,
      });
    }

    // 3. Statutory KRA PIN Check
    if (!emp.kraPin || emp.kraPin.trim() === '') {
      exceptions.push({
        employeeId: emp.id,
        exceptionType: 'MISSING_KRA_PIN',
        severity: 'CRITICAL',
        description: `Employee ${emp.fullName} is missing mandatory Kenya Revenue Authority (KRA) PIN for PAYE compliance.`,
      });
    }

    // 4. Statutory NSSF / SHA Numbers
    if (!emp.nssfNumber || emp.nssfNumber.trim() === '') {
      exceptions.push({
        employeeId: emp.id,
        exceptionType: 'MISSING_STATUTORY_NSSF',
        severity: 'WARNING',
        description: `Employee ${emp.fullName} has no registered NSSF member number.`,
      });
    }

    if (!emp.shaNumber || emp.shaNumber.trim() === '') {
      exceptions.push({
        employeeId: emp.id,
        exceptionType: 'MISSING_STATUTORY_SHA',
        severity: 'WARNING',
        description: `Employee ${emp.fullName} has no registered Social Health Authority (SHA) member number.`,
      });
    }

    // 5. Payment Details Check
    if (emp.preferredPaymentMethod === 'BANK') {
      if (!emp.bankAccountNumber || !emp.bankName) {
        exceptions.push({
          employeeId: emp.id,
          exceptionType: 'MISSING_PAYMENT_DETAILS',
          severity: 'ERROR',
          description: `Employee ${emp.fullName} has selected BANK disbursement but has incomplete bank account details.`,
        });
      }
    } else if (emp.preferredPaymentMethod === 'MPESA') {
      if (!emp.mpesaPhoneNumber) {
        exceptions.push({
          employeeId: emp.id,
          exceptionType: 'MISSING_PAYMENT_DETAILS',
          severity: 'ERROR',
          description: `Employee ${emp.fullName} has selected M-PESA disbursement but has no mobile phone number registered.`,
        });
      }
    }

    // 6. Negative Net Pay Check
    if (emp.netPay !== undefined && emp.netPay < 0 && !allowNegativeNetPay) {
      exceptions.push({
        employeeId: emp.id,
        exceptionType: 'NEGATIVE_NET_PAY',
        severity: 'CRITICAL',
        description: `Employee ${emp.fullName} has a negative net pay (KES ${emp.netPay.toLocaleString()}) due to excessive deductions exceeding earnings.`,
      });
    }

    // 7. Unapproved Overtime
    if (emp.unapprovedOvertimeCount && emp.unapprovedOvertimeCount > 0) {
      exceptions.push({
        employeeId: emp.id,
        exceptionType: 'UNAPPROVED_OVERTIME',
        severity: 'WARNING',
        description: `Employee ${emp.fullName} has ${emp.unapprovedOvertimeCount} unapproved overtime records in this period that were excluded from calculation.`,
      });
    }

    // 8. Unapproved Leaves
    if (emp.unapprovedLeaveCount && emp.unapprovedLeaveCount > 0) {
      exceptions.push({
        employeeId: emp.id,
        exceptionType: 'UNAPPROVED_LEAVE',
        severity: 'WARNING',
        description: `Employee ${emp.fullName} has ${emp.unapprovedLeaveCount} pending/unapproved leave applications during this payroll cycle.`,
      });
    }

    return exceptions;
  }
}
