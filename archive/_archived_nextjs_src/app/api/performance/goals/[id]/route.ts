import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { GoalService } from '@/lib/performance/GoalService';
import { db } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const goal = await db.performanceGoal.findUnique({
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
        cycle: { select: { id: true, code: true, name: true } },
      },
    });
    if (!goal) return apiError('Performance goal not found', 404);

    return apiSuccess({ goal });
  } catch (error: any) {
    console.error('Error fetching performance goal:', error);
    return apiError(error.message || 'Failed to fetch performance goal', 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    const updated = await GoalService.updateGoal(
      params.id,
      {
        title: body.title,
        description: body.description,
        category: body.category,
        priority: body.priority,
        weight: body.weight !== undefined ? parseFloat(body.weight) : undefined,
        target: body.target,
        measurementMethod: body.measurementMethod,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        status: body.status,
        progressPercentage:
          body.progressPercentage !== undefined
            ? parseFloat(body.progressPercentage)
            : undefined,
        selfRating: body.selfRating !== undefined ? parseFloat(body.selfRating) : undefined,
        selfComment: body.selfComment,
        managerRating:
          body.managerRating !== undefined ? parseFloat(body.managerRating) : undefined,
        managerComment: body.managerComment,
      },
      auth.user.id
    );

    return apiSuccess({ goal: updated }, 'Performance goal updated successfully');
  } catch (error: any) {
    console.error('Error updating performance goal:', error);
    return apiError(error.message || 'Failed to update performance goal', 400);
  }
}
