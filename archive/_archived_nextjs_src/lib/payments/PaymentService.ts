// CorpSec HR Payroll — Payment Orchestration & Processing Service
// Manages batch lifecycles, provider dispatch, strict idempotency protection, and audit ledgers

import { prisma } from '@/lib/prisma';
import { PaymentValidation } from './PaymentValidation';
import { MockPaymentProvider } from './MockPaymentProvider';
import { MpesaPaymentProvider } from './MpesaPaymentProvider';
import { BankPaymentProvider } from './BankPaymentProvider';
import { IPaymentProvider } from './PaymentProvider';

export class PaymentService {
  private static mockProvider = new MockPaymentProvider();
  private static mpesaProvider = new MpesaPaymentProvider();
  private static bankProvider = new BankPaymentProvider();

  /**
   * Resolves the appropriate payment provider for a payment method
   */
  static getProvider(method: string): IPaymentProvider {
    const norm = (method || '').toUpperCase();
    if (norm === 'MPESA' || norm === 'MOBILE_MONEY') {
      return this.mpesaProvider;
    }
    if (norm === 'BANK' || norm === 'EFT') {
      return this.bankProvider;
    }
    return this.mockProvider;
  }

  /**
   * Sets mock provider failure simulation for testing
   */
  static setMockFailure(idempotencyKeyOrEmpNumber: string, shouldFail = true) {
    this.mockProvider.setSimulateFailure(idempotencyKeyOrEmpNumber, shouldFail);
  }

  /**
   * Generates a unique batch number e.g. PB-202608-001
   */
  private static async generateBatchNumber(payrollPeriodId: string): Promise<string> {
    const count = await prisma.paymentBatch.count();
    const period = await prisma.payrollPeriod.findUnique({
      where: { id: payrollPeriodId },
      select: { payrollYear: true, payrollMonth: true },
    });
    const yearMonth = period
      ? `${period.payrollYear}${String(period.payrollMonth).padStart(2, '0')}`
      : new Date().toISOString().slice(0, 7).replace('-', '');
    return `PB-${yearMonth}-${String(count + 1).padStart(3, '0')}`;
  }

  /**
   * Generates a unique transaction number e.g. TRX-202608-0001
   */
  private static async generateTransactionNumber(): Promise<string> {
    const count = await prisma.paymentTransaction.count();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `TRX-${dateStr}-${String(count + 1).padStart(4, '0')}`;
  }

  /**
   * Creates a new PaymentBatch from a finalized PayrollRun
   */
  static async createBatch(params: {
    payrollRunId: string;
    name?: string;
    paymentMethod?: string;
    notes?: string;
    userId: string;
    userEmail: string;
  }) {
    const run = await prisma.payrollRun.findUnique({
      where: { id: params.payrollRunId },
      include: {
        payrollPeriod: true,
        employeeRecords: {
          include: {
            employee: true,
          },
        },
      },
    });

    if (!run) {
      throw new Error(`Payroll run with ID ${params.payrollRunId} not found.`);
    }

    // Validate finalized status
    const runCheck = PaymentValidation.validatePayrollRunForDisbursement(run);
    if (!runCheck.isValid) {
      throw new Error(runCheck.error);
    }

    // Check if active batch already exists
    const existingActiveBatch = await prisma.paymentBatch.findFirst({
      where: {
        payrollRunId: run.id,
        status: { in: ['DRAFT', 'READY', 'APPROVED', 'PROCESSING', 'COMPLETED'] },
      },
    });

    if (existingActiveBatch) {
      throw new Error(
        `An active payment batch (${existingActiveBatch.batchNumber} - ${existingActiveBatch.status}) already exists for payroll run ${run.runNumber}. Duplicate batch creation is prevented.`
      );
    }

    // Validate employee records
    const validation = PaymentValidation.validateBatchRecords(run.employeeRecords);
    if (!validation.isValid) {
      const errorSummaries = validation.errors.map((e) => e.message).join(' | ');
      throw new Error(`Batch validation failed: ${errorSummaries}`);
    }

    const batchNumber = await this.generateBatchNumber(run.payrollPeriodId);
    const batchName =
      params.name ||
      `${run.payrollPeriod.name} — General Net Salary Disbursement Batch (${batchNumber})`;

    const batch = await prisma.paymentBatch.create({
      data: {
        batchNumber,
        name: batchName,
        payrollPeriodId: run.payrollPeriodId,
        payrollRunId: run.id,
        paymentMethod: params.paymentMethod || 'MIXED',
        totalEmployees: validation.eligibleCount,
        totalAmount: validation.eligibleTotalAmount,
        status: 'DRAFT',
        createdById: params.userId,
        notes: params.notes,
      },
      include: {
        payrollPeriod: true,
        payrollRun: true,
        createdBy: true,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        userEmail: params.userEmail,
        action: 'PAYMENT_BATCH_CREATED',
        module: 'PAYROLL',
        entityType: 'PaymentBatch',
        entityId: batch.id,
        newValue: JSON.stringify({
          batchNumber: batch.batchNumber,
          runNumber: run.runNumber,
          totalEmployees: batch.totalEmployees,
          totalAmount: batch.totalAmount,
        }),
      },
    });

    return batch;
  }

  /**
   * Submits a DRAFT batch to READY status for pre-approval review
   */
  static async submitBatch(batchId: string, userId: string, userEmail: string) {
    const batch = await prisma.paymentBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) throw new Error('Payment batch not found.');

    if (!PaymentValidation.isValidBatchTransition(batch.status, 'READY')) {
      throw new Error(`Cannot transition payment batch from "${batch.status}" to "READY".`);
    }

    const updated = await prisma.paymentBatch.update({
      where: { id: batchId },
      data: { status: 'READY' },
      include: { payrollPeriod: true, payrollRun: true },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        userEmail,
        action: 'PAYMENT_BATCH_SUBMITTED',
        module: 'PAYROLL',
        entityType: 'PaymentBatch',
        entityId: batch.id,
        newValue: JSON.stringify({ batchNumber: batch.batchNumber, status: 'READY' }),
      },
    });

    return updated;
  }

  /**
   * Approves a READY batch for execution
   */
  static async approveBatch(batchId: string, userId: string, userEmail: string) {
    const batch = await prisma.paymentBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) throw new Error('Payment batch not found.');

    if (!PaymentValidation.isValidBatchTransition(batch.status, 'APPROVED')) {
      throw new Error(`Cannot transition payment batch from "${batch.status}" to "APPROVED".`);
    }

    const updated = await prisma.paymentBatch.update({
      where: { id: batchId },
      data: {
        status: 'APPROVED',
        approvedById: userId,
        approvedAt: new Date(),
      },
      include: { payrollPeriod: true, payrollRun: true, approvedBy: true },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        userEmail,
        action: 'PAYMENT_BATCH_APPROVED',
        module: 'PAYROLL',
        entityType: 'PaymentBatch',
        entityId: batch.id,
        newValue: JSON.stringify({
          batchNumber: batch.batchNumber,
          approvedAt: new Date().toISOString(),
        }),
      },
    });

    return updated;
  }

  /**
   * Cancels an un-processed batch
   */
  static async cancelBatch(batchId: string, reason: string, userId: string, userEmail: string) {
    const batch = await prisma.paymentBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) throw new Error('Payment batch not found.');

    if (!PaymentValidation.isValidBatchTransition(batch.status, 'CANCELLED')) {
      throw new Error(`Cannot cancel payment batch in "${batch.status}" status.`);
    }

    const updated = await prisma.paymentBatch.update({
      where: { id: batchId },
      data: {
        status: 'CANCELLED',
        rejectionReason: reason,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        userEmail,
        action: 'PAYMENT_BATCH_CANCELLED',
        module: 'PAYROLL',
        entityType: 'PaymentBatch',
        entityId: batch.id,
        newValue: JSON.stringify({ batchNumber: batch.batchNumber, reason }),
      },
    });

    return updated;
  }

  /**
   * Executes disbursement for an APPROVED payment batch
   */
  static async processBatch(batchId: string, userId: string, userEmail: string) {
    const batch = await prisma.paymentBatch.findUnique({
      where: { id: batchId },
      include: {
        payrollPeriod: true,
        payrollRun: {
          include: {
            employeeRecords: {
              where: { status: 'CALCULATED' },
              include: { employee: true },
            },
          },
        },
      },
    });

    if (!batch) throw new Error('Payment batch not found.');

    if (!PaymentValidation.isValidBatchTransition(batch.status, 'PROCESSING')) {
      throw new Error(`Cannot process payment batch in "${batch.status}" status. Batch must be APPROVED.`);
    }

    // 1. Lock batch and transition to PROCESSING
    await prisma.paymentBatch.update({
      where: { id: batch.id },
      data: {
        status: 'PROCESSING',
        processedById: userId,
        processedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        userEmail,
        action: 'PAYMENT_PROCESSING_STARTED',
        module: 'PAYROLL',
        entityType: 'PaymentBatch',
        entityId: batch.id,
        newValue: JSON.stringify({ batchNumber: batch.batchNumber }),
      },
    });

    let successfulCount = 0;
    let successfulAmount = 0;
    let failedCount = 0;
    let failedAmount = 0;

    const records = batch.payrollRun.employeeRecords;

    for (const record of records) {
      const netPay = Math.round(Number(record.netPay || 0) * 100) / 100;
      if (netPay <= 0) continue;

      const idempotencyKey = `BATCH_${batch.id}_REC_${record.id}_EMP_${record.employeeId}`;
      const paymentMethod = record.paymentMethod || 'BANK';

      // Check if transaction already exists with this idempotency key
      const existingTx = await prisma.paymentTransaction.findUnique({
        where: { idempotencyKey },
      });

      if (existingTx && existingTx.status === 'SUCCESS') {
        successfulCount++;
        successfulAmount += existingTx.amount;
        continue;
      }

      const txNumber = existingTx ? existingTx.transactionNumber : await this.generateTransactionNumber();
      const internalRef = `PAY-${batch.batchNumber}-${record.employee.employeeNumber}`;

      const accountNumber =
        record.bankAccountNumber ||
        record.employee.bankAccountNumber ||
        (record.employee.nationalId ? `110${record.employee.nationalId}` : null);
      const bankName = record.bankName || record.employee.bankName || 'KCB Bank Kenya';
      const phoneNumber =
        record.mpesaPhoneNumber ||
        record.employee.mpesaPhoneNumber ||
        record.employee.primaryPhone ||
        '+254712345678';

      // Select provider and execute
      const provider = this.getProvider(paymentMethod);
      const result = await provider.processPayment({
        transactionId: existingTx?.id || '',
        transactionNumber: txNumber,
        internalReference: internalRef,
        idempotencyKey,
        employeeId: record.employeeId,
        employeeNumber: record.employee.employeeNumber,
        employeeName: record.employee.fullName,
        paymentMethod,
        accountNumber,
        bankName,
        phoneNumber,
        amount: netPay,
        currency: 'KES',
        description: `Net Salary ${batch.payrollPeriod.name} (${record.employee.employeeNumber})`,
      });

      if (result.success && result.status === 'SUCCESS') {
        successfulCount++;
        successfulAmount += netPay;

        await prisma.paymentTransaction.upsert({
          where: { idempotencyKey },
          create: {
            transactionNumber: txNumber,
            paymentBatchId: batch.id,
            employeeId: record.employeeId,
            payrollRecordId: record.id,
            paymentMethod,
            accountNumber,
            bankName,
            phoneNumber,
            amount: netPay,
            status: 'SUCCESS',
            provider: result.provider,
            providerReference: result.providerReference,
            internalReference: internalRef,
            idempotencyKey,
            initiatedAt: new Date(),
            completedAt: result.timestamp,
          },
          update: {
            status: 'SUCCESS',
            provider: result.provider,
            providerReference: result.providerReference,
            completedAt: result.timestamp,
            failureCode: null,
            failureMessage: null,
          },
        });

        // Update PayrollEmployeeRecord
        await prisma.payrollEmployeeRecord.update({
          where: { id: record.id },
          data: {
            paymentStatus: 'PAID',
            paidAt: result.timestamp,
            paymentReference: result.providerReference,
            paymentNotes: `Paid via ${result.provider} (${result.providerReference}) on ${result.timestamp.toISOString()}`,
          },
        });
      } else {
        failedCount++;
        failedAmount += netPay;

        await prisma.paymentTransaction.upsert({
          where: { idempotencyKey },
          create: {
            transactionNumber: txNumber,
            paymentBatchId: batch.id,
            employeeId: record.employeeId,
            payrollRecordId: record.id,
            paymentMethod,
            accountNumber: record.bankAccountNumber,
            bankName: record.bankName,
            phoneNumber: record.mpesaPhoneNumber,
            amount: netPay,
            status: 'FAILED',
            provider: result.provider,
            providerReference: result.providerReference,
            internalReference: internalRef,
            idempotencyKey,
            failureCode: result.failureCode || 'PAYMENT_FAILED',
            failureMessage: result.failureMessage || 'Payment transaction rejected by gateway.',
            initiatedAt: new Date(),
          },
          update: {
            status: 'FAILED',
            failureCode: result.failureCode || 'PAYMENT_FAILED',
            failureMessage: result.failureMessage || 'Payment transaction rejected by gateway.',
          },
        });

        await prisma.payrollEmployeeRecord.update({
          where: { id: record.id },
          data: {
            paymentStatus: 'FAILED',
            paymentNotes: `Failed: ${result.failureMessage || 'Transaction rejected'}`,
          },
        });
      }
    }

    successfulAmount = Math.round(successfulAmount * 100) / 100;
    failedAmount = Math.round(failedAmount * 100) / 100;

    // Determine final batch status
    let finalStatus: 'COMPLETED' | 'PARTIALLY_FAILED' | 'FAILED' = 'COMPLETED';
    if (failedCount > 0 && successfulCount > 0) {
      finalStatus = 'PARTIALLY_FAILED';
    } else if (failedCount > 0 && successfulCount === 0) {
      finalStatus = 'FAILED';
    }

    const updatedBatch = await prisma.paymentBatch.update({
      where: { id: batch.id },
      data: {
        status: finalStatus,
        successfulCount,
        successfulAmount,
        failedCount,
        failedAmount,
      },
      include: {
        payrollPeriod: true,
        payrollRun: true,
        transactions: {
          include: { employee: true },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        userEmail,
        action: 'PAYMENT_BATCH_COMPLETED',
        module: 'PAYROLL',
        entityType: 'PaymentBatch',
        entityId: batch.id,
        newValue: JSON.stringify({
          batchNumber: batch.batchNumber,
          status: finalStatus,
          successfulCount,
          successfulAmount,
          failedCount,
          failedAmount,
        }),
      },
    });

    return updatedBatch;
  }

  /**
   * Retries an individual failed payment transaction
   */
  static async retryTransaction(transactionId: string, userId: string, userEmail: string) {
    const tx = await prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
      include: {
        employee: true,
        payrollRecord: true,
        paymentBatch: {
          include: { payrollPeriod: true },
        },
      },
    });

    if (!tx) throw new Error('Payment transaction not found.');

    if (tx.status === 'SUCCESS') {
      throw new Error('Transaction is already SUCCESS. Duplicate payment attempts are blocked.');
    }

    const provider = this.getProvider(tx.paymentMethod);
    const result = await provider.processPayment({
      transactionId: tx.id,
      transactionNumber: tx.transactionNumber,
      internalReference: tx.internalReference,
      idempotencyKey: tx.idempotencyKey,
      employeeId: tx.employeeId,
      employeeNumber: tx.employee.employeeNumber,
      employeeName: tx.employee.fullName,
      paymentMethod: tx.paymentMethod,
      accountNumber: tx.accountNumber,
      bankName: tx.bankName,
      phoneNumber: tx.phoneNumber,
      amount: tx.amount,
      currency: 'KES',
      description: `Retry Salary ${tx.paymentBatch.payrollPeriod.name} (${tx.employee.employeeNumber})`,
    });

    let updatedTx;
    if (result.success && result.status === 'SUCCESS') {
      updatedTx = await prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: {
          status: 'SUCCESS',
          provider: result.provider,
          providerReference: result.providerReference,
          failureCode: null,
          failureMessage: null,
          retryCount: { increment: 1 },
          lastRetriedAt: new Date(),
          completedAt: result.timestamp,
        },
        include: { employee: true, paymentBatch: true },
      });

      await prisma.payrollEmployeeRecord.update({
        where: { id: tx.payrollRecordId },
        data: {
          paymentStatus: 'PAID',
          paidAt: result.timestamp,
          paymentReference: result.providerReference,
          paymentNotes: `Paid on retry via ${result.provider} (${result.providerReference}) on ${result.timestamp.toISOString()}`,
        },
      });
    } else {
      updatedTx = await prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: {
          status: 'FAILED',
          failureCode: result.failureCode || 'RETRY_FAILED',
          failureMessage: result.failureMessage || 'Retry transaction rejected.',
          retryCount: { increment: 1 },
          lastRetriedAt: new Date(),
        },
        include: { employee: true, paymentBatch: true },
      });

      await prisma.payrollEmployeeRecord.update({
        where: { id: tx.payrollRecordId },
        data: {
          paymentStatus: 'FAILED',
          paymentNotes: `Retry Failed: ${result.failureMessage || 'Transaction rejected'}`,
        },
      });
    }

    // Recompute parent PaymentBatch statistics
    const batchTxs = await prisma.paymentTransaction.findMany({
      where: { paymentBatchId: tx.paymentBatchId },
    });

    const successfulCount = batchTxs.filter((t) => t.status === 'SUCCESS').length;
    const successfulAmount = batchTxs
      .filter((t) => t.status === 'SUCCESS')
      .reduce((sum, t) => sum + t.amount, 0);
    const failedCount = batchTxs.filter((t) => t.status === 'FAILED').length;
    const failedAmount = batchTxs
      .filter((t) => t.status === 'FAILED')
      .reduce((sum, t) => sum + t.amount, 0);

    let batchStatus: 'COMPLETED' | 'PARTIALLY_FAILED' | 'FAILED' = 'COMPLETED';
    if (failedCount > 0 && successfulCount > 0) {
      batchStatus = 'PARTIALLY_FAILED';
    } else if (failedCount > 0 && successfulCount === 0) {
      batchStatus = 'FAILED';
    }

    await prisma.paymentBatch.update({
      where: { id: tx.paymentBatchId },
      data: {
        status: batchStatus,
        successfulCount,
        successfulAmount: Math.round(successfulAmount * 100) / 100,
        failedCount,
        failedAmount: Math.round(failedAmount * 100) / 100,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        userEmail,
        action: 'PAYMENT_TRANSACTION_RETRIED',
        module: 'PAYROLL',
        entityType: 'PaymentTransaction',
        entityId: tx.id,
        newValue: JSON.stringify({
          transactionNumber: tx.transactionNumber,
          status: updatedTx.status,
          retryCount: updatedTx.retryCount,
        }),
      },
    });

    return updatedTx;
  }
}
