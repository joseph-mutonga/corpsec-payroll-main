import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/response';
import { requireAuth } from '@/lib/permissions';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(req, ['payroll.view', 'payroll_exception.view']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const severity = searchParams.get('severity');
    const isResolved = searchParams.get('isResolved');

    const where: any = {
      payrollRunId: params.id,
    };

    if (severity) where.severity = severity;
    if (isResolved !== null && isResolved !== undefined && isResolved !== '') {
      where.isResolved = isResolved === 'true';
    }

    const exceptions = await prisma.payrollRunException.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            department: { select: { name: true } },
          },
        },
        resolvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: [
        { severity: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return apiSuccess(exceptions, { total: exceptions.length });
  } catch (err: any) {
    return apiError(err.message || 'Failed to fetch payroll exceptions', 500);
  }
}
