import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';
import { EmployeeLifecycleService } from '@/lib/hr/EmployeeLifecycleService';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth('hr.offboarding.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const stage = searchParams.get('stage');
    const status = searchParams.get('status');

    const where: any = {};
    if (stage && stage !== 'ALL') where.stage = stage;
    if (status && status !== 'ALL') where.status = status;

    const cases = await db.offboardingCase.findMany({
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
      total: await db.offboardingCase.count(),
      inProgress: await db.offboardingCase.count({ where: { status: 'IN_PROGRESS' } }),
      completed: await db.offboardingCase.count({ where: { status: 'COMPLETED' } }),
    };

    return apiSuccess({ cases, stats });
  } catch (error: any) {
    console.error('Error fetching offboarding cases:', error);
    return apiError(error.message || 'Failed to fetch offboarding cases');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth('hr.offboarding.create');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const { employeeId, exitType, noticeDate, exitDate, reason, assignedToId, notes } = body;

    if (!employeeId || !exitDate) {
      return apiBadRequest('employeeId and exitDate are required');
    }

    const offboardingCase = await EmployeeLifecycleService.initiateOffboarding({
      employeeId,
      exitType: exitType || 'RESIGNATION',
      noticeDate: noticeDate ? new Date(noticeDate) : undefined,
      exitDate: new Date(exitDate),
      reason,
      assignedToId: assignedToId || auth.session.userId,
      notes,
    });

    return apiSuccess(offboardingCase);
  } catch (error: any) {
    console.error('Error creating offboarding case:', error);
    return apiError(error.message || 'Failed to create offboarding case');
  }
}
