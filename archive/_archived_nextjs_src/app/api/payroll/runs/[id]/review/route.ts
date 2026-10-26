import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/response';
import { requireAuth } from '@/lib/permissions';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(req, ['payroll.review']);
    if (auth.error) return auth.error;

    const run = await prisma.payrollRun.findUnique({
      where: { id: params.id },
    });

    if (!run) {
      return apiError('Payroll run not found', 404);
    }

    if (run.status !== 'CALCULATED') {
      return apiError(`Cannot review payroll run with status ${run.status}. Expected status is CALCULATED.`, 400);
    }

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        status: 'UNDER_REVIEW',
        reviewedById: auth.user.id,
        reviewedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'REVIEW_PAYROLL_RUN',
        module: 'PAYROLL',
        entityType: 'PAYROLL_RUN',
        entityId: run.id,
      },
    });

    return apiSuccess(updated, { message: `Payroll run ${run.runNumber} is now Under Review.` });
  } catch (err: any) {
    return apiError(err.message || 'Failed to review payroll run', 500);
  }
}
