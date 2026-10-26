import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/response';
import { requireAuth } from '@/lib/permissions';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(req, ['payroll.cancel']);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const { reason } = body;

    const run = await prisma.payrollRun.findUnique({
      where: { id: params.id },
    });

    if (!run) {
      return apiError('Payroll run not found', 404);
    }

    if (run.status === 'FINALIZED' || run.status === 'LOCKED') {
      return apiError(`Cannot cancel a payroll run with status ${run.status}.`, 400);
    }

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        status: 'CANCELLED',
        rejectionReason: reason || 'Cancelled by user',
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'CANCEL_PAYROLL_RUN',
        module: 'PAYROLL',
        entityType: 'PAYROLL_RUN',
        entityId: run.id,
        newValue: JSON.stringify({ reason }),
      },
    });

    return apiSuccess(updated, { message: `Payroll run ${run.runNumber} cancelled.` });
  } catch (err: any) {
    return apiError(err.message || 'Failed to cancel payroll run', 500);
  }
}
