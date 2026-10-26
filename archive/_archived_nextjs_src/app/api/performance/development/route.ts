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
    const cycleId = searchParams.get('cycleId') || undefined;
    const status = searchParams.get('status') || undefined;
    const planType = searchParams.get('planType') || undefined;

    let targetEmployeeId = employeeId;
    const isHrAdmin =
      auth.session.roles.includes('hr_admin') ||
      auth.session.roles.includes('hr_manager') ||
      auth.session.roles.includes('super_admin');

    if (!isHrAdmin && auth.session.roles.includes('employee')) {
      const emp = await db.employee.findFirst({ where: { userId: auth.user.id } });
      if (emp) targetEmployeeId = emp.id;
    }

    const plans = await DevelopmentService.listDevelopmentPlans({
      employeeId: targetEmployeeId,
      cycleId,
      status,
      planType,
    });

    return apiSuccess({ plans });
  } catch (error: any) {
    console.error('Error listing development plans:', error);
    return apiError(error.message || 'Failed to list development plans', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['performance.development.manage', 'performance.reviews.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    if (!body.employeeId || !body.objective || !body.skillGap || !body.action || !body.startDate || !body.targetDate) {
      return apiError('employeeId, objective, skillGap, action, startDate, and targetDate are required.', 400);
    }

    const plan = await DevelopmentService.createDevelopmentPlan({
      employeeId: body.employeeId,
      cycleId: body.cycleId,
      reviewId: body.reviewId,
      planType: body.planType,
      objective: body.objective,
      skillGap: body.skillGap,
      action: body.action,
      owner: body.owner,
      startDate: new Date(body.startDate),
      targetDate: new Date(body.targetDate),
      createdById: auth.user.id,
    });

    return apiSuccess({ plan }, 'Development plan created successfully', 201);
  } catch (error: any) {
    console.error('Error creating development plan:', error);
    return apiError(error.message || 'Failed to create development plan', 400);
  }
}
