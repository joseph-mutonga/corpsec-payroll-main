import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/response';
import { requireAuth } from '@/lib/permissions';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; exceptionId: string } }
) {
  try {
    const auth = await requireAuth(req, ['payroll_exception.resolve']);
    if (auth.error) return auth.error;

    const body = await req.json();
    const { resolutionNotes } = body;

    const exception = await prisma.payrollRunException.findUnique({
      where: { id: params.exceptionId },
      include: { payrollRun: true },
    });

    if (!exception || exception.payrollRunId !== params.id) {
      return apiError('Exception not found', 404);
    }

    if (exception.payrollRun.status === 'FINALIZED' || exception.payrollRun.status === 'LOCKED') {
      return apiError('Cannot resolve exceptions on finalized or locked payroll runs', 400);
    }

    const updated = await prisma.payrollRunException.update({
      where: { id: params.exceptionId },
      data: {
        isResolved: true,
        resolvedById: auth.user.id,
        resolvedAt: new Date(),
        resolutionNotes: resolutionNotes || 'Resolved by authorized administrator',
      },
      include: {
        resolvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'RESOLVE_PAYROLL_EXCEPTION',
        module: 'PAYROLL',
        entityType: 'PAYROLL_EXCEPTION',
        entityId: updated.id,
        newValue: JSON.stringify({
          exceptionType: updated.exceptionType,
          notes: resolutionNotes,
        }),
      },
    });

    return apiSuccess(updated, { message: 'Exception marked as resolved' });
  } catch (err: any) {
    return apiError(err.message || 'Failed to resolve exception', 500);
  }
}
