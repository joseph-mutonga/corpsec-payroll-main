import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/response';
import { requireAuth } from '@/lib/permissions';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(req, ['payroll.approve']);
    if (auth.error) return auth.error;

    const run = await prisma.payrollRun.findUnique({
      where: { id: params.id },
    });

    if (!run) {
      return apiError('Payroll run not found', 404);
    }

    if (run.status !== 'PENDING_APPROVAL') {
      return apiError(`Cannot approve payroll run with status ${run.status}. Expected PENDING_APPROVAL.`, 400);
    }

    // Anti-self-approval check: calculatedBy or createdBy cannot approve unless super_admin
    const isSuperAdmin = auth.session.roles?.includes('super_admin');
    if (!isSuperAdmin) {
      if (run.calculatedById === auth.user.id || run.createdById === auth.user.id) {
        return apiError('Segregation of Duties Violation: You cannot approve a payroll run that you created or calculated.', 403);
      }
    }

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        status: 'APPROVED',
        approvedById: auth.user.id,
        approvedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'APPROVE_PAYROLL_RUN',
        module: 'PAYROLL',
        entityType: 'PAYROLL_RUN',
        entityId: run.id,
      },
    });

    return apiSuccess(updated, { message: `Payroll run ${run.runNumber} approved successfully.` });
  } catch (err: any) {
    return apiError(err.message || 'Failed to approve payroll run', 500);
  }
}
