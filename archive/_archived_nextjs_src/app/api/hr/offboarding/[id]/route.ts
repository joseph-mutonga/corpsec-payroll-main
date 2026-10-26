import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiBadRequest, apiError, apiNotFound, apiSuccess } from '@/lib/response';
import { EmployeeLifecycleService } from '@/lib/hr/EmployeeLifecycleService';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth('hr.offboarding.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const offboardingCase = await db.offboardingCase.findUnique({
      where: { id: params.id },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            employeeNumber: true,
            jobTitle: true,
            employmentType: true,
            employmentDate: true,
            department: true,
            station: true,
            branch: true,
          },
        },
        tasks: {
          orderBy: { order: 'asc' },
          include: {
            completedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        clearanceApprovedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!offboardingCase) {
      return apiNotFound('Offboarding case not found');
    }

    return apiSuccess(offboardingCase);
  } catch (error: any) {
    console.error('Error fetching offboarding case detail:', error);
    return apiError(error.message || 'Failed to fetch offboarding case detail');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth('hr.offboarding.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const { action, taskId, isCompleted } = body;

    if (action === 'COMPLETE') {
      const completedCase = await EmployeeLifecycleService.completeOffboarding(
        params.id,
        auth.session.userId
      );
      return apiSuccess(completedCase);
    }

    if (!taskId || typeof isCompleted !== 'boolean') {
      return apiBadRequest('taskId and isCompleted (boolean) are required');
    }

    const result = await EmployeeLifecycleService.toggleOffboardingTask(
      taskId,
      isCompleted,
      auth.session.userId
    );

    return apiSuccess(result);
  } catch (error: any) {
    console.error('Error updating offboarding task:', error);
    return apiError(error.message || 'Failed to update offboarding task');
  }
}
