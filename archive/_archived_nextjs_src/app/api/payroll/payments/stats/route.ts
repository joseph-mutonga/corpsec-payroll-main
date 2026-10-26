// GET /api/payroll/payments/stats — Disbursement dashboard KPIs

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { DisbursementDashboardStats } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['payroll_payment.view']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const payrollPeriodId = searchParams.get('payrollPeriodId');

    // Find target period
    let period;
    if (payrollPeriodId) {
      period = await prisma.payrollPeriod.findUnique({
        where: { id: payrollPeriodId },
      });
    } else {
      period = await prisma.payrollPeriod.findFirst({
        where: { status: { in: ['OPEN', 'PROCESSING', 'APPROVED', 'FINALIZED'] } },
        orderBy: [{ payrollYear: 'desc' }, { payrollMonth: 'desc' }],
      });
    }

    if (!period) {
      return apiSuccess<DisbursementDashboardStats>({
        payrollPeriodId: '',
        periodName: 'No active period',
        runNumber: 'N/A',
        totalEmployees: 0,
        totalNetPayroll: 0,
        pendingCount: 0,
        pendingAmount: 0,
        processingCount: 0,
        processingAmount: 0,
        successfulCount: 0,
        successfulAmount: 0,
        failedCount: 0,
        failedAmount: 0,
        completionPercentage: 0,
        batchesCount: 0,
        reconciliationStatus: 'NOT_RECONCILED',
      });
    }

    // Find active run for this period
    const run = await prisma.payrollRun.findFirst({
      where: { payrollPeriodId: period.id },
      include: {
        employeeRecords: {
          where: { status: 'CALCULATED' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const records = run?.employeeRecords || [];
    const totalEmployees = records.length;
    const totalNetPayroll = records.reduce((sum, r) => sum + Number(r.netPay || 0), 0);

    const pendingRecords = records.filter((r) => !r.paymentStatus || r.paymentStatus === 'PENDING');
    const processingRecords = records.filter((r) => r.paymentStatus === 'PROCESSING');
    const successfulRecords = records.filter((r) => r.paymentStatus === 'PAID');
    const failedRecords = records.filter((r) => r.paymentStatus === 'FAILED');

    const pendingAmount = pendingRecords.reduce((sum, r) => sum + Number(r.netPay || 0), 0);
    const processingAmount = processingRecords.reduce((sum, r) => sum + Number(r.netPay || 0), 0);
    const successfulAmount = successfulRecords.reduce((sum, r) => sum + Number(r.netPay || 0), 0);
    const failedAmount = failedRecords.reduce((sum, r) => sum + Number(r.netPay || 0), 0);

    const completionPercentage =
      totalNetPayroll > 0 ? Math.round((successfulAmount / totalNetPayroll) * 10000) / 100 : 0;

    const batchesCount = await prisma.paymentBatch.count({
      where: { payrollPeriodId: period.id },
    });

    const lastReconciliation = await prisma.paymentReconciliation.findFirst({
      where: { payrollPeriodId: period.id },
      orderBy: { createdAt: 'desc' },
    });

    const stats: DisbursementDashboardStats = {
      payrollPeriodId: period.id,
      periodName: period.name,
      runNumber: run?.runNumber || 'N/A',
      totalEmployees,
      totalNetPayroll: Math.round(totalNetPayroll * 100) / 100,
      pendingCount: pendingRecords.length,
      pendingAmount: Math.round(pendingAmount * 100) / 100,
      processingCount: processingRecords.length,
      processingAmount: Math.round(processingAmount * 100) / 100,
      successfulCount: successfulRecords.length,
      successfulAmount: Math.round(successfulAmount * 100) / 100,
      failedCount: failedRecords.length,
      failedAmount: Math.round(failedAmount * 100) / 100,
      completionPercentage,
      batchesCount,
      reconciliationStatus: (lastReconciliation?.status as any) || (successfulRecords.length > 0 && failedRecords.length === 0 ? 'RECONCILED' : 'NOT_RECONCILED'),
    };

    return apiSuccess(stats);
  } catch (error: any) {
    console.error('Error fetching disbursement stats:', error);
    return apiError(error.message || 'Failed to fetch disbursement statistics', 500);
  }
}
