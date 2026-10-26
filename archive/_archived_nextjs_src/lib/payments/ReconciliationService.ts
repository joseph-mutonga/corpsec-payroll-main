// CorpSec HR Payroll — Payment Reconciliation Engine
// Performs mathematical reconciliation between expected payroll net pay and actual disbursed transactions

import { PaymentDiscrepancyItem, PaymentReconciliationData, PaymentReconciliationStatus } from '@/types';

export interface ReconciliationInput {
  payrollPeriodId: string;
  payrollPeriodName: string;
  periodNumber: string;
  payrollRunId: string;
  runNumber: string;
  employeeRecords: Array<{
    id: string;
    employeeId: string;
    employeeNumber: string;
    fullName: string;
    departmentName?: string | null;
    stationName?: string | null;
    netPay: number;
    paymentMethod?: string | null;
    paymentStatus?: string | null;
    paymentReference?: string | null;
  }>;
  transactions: Array<{
    id: string;
    transactionNumber: string;
    employeeId: string;
    payrollRecordId: string;
    amount: number;
    status: string;
    paymentMethod: string;
    providerReference?: string | null;
    idempotencyKey: string;
  }>;
}

export class ReconciliationService {
  /**
   * Evaluates and reconciles payroll expected net pay against actual payment transactions
   */
  static reconcile(input: ReconciliationInput): {
    summary: {
      expectedAmount: number;
      actualPaidAmount: number;
      discrepancyAmount: number;
      totalExpectedEmployees: number;
      totalPaidEmployees: number;
      exceptionsCount: number;
      status: PaymentReconciliationStatus;
    };
    discrepancies: PaymentDiscrepancyItem[];
  } {
    let expectedAmount = 0;
    let actualPaidAmount = 0;
    let successfulPaidCount = 0;
    const discrepancies: PaymentDiscrepancyItem[] = [];

    // Group transactions by payrollRecordId
    const txByRecordId = new Map<string, typeof input.transactions>();
    for (const tx of input.transactions) {
      const existing = txByRecordId.get(tx.payrollRecordId) || [];
      existing.push(tx);
      txByRecordId.set(tx.payrollRecordId, existing);
    }

    for (const record of input.employeeRecords) {
      const expected = Math.round(Number(record.netPay || 0) * 100) / 100;
      expectedAmount += expected;

      const recordTxs = txByRecordId.get(record.id) || [];
      const successfulTxs = recordTxs.filter((t) => t.status === 'SUCCESS');
      const failedTxs = recordTxs.filter((t) => t.status === 'FAILED');

      const totalDisbursed = successfulTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const roundedDisbursed = Math.round(totalDisbursed * 100) / 100;

      if (successfulTxs.length > 0) {
        successfulPaidCount++;
        actualPaidAmount += roundedDisbursed;
      }

      const diff = Math.round((roundedDisbursed - expected) * 100) / 100;

      // Determine item discrepancy type
      let discrepancyType: PaymentDiscrepancyItem['discrepancyType'] = 'EXACT_MATCH';
      let notes = 'Payment verified and exactly matches expected net pay.';

      if (successfulTxs.length > 1) {
        discrepancyType = 'DUPLICATE_ATTEMPT';
        notes = `Alert: Multiple successful transactions (${successfulTxs.length}) found for this payroll record!`;
      } else if (successfulTxs.length === 0) {
        if (failedTxs.length > 0) {
          discrepancyType = 'FAILED_PAYMENT';
          notes = `Disbursement attempt failed: ${failedTxs[0].idempotencyKey}. Action required: retry payment.`;
        } else {
          discrepancyType = 'MISSING_PAYMENT';
          notes = 'No payment transaction has been executed for this payroll record.';
        }
      } else if (diff < -0.01) {
        discrepancyType = 'UNDERPAYMENT';
        notes = `Underpayment variance detected: KES ${Math.abs(diff).toFixed(2)} shortfall.`;
      } else if (diff > 0.01) {
        discrepancyType = 'OVERPAYMENT';
        notes = `Overpayment variance detected: KES ${diff.toFixed(2)} surplus.`;
      }

      discrepancies.push({
        employeeId: record.employeeId,
        employeeNumber: record.employeeNumber,
        fullName: record.fullName,
        department: record.departmentName || 'Guarding Operations',
        station: record.stationName || 'Nairobi Station',
        expectedNetPay: expected,
        actualPaidAmount: roundedDisbursed,
        difference: diff,
        paymentMethod: record.paymentMethod || 'BANK',
        paymentStatus: record.paymentStatus || (successfulTxs.length > 0 ? 'PAID' : 'PENDING'),
        providerReference: successfulTxs[0]?.providerReference || failedTxs[0]?.providerReference || null,
        discrepancyType,
        notes,
      });
    }

    expectedAmount = Math.round(expectedAmount * 100) / 100;
    actualPaidAmount = Math.round(actualPaidAmount * 100) / 100;
    const discrepancyAmount = Math.round((actualPaidAmount - expectedAmount) * 100) / 100;
    const exceptionsCount = discrepancies.filter((d) => d.discrepancyType !== 'EXACT_MATCH').length;

    let status: PaymentReconciliationStatus = 'NOT_RECONCILED';
    if (actualPaidAmount === 0 && exceptionsCount === input.employeeRecords.length) {
      status = 'NOT_RECONCILED';
    } else if (exceptionsCount === 0 && Math.abs(discrepancyAmount) < 0.01 && successfulPaidCount === input.employeeRecords.length) {
      status = 'RECONCILED';
    } else if (exceptionsCount > 0 && successfulPaidCount > 0) {
      status = 'EXCEPTIONS_FOUND';
    } else if (successfulPaidCount > 0) {
      status = 'IN_PROGRESS';
    }

    return {
      summary: {
        expectedAmount,
        actualPaidAmount,
        discrepancyAmount,
        totalExpectedEmployees: input.employeeRecords.length,
        totalPaidEmployees: successfulPaidCount,
        exceptionsCount,
        status,
      },
      discrepancies,
    };
  }
}
