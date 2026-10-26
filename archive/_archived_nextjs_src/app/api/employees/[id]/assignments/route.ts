import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiNotFound, apiSuccess } from '@/lib/response';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('assignment.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const employee = await db.employee.findFirst({
      where: { id: params.id, deletedAt: null },
      select: { id: true, employeeNumber: true, fullName: true },
    });

    if (!employee) return apiNotFound('Employee not found.');

    const assignments = await db.employeeAssignment.findMany({
      where: { employeeId: params.id },
      orderBy: { startDate: 'desc' },
      include: {
        branch: { select: { id: true, code: true, name: true, location: true } },
        department: { select: { id: true, code: true, name: true } },
        station: { select: { id: true, code: true, name: true, clientLocationName: true } },
        position: { select: { id: true, code: true, title: true, employmentCategory: true } },
        supervisor: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return apiSuccess({
      employee,
      assignments,
    });
  } catch (error) {
    console.error('Fetch employee assignments error:', error);
    return apiError('Failed to fetch employee assignment records.');
  }
}
