import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { DevelopmentService } from '@/lib/performance/DevelopmentService';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    const updated = await DevelopmentService.updateDevelopmentPlan(
      params.id,
      {
        objective: body.objective,
        skillGap: body.skillGap,
        action: body.action,
        owner: body.owner,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        targetDate: body.targetDate ? new Date(body.targetDate) : undefined,
        status: body.status,
        completionPercentage:
          body.completionPercentage !== undefined
            ? parseFloat(body.completionPercentage)
            : undefined,
        outcomeNotes: body.outcomeNotes,
      },
      auth.user.id
    );

    return apiSuccess({ plan: updated }, 'Development plan updated successfully');
  } catch (error: any) {
    console.error('Error updating development plan:', error);
    return apiError(error.message || 'Failed to update development plan', 400);
  }
}
