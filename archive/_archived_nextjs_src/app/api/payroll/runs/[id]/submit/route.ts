import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/response';
import { requireAuth } from '@/lib/permissions';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(req, ['payroll.submit']);
    if (auth.error) return auth.error;

    const run = await prisma.payrollRun.findUnique({
      where: { id: params.id },
    });

    if (!run) {
      return apiError('Payroll run not found', 404);
    }

    if (run.status !== 'CALCULATED' && run.status !== 'UNDER_REVIEW') {
      return apiError(`Cannot submit payroll run with status ${run.status}. Expected CALCULATED or UNDER_REVIEW.`, 400);
    }

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        status: 'PENDING_APPROVAL',
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'SUBMIT_PAYROLL_RUN',
        module: 'PAYROLL',
        entityType: 'PAYROLL_RUN',
        entityId: run.id,
      },
    });

    return apiSuccess(updated, { message: `Payroll run ${run.runNumber} submitted for executive approval.` });
  } catch (err: any) {
    return apiError(err.message || 'Failed to submit payroll run', 500);
  }
}
