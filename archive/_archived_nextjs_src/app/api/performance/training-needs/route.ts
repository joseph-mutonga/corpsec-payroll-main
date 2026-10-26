import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { DevelopmentService } from '@/lib/performance/DevelopmentService';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId') || undefined;
    const priority = searchParams.get('priority') || undefined;
    const status = searchParams.get('status') || undefined;

    let targetEmployeeId = employeeId;
    const isHrAdmin =
      auth.session.roles.includes('hr_admin') ||
      auth.session.roles.includes('hr_manager') ||
      auth.session.roles.includes('super_admin');

    if (!isHrAdmin && auth.session.roles.includes('employee')) {
      const emp = await db.employee.findFirst({ where: { userId: auth.user.id } });
      if (emp) targetEmployeeId = emp.id;
    }

    const trainingNeeds = await DevelopmentService.listTrainingNeeds({
      employeeId: targetEmployeeId,
      priority,
      status,
    });

    return apiSuccess({ trainingNeeds });
  } catch (error: any) {
    console.error('Error listing training needs:', error);
    return apiError(error.message || 'Failed to list training needs', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    let employeeId = body.employeeId;
    if (!employeeId) {
      const emp = await db.employee.findFirst({ where: { userId: auth.user.id } });
      if (emp) employeeId = emp.id;
    }

    if (!employeeId || !body.skill || !body.identifiedNeed) {
      return apiError('employeeId, skill, and identifiedNeed are required.', 400);
    }

    const need = await DevelopmentService.createTrainingNeed({
      employeeId,
      cycleId: body.cycleId,
      competencyId: body.competencyId,
      skill: body.skill,
      identifiedNeed: body.identifiedNeed,
      priority: body.priority,
      source: body.source,
      recommendedTraining: body.recommendedTraining,
      targetDate: body.targetDate ? new Date(body.targetDate) : undefined,
      createdById: auth.user.id,
    });

    return apiSuccess({ trainingNeed: need }, 'Training need recorded successfully', 201);
  } catch (error: any) {
    console.error('Error recording training need:', error);
    return apiError(error.message || 'Failed to record training need', 400);
  }
}
