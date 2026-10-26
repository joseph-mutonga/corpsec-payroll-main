import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/response';
import { requireAuth } from '@/lib/permissions';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; recordId: string } }
) {
  try {
    const auth = await requireAuth(req, ['payroll.view']);
    if (auth.error) return auth.error;

    const record = await prisma.payrollEmployeeRecord.findUnique({
      where: { id: params.recordId },
      include: {
        employee: {
          include: {
            department: true,
            branch: true,
            station: true,
          },
        },
        payrollRun: {
          include: {
            payrollPeriod: true,
          },
        },
        exceptions: true,
      },
    });

    if (!record || record.payrollRunId !== params.id) {
      return apiError('Payroll employee record not found', 404);
    }

    let parsedTrace = null;
    if (record.calculationTrace) {
      try {
        parsedTrace = JSON.parse(record.calculationTrace);
      } catch (e) {
        parsedTrace = null;
      }
    }

    return apiSuccess({
      ...record,
      traceDetails: parsedTrace,
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to fetch payroll record', 500);
  }
}
