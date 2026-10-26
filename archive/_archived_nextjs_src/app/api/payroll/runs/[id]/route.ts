import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/response';
import { requireAuth } from '@/lib/permissions';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(req, ['payroll.view']);
    if (auth.error) return auth.error;

    const run = await prisma.payrollRun.findUnique({
      where: { id: params.id },
      include: {
        payrollPeriod: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        calculatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        finalizedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        lockedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: {
          select: {
            employeeRecords: true,
            exceptions: true,
          },
        },
      },
    });

    if (!run) {
      return apiError('Payroll run not found', 404);
    }

    // Also get active exceptions count by severity
    const exceptionsSummary = await prisma.payrollRunException.groupBy({
      by: ['severity', 'isResolved'],
      where: { payrollRunId: run.id },
      _count: true,
    });

    return apiSuccess({
      ...run,
      exceptionsBreakdown: exceptionsSummary,
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to fetch payroll run details', 500);
  }
}
