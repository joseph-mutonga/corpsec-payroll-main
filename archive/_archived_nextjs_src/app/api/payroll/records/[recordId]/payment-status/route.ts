import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { recordId: string } | Promise<{ recordId: string }> }
) {
  try {
    const auth = await requireAuth(req, ['payroll_payment.update_status']);
    if (auth.error) return auth.error;

    const resolvedParams = await Promise.resolve(params);
    const recordId = resolvedParams.recordId;

    const body = await req.json();
    const { paymentStatus, paymentReference, paymentNotes, paidAt } = body;

    const allowedStatuses = ['PENDING', 'PROCESSING', 'PAID', 'FAILED'];
    if (!paymentStatus || !allowedStatuses.includes(paymentStatus)) {
      return apiError(`Invalid paymentStatus. Must be one of: ${allowedStatuses.join(', ')}`, 400);
    }

    const record = await prisma.payrollEmployeeRecord.findUnique({
      where: { id: recordId },
      include: {
        employee: true,
        payrollRun: { include: { payrollPeriod: true } },
      },
    });

    if (!record) {
      return apiError('Employee payroll record not found', 404);
    }

    const updated = await prisma.payrollEmployeeRecord.update({
      where: { id: recordId },
      data: {
        paymentStatus,
        paymentReference: paymentReference !== undefined ? paymentReference : record.paymentReference,
        paymentNotes: paymentNotes !== undefined ? paymentNotes : record.paymentNotes,
        paidAt: paymentStatus === 'PAID' ? (paidAt ? new Date(paidAt) : new Date()) : (paymentStatus === 'PENDING' ? null : record.paidAt),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'PAYROLL_PAYMENT_STATUS_UPDATED',
        module: 'PAYROLL',
        entityType: 'PayrollEmployeeRecord',
        entityId: record.id,
        newValue: JSON.stringify({
          employeeNumber: record.employee.employeeNumber,
          employeeName: record.employee.fullName,
          previousStatus: record.paymentStatus,
          newStatus: paymentStatus,
          paymentReference,
          netPay: record.netPay,
        }),
      },
    });

    return apiSuccess({
      id: updated.id,
      employeeId: updated.employeeId,
      paymentStatus: updated.paymentStatus,
      paidAt: updated.paidAt,
      paymentReference: updated.paymentReference,
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to update payment status', 500);
  }
}
