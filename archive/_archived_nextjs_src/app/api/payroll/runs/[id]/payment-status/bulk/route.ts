import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req, ['payroll_payment.update_status']);
    if (auth.error) return auth.error;

    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    const body = await req.json();
    const { paymentStatus, paymentReference, paymentNotes, paidAt, recordIds } = body;

    const allowedStatuses = ['PENDING', 'PROCESSING', 'PAID', 'FAILED'];
    if (!paymentStatus || !allowedStatuses.includes(paymentStatus)) {
      return apiError(`Invalid paymentStatus. Must be one of: ${allowedStatuses.join(', ')}`, 400);
    }

    const run = await prisma.payrollRun.findUnique({
      where: { id },
      include: { payrollPeriod: true },
    });

    if (!run) {
      return apiError('Payroll run not found', 404);
    }

    const where: any = {
      payrollRunId: id,
    };

    if (recordIds && Array.isArray(recordIds) && recordIds.length > 0) {
      where.id = { in: recordIds };
    }

    const updateData: any = {
      paymentStatus,
    };

    if (paymentReference !== undefined) updateData.paymentReference = paymentReference;
    if (paymentNotes !== undefined) updateData.paymentNotes = paymentNotes;
    if (paymentStatus === 'PAID') {
      updateData.paidAt = paidAt ? new Date(paidAt) : new Date();
    } else if (paymentStatus === 'PENDING') {
      updateData.paidAt = null;
    }

    const result = await prisma.payrollEmployeeRecord.updateMany({
      where,
      data: updateData,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'BULK_PAYMENT_STATUS_UPDATED',
        module: 'PAYROLL',
        entityType: 'PayrollRun',
        entityId: run.id,
        newValue: JSON.stringify({
          runNumber: run.runNumber,
          periodName: run.payrollPeriod?.name,
          updatedCount: result.count,
          newStatus: paymentStatus,
          paymentReference,
        }),
      },
    });

    return apiSuccess({
      runId: run.id,
      runNumber: run.runNumber,
      updatedCount: result.count,
      paymentStatus,
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to bulk update payment status', 500);
  }
}
