import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { ReviewService } from '@/lib/performance/ReviewService';
import { db } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const currentEmp = await db.employee.findFirst({ where: { userId: auth.user.id } });
    const isHrAdmin =
      auth.session.roles.includes('hr_admin') ||
      auth.session.roles.includes('hr_manager') ||
      auth.session.roles.includes('super_admin');

    const concern = await db.performanceConcern.findUnique({
      where: { id: params.id },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            department: { select: { id: true, name: true } },
          },
        },
        review: {
          select: {
            id: true,
            reviewNumber: true,
            overallScore: true,
            overallRating: true,
            cycle: { select: { name: true } },
          },
        },
        resolvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!concern) return apiError('Performance concern not found', 404);

    // IDOR check
    if (!isHrAdmin && currentEmp && concern.employeeId !== currentEmp.id) {
      return apiError('You are not authorized to view this performance concern.', 403);
    }

    const sanitized = !isHrAdmin ? { ...concern, internalHrNotes: null } : concern;
    return apiSuccess({ concern: sanitized });
  } catch (error: any) {
    console.error('Error fetching performance concern:', error);
    return apiError(error.message || 'Failed to fetch performance concern', 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['performance.concerns.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    if (!body.status) {
      return apiError('Resolution status is required.', 400);
    }

    const updated = await ReviewService.resolveConcern(
      params.id,
      {
        status: body.status,
        hrResponse: body.hrResponse,
        internalHrNotes: body.internalHrNotes,
      },
      auth.user.id
    );

    return apiSuccess({ concern: updated }, 'Performance concern resolution updated');
  } catch (error: any) {
    console.error('Error resolving performance concern:', error);
    return apiError(error.message || 'Failed to resolve performance concern', 400);
  }
}
