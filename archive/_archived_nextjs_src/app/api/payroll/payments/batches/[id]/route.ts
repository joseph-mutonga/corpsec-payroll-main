// GET /api/payroll/payments/batches/[id] — Retrieve single batch details and review list

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { PaymentMasking } from '@/lib/payments/PaymentMasking';
import { PaymentValidation } from '@/lib/payments/PaymentValidation';

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(req, ['payroll_payment.view']);
    if (auth.error) return auth.error;

    const resolvedParams = await Promise.resolve(context.params);
    const batchId = resolvedParams.id;

    const batch = await prisma.paymentBatch.findUnique({
      where: { id: batchId },
      include: {
        payrollPeriod: true,
        payrollRun: {
          include: {
            employeeRecords: {
              where: { status: 'CALCULATED' },
              include: {
                employee: {
                  include: {
                    department: true,
                    station: true,
                    branch: true,
                  },
                },
              },
              orderBy: { employee: { employeeNumber: 'asc' } },
            },
          },
        },
        transactions: {
          include: {
            employee: {
              include: { department: true, station: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        processedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!batch) {
      return apiError('Payment batch not found', 404);
    }

    // Build masked review list from payrollRun employee records
    const validation = PaymentValidation.validateBatchRecords(batch.payrollRun.employeeRecords);

    const reviewItems = batch.payrollRun.employeeRecords.map((r) => {
      const emp = r.employee;
      const destinationMasked = PaymentMasking.maskDestination(
        r.paymentMethod || 'BANK',
        r.bankAccountNumber,
        r.mpesaPhoneNumber,
        r.bankName
      );

      const recordValidationErrors = PaymentValidation.validateEmployeeRecord(r);

      return {
        id: r.id,
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        fullName: emp.fullName,
        nationalId: PaymentMasking.maskIdNumber(emp.nationalId),
        department: emp.department?.name || r.departmentName || 'Guarding Operations',
        station: emp.station?.name || r.stationName || 'Nairobi Station',
        netPay: r.netPay,
        paymentMethod: r.paymentMethod || 'BANK',
        destinationMasked,
        bankName: r.bankName || 'N/A',
        paymentStatus: r.paymentStatus || 'PENDING',
        paidAt: r.paidAt,
        paymentReference: r.paymentReference,
        validationIssues: recordValidationErrors,
        isEligible: recordValidationErrors.filter((e) => e.severity === 'ERROR').length === 0,
      };
    });

    const maskedTransactions = batch.transactions.map((t) => ({
      id: t.id,
      transactionNumber: t.transactionNumber,
      employeeId: t.employeeId,
      employeeNumber: t.employee.employeeNumber,
      fullName: t.employee.fullName,
      department: t.employee.department?.name || 'Guarding Operations',
      amount: t.amount,
      paymentMethod: t.paymentMethod,
      destinationMasked: PaymentMasking.maskDestination(t.paymentMethod, t.accountNumber, t.phoneNumber, t.bankName),
      status: t.status,
      provider: t.provider,
      providerReference: t.providerReference,
      internalReference: t.internalReference,
      failureCode: t.failureCode,
      failureMessage: t.failureMessage,
      retryCount: t.retryCount,
      lastRetriedAt: t.lastRetriedAt,
      completedAt: t.completedAt,
    }));

    return apiSuccess({
      batch: {
        id: batch.id,
        batchNumber: batch.batchNumber,
        name: batch.name,
        payrollPeriodId: batch.payrollPeriodId,
        payrollRunId: batch.payrollRunId,
        paymentMethod: batch.paymentMethod,
        totalEmployees: batch.totalEmployees,
        totalAmount: batch.totalAmount,
        successfulCount: batch.successfulCount,
        successfulAmount: batch.successfulAmount,
        failedCount: batch.failedCount,
        failedAmount: batch.failedAmount,
        status: batch.status,
        createdById: batch.createdById,
        approvedById: batch.approvedById,
        approvedAt: batch.approvedAt,
        processedById: batch.processedById,
        processedAt: batch.processedAt,
        notes: batch.notes,
        rejectionReason: batch.rejectionReason,
        isReconciled: batch.isReconciled,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
        payrollPeriod: batch.payrollPeriod,
        payrollRun: {
          id: batch.payrollRun.id,
          runNumber: batch.payrollRun.runNumber,
          status: batch.payrollRun.status,
          totalNetPayroll: batch.payrollRun.totalNetPayroll,
        },
        createdBy: batch.createdBy,
        approvedBy: batch.approvedBy,
        processedBy: batch.processedBy,
      },
      validation,
      reviewItems,
      transactions: maskedTransactions,
    });
  } catch (error: any) {
    console.error('Error getting payment batch details:', error);
    return apiError(error.message || 'Failed to get payment batch details', 500);
  }
}
