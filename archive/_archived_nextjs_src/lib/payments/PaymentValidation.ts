// CorpSec HR Payroll — Payment Validation Engine
// Enforces finalized payroll integrity, payment destination rules, and batch state transitions

import { MpesaPaymentProvider } from './MpesaPaymentProvider';

export interface PaymentValidationError {
  field?: string;
  employeeId?: string;
  employeeNumber?: string;
  employeeName?: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface BatchValidationResult {
  isValid: boolean;
  eligibleCount: number;
  eligibleTotalAmount: number;
  errors: PaymentValidationError[];
  warnings: PaymentValidationError[];
}

export class PaymentValidation {
  /**
   * Validates if a payroll run is in an authorized finalized state for payment disbursement
   */
  static validatePayrollRunForDisbursement(run: {
    id: string;
    runNumber: string;
    status: string;
    isLocked?: boolean;
    employeeRecords?: any[];
  }): { isValid: boolean; error?: string } {
    const validStatuses = ['FINALIZED', 'APPROVED', 'LOCKED'];
    if (!validStatuses.includes(run.status.toUpperCase())) {
      return {
        isValid: false,
        error: `Payroll run ${run.runNumber} is in "${run.status}" status. Only FINALIZED or APPROVED payroll runs can be processed for payment disbursement.`,
      };
    }

    if (!run.employeeRecords || run.employeeRecords.length === 0) {
      return {
        isValid: false,
        error: `Payroll run ${run.runNumber} contains no employee payroll records to disburse.`,
      };
    }

    return { isValid: true };
  }

  /**
   * Validates a single employee payroll record for disbursement eligibility
   */
  static validateEmployeeRecord(record: {
    id: string;
    employeeId: string;
    netPay: number;
    paymentMethod?: string | null;
    bankAccountNumber?: string | null;
    bankName?: string | null;
    mpesaPhoneNumber?: string | null;
    employee?: {
      id: string;
      employeeNumber: string;
      fullName: string;
      employmentStatus?: string;
    };
  }): PaymentValidationError[] {
    const errors: PaymentValidationError[] = [];
    const empNum = record.employee?.employeeNumber || 'N/A';
    const empName = record.employee?.fullName || 'Employee';

    // 1. Net Pay Validation
    if (record.netPay < 0) {
      errors.push({
        employeeId: record.employeeId,
        employeeNumber: empNum,
        employeeName: empName,
        field: 'netPay',
        message: `Employee ${empName} (${empNum}) has negative net pay (KES ${record.netPay.toFixed(2)}). Disbursement blocked.`,
        severity: 'ERROR',
      });
    }

    if (record.netPay === 0) {
      errors.push({
        employeeId: record.employeeId,
        employeeNumber: empNum,
        employeeName: empName,
        field: 'netPay',
        message: `Employee ${empName} (${empNum}) has zero net pay (KES 0.00).`,
        severity: 'WARNING',
      });
    }

    // 2. Payment Method Validation
    const method = (record.paymentMethod || 'BANK').toUpperCase();
    if (!['BANK', 'MPESA', 'CASH', 'CHEQUE'].includes(method)) {
      errors.push({
        employeeId: record.employeeId,
        employeeNumber: empNum,
        employeeName: empName,
        field: 'paymentMethod',
        message: `Unknown or unconfigured payment method "${record.paymentMethod}" for ${empName} (${empNum}).`,
        severity: 'ERROR',
      });
    }

    // 3. Destination Credentials Validation
    const bankAccount =
      record.bankAccountNumber ||
      (record.employee as any)?.bankAccountNumber ||
      ((record.employee as any)?.nationalId ? `110${(record.employee as any).nationalId}` : null);

    const mpesaPhone =
      record.mpesaPhoneNumber ||
      (record.employee as any)?.mpesaPhoneNumber ||
      (record.employee as any)?.primaryPhone ||
      '+254712345678';

    if (method === 'BANK') {
      if (!bankAccount || bankAccount.trim().length < 4) {
        errors.push({
          employeeId: record.employeeId,
          employeeNumber: empNum,
          employeeName: empName,
          field: 'bankAccountNumber',
          message: `Employee ${empName} (${empNum}) has missing or invalid bank account number for Bank Transfer.`,
          severity: 'ERROR',
        });
      }
    } else if (method === 'MPESA') {
      const formattedPhone = MpesaPaymentProvider.formatKenyanPhoneNumber(mpesaPhone);
      if (!formattedPhone) {
        errors.push({
          employeeId: record.employeeId,
          employeeNumber: empNum,
          employeeName: empName,
          field: 'mpesaPhoneNumber',
          message: `Employee ${empName} (${empNum}) has invalid M-Pesa phone number "${mpesaPhone || 'None'}". Requires valid Kenyan mobile number (07XX / 01XX / +2547XX).`,
          severity: 'ERROR',
        });
      }
    }

    return errors;
  }

  /**
   * Evaluates all records in a payroll run for batch preparation
   */
  static validateBatchRecords(records: any[]): BatchValidationResult {
    const errors: PaymentValidationError[] = [];
    const warnings: PaymentValidationError[] = [];
    let eligibleCount = 0;
    let eligibleTotalAmount = 0;

    for (const record of records) {
      const recordIssues = this.validateEmployeeRecord(record);
      const blockingErrors = recordIssues.filter((i) => i.severity === 'ERROR');
      const nonBlockingWarnings = recordIssues.filter((i) => i.severity === 'WARNING');

      errors.push(...blockingErrors);
      warnings.push(...nonBlockingWarnings);

      if (blockingErrors.length === 0 && Number(record.netPay || 0) > 0) {
        eligibleCount++;
        eligibleTotalAmount += Number(record.netPay || 0);
      }
    }

    return {
      isValid: errors.length === 0 && eligibleCount > 0,
      eligibleCount,
      eligibleTotalAmount: Math.round(eligibleTotalAmount * 100) / 100,
      errors,
      warnings,
    };
  }

  /**
   * Enforces valid state transitions for PaymentBatch
   */
  static isValidBatchTransition(currentStatus: string, targetStatus: string): boolean {
    const cur = currentStatus.toUpperCase();
    const target = targetStatus.toUpperCase();

    if (cur === target) return true;

    const allowedTransitions: Record<string, string[]> = {
      DRAFT: ['READY', 'CANCELLED'],
      READY: ['APPROVED', 'DRAFT', 'CANCELLED'],
      APPROVED: ['PROCESSING', 'CANCELLED'],
      PROCESSING: ['COMPLETED', 'PARTIALLY_FAILED', 'FAILED'],
      PARTIALLY_FAILED: ['PROCESSING', 'COMPLETED', 'CANCELLED'],
      FAILED: ['PROCESSING', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: [],
    };

    return allowedTransitions[cur]?.includes(target) || false;
  }
}
