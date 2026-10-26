import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { GoalService } from '@/lib/performance/GoalService';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId') || undefined;
    const cycleId = searchParams.get('cycleId') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;
    const status = searchParams.get('status') || undefined;

    // If standard employee, force employeeId to own employee record
    let targetEmployeeId = employeeId;
    if (auth.session.roles.includes('employee') && !auth.session.roles.includes('hr_admin') && !auth.session.roles.includes('super_admin')) {
      const emp = await db.employee.findFirst({ where: { userId: auth.user.id } });
      if (emp) targetEmployeeId = emp.id;
    }

    const goals = await GoalService.listGoals({
      employeeId: targetEmployeeId,
      cycleId,
      departmentId,
      status,
    });

    return apiSuccess({ goals });
  } catch (error: any) {
    console.error('Error listing performance goals:', error);
    return apiError(error.message || 'Failed to list performance goals', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    let targetEmployeeId = body.employeeId;
    if (!targetEmployeeId && auth.session.roles.includes('employee')) {
      const emp = await db.employee.findFirst({ where: { userId: auth.user.id } });
      if (emp) targetEmployeeId = emp.id;
    }

    if (!targetEmployeeId || !body.cycleId || !body.title || !body.startDate || !body.dueDate) {
      return apiError('Employee ID, Cycle ID, title, start date, and due date are required.', 400);
    }

    const goal = await GoalService.createGoal({
      employeeId: targetEmployeeId,
      cycleId: body.cycleId,
      title: body.title,
      description: body.description,
      departmentId: body.departmentId,
      positionId: body.positionId,
      category: body.category,
      priority: body.priority,
      weight: parseFloat(body.weight || '0'),
      target: body.target,
      measurementMethod: body.measurementMethod,
      startDate: new Date(body.startDate),
      dueDate: new Date(body.dueDate),
      status: body.status,
      createdById: auth.user.id,
    });

    return apiSuccess({ goal }, 'Performance goal created successfully', 201);
  } catch (error: any) {
    console.error('Error creating performance goal:', error);
    return apiError(error.message || 'Failed to create performance goal', 400);
  }
}
