import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['salary.view', 'payroll_config.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const salary = await db.salaryRecord.findUnique({
      where: { id: params.id },
      include: {
        employee: {
          include: {
            department: true,
            branch: true,
            station: true,
            position: true,
          },
        },
        proposedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!salary) {
      return apiError('Salary record not found', 404);
    }

    return apiSuccess(salary);
  } catch (error) {
    console.error('Fetch salary record error:', error);
    return apiError('Failed to fetch salary record');
  }
}
