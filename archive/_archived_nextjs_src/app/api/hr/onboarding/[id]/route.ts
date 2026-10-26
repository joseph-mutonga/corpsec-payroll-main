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
    const auth = await requireAuth('hr.onboarding.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const onboardingCase = await db.onboardingCase.findUnique({
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
      },
    });

    if (!onboardingCase) {
      return apiNotFound('Onboarding case not found');
    }

    return apiSuccess(onboardingCase);
  } catch (error: any) {
    console.error('Error fetching onboarding case detail:', error);
    return apiError(error.message || 'Failed to fetch onboarding case detail');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth('hr.onboarding.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const { taskId, isCompleted } = body;

    if (!taskId || typeof isCompleted !== 'boolean') {
      return apiBadRequest('taskId and isCompleted (boolean) are required');
    }

    const result = await EmployeeLifecycleService.toggleOnboardingTask(
      taskId,
      isCompleted,
      auth.session.userId
    );

    return apiSuccess(result);
  } catch (error: any) {
    console.error('Error updating onboarding task:', error);
    return apiError(error.message || 'Failed to update onboarding task');
  }
}
