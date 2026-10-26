import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiBadRequest, apiError, apiForbidden, apiSuccess } from '@/lib/response';
import { EmployeeLifecycleService } from '@/lib/hr/EmployeeLifecycleService';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth('hr.onboarding.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const stage = searchParams.get('stage');
    const status = searchParams.get('status');

    const where: any = {};
    if (stage && stage !== 'ALL') where.stage = stage;
    if (status && status !== 'ALL') where.status = status;

    const cases = await db.onboardingCase.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            employeeNumber: true,
            jobTitle: true,
            department: { select: { name: true } },
            station: { select: { name: true } },
          },
        },
        tasks: { orderBy: { order: 'asc' } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const stats = {
      total: await db.onboardingCase.count(),
      inProgress: await db.onboardingCase.count({ where: { status: 'IN_PROGRESS' } }),
      completed: await db.onboardingCase.count({ where: { status: 'COMPLETED' } }),
    };

    return apiSuccess({ cases, stats });
  } catch (error: any) {
    console.error('Error fetching onboarding cases:', error);
    return apiError(error.message || 'Failed to fetch onboarding cases');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth('hr.onboarding.create');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const { employeeId, targetCompletionDate, assignedToId, notes } = body;

    if (!employeeId) {
      return apiBadRequest('employeeId is required');
    }

    const onboardingCase = await EmployeeLifecycleService.initiateOnboarding({
      employeeId,
      targetCompletionDate: targetCompletionDate ? new Date(targetCompletionDate) : undefined,
      assignedToId: assignedToId || auth.session.userId,
      notes,
    });

    return apiSuccess(onboardingCase);
  } catch (error: any) {
    console.error('Error creating onboarding case:', error);
    return apiError(error.message || 'Failed to create onboarding case');
  }
}
