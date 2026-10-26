// GET & POST /api/payroll/payments/reconciliation — Payment Reconciliation Analysis & Report Storage

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { ReconciliationService } from '@/lib/payments/ReconciliationService';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['payroll_payment.reconcile', 'payroll_payment.view']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const payrollPeriodId = searchParams.get('payrollPeriodId');
    const runId = searchParams.get('runId');

    let period;
    if (payrollPeriodId) {
      period = await prisma.payrollPeriod.findUnique({ where: { id: payrollPeriodId } });
    } else {
      period = await prisma.payrollPeriod.findFirst({
        where: { status: { in: ['OPEN', 'PROCESSING', 'APPROVED', 'FINALIZED'] } },
        orderBy: [{ payrollYear: 'desc' }, { payrollMonth: 'desc' }],
      });
    }

    if (!period) {
      return apiError('No active payroll period found for reconciliation', 404);
    }

    let run;
    if (runId) {
      run = await prisma.payrollRun.findUnique({
        where: { id: runId },
        include: {
          payrollPeriod: true,
          employeeRecords: {
            where: { status: 'CALCULATED' },
            include: { employee: true },
          },
        },
      });
    } else {
      run = await prisma.payrollRun.findFirst({
        where: { payrollPeriodId: period.id },
        include: {
          payrollPeriod: true,
          employeeRecords: {
            where: { status: 'CALCULATED' },
            include: { employee: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!run) {
      return apiError('No payroll calculation run found for this period', 404);
    }

    // Retrieve all payment transactions related to this payroll run or period
    const transactions = await prisma.paymentTransaction.findMany({
      where: {
        payrollRecordId: { in: run.employeeRecords.map((r) => r.id) },
      },
    });

    const reconciliation = ReconciliationService.reconcile({
      payrollPeriodId: period.id,
      payrollPeriodName: period.name,
      periodNumber: period.periodNumber,
      payrollRunId: run.id,
      runNumber: run.runNumber,
      employeeRecords: run.employeeRecords.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        employeeNumber: r.employee.employeeNumber,
        fullName: r.employee.fullName,
        departmentName: r.departmentName,
        stationName: r.stationName,
        netPay: r.netPay,
        paymentMethod: r.paymentMethod,
        paymentStatus: r.paymentStatus,
        paymentReference: r.paymentReference,
      })),
      transactions: transactions.map((t) => ({
        id: t.id,
        transactionNumber: t.transactionNumber,
        employeeId: t.employeeId,
        payrollRecordId: t.payrollRecordId,
        amount: t.amount,
        status: t.status,
        paymentMethod: t.paymentMethod,
        providerReference: t.providerReference,
        idempotencyKey: t.idempotencyKey,
      })),
    });

    return apiSuccess({
      period: { id: period.id, name: period.name, periodNumber: period.periodNumber },
      run: { id: run.id, runNumber: run.runNumber, status: run.status },
      summary: reconciliation.summary,
      discrepancies: reconciliation.discrepancies,
    });
  } catch (error: any) {
    console.error('Error running payment reconciliation:', error);
    return apiError(error.message || 'Failed to run payment reconciliation', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['payroll_payment.reconcile']);
    if (auth.error) return auth.error;

    const body = await req.json();
    const { payrollPeriodId, runId, notes } = body;

    if (!payrollPeriodId || !runId) {
      return apiError('payrollPeriodId and runId are required', 400);
    }

    const run = await prisma.payrollRun.findUnique({
      where: { id: runId },
      include: {
        payrollPeriod: true,
        employeeRecords: {
          where: { status: 'CALCULATED' },
          include: { employee: true },
        },
      },
    });

    if (!run) return apiError('Payroll run not found', 404);

    const transactions = await prisma.paymentTransaction.findMany({
      where: {
        payrollRecordId: { in: run.employeeRecords.map((r) => r.id) },
      },
    });

    const reconciliation = ReconciliationService.reconcile({
      payrollPeriodId: run.payrollPeriodId,
      payrollPeriodName: run.payrollPeriod.name,
      periodNumber: run.payrollPeriod.periodNumber,
      payrollRunId: run.id,
      runNumber: run.runNumber,
      employeeRecords: run.employeeRecords.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        employeeNumber: r.employee.employeeNumber,
        fullName: r.employee.fullName,
        departmentName: r.departmentName,
        stationName: r.stationName,
        netPay: r.netPay,
        paymentMethod: r.paymentMethod,
        paymentStatus: r.paymentStatus,
        paymentReference: r.paymentReference,
      })),
      transactions: transactions.map((t) => ({
        id: t.id,
        transactionNumber: t.transactionNumber,
        employeeId: t.employeeId,
        payrollRecordId: t.payrollRecordId,
        amount: t.amount,
        status: t.status,
        paymentMethod: t.paymentMethod,
        providerReference: t.providerReference,
        idempotencyKey: t.idempotencyKey,
      })),
    });

    const count = await prisma.paymentReconciliation.count();
    const dateStr = new Date().toISOString().slice(0, 7).replace('-', '');
    const recNumber = `REC-${dateStr}-${String(count + 1).padStart(3, '0')}`;

    const saved = await prisma.paymentReconciliation.create({
      data: {
        reconciliationNumber: recNumber,
        payrollPeriodId: run.payrollPeriodId,
        payrollRunId: run.id,
        status: reconciliation.summary.status,
        expectedAmount: reconciliation.summary.expectedAmount,
        actualPaidAmount: reconciliation.summary.actualPaidAmount,
        discrepancyAmount: reconciliation.summary.discrepancyAmount,
        totalExpectedEmployees: reconciliation.summary.totalExpectedEmployees,
        totalPaidEmployees: reconciliation.summary.totalPaidEmployees,
        exceptionsCount: reconciliation.summary.exceptionsCount,
        reconciliationDetails: JSON.stringify(reconciliation.discrepancies),
        performedById: auth.user.id,
        notes,
      },
      include: {
        payrollPeriod: true,
        payrollRun: true,
        performedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'PAYMENT_RECONCILIATION_COMPLETED',
        module: 'PAYROLL',
        entityType: 'PaymentReconciliation',
        entityId: saved.id,
        newValue: JSON.stringify({
          reconciliationNumber: saved.reconciliationNumber,
          status: saved.status,
          expectedAmount: saved.expectedAmount,
          actualPaidAmount: saved.actualPaidAmount,
          discrepancyAmount: saved.discrepancyAmount,
          exceptionsCount: saved.exceptionsCount,
        }),
      },
    });

    return apiSuccess(saved, {
      message: `Reconciliation ${saved.reconciliationNumber} saved. Status: ${saved.status}.`,
    });
  } catch (error: any) {
    console.error('Error saving payment reconciliation report:', error);
    return apiError(error.message || 'Failed to save payment reconciliation', 500);
  }
}
