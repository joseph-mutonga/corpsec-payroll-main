import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { PerformanceCycleService } from '@/lib/performance/PerformanceCycleService';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['performance.view', 'performance.cycles.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const cycle = await PerformanceCycleService.getCycleById(params.id);
    if (!cycle) return apiError('Performance cycle not found', 404);

    return apiSuccess({ cycle });
  } catch (error: any) {
    console.error('Error fetching performance cycle:', error);
    return apiError(error.message || 'Failed to fetch performance cycle', 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['performance.cycles.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    const updated = await PerformanceCycleService.updateCycle(
      params.id,
      {
        name: body.name,
        description: body.description,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        selfAssessmentDeadline: body.selfAssessmentDeadline
          ? new Date(body.selfAssessmentDeadline)
          : undefined,
        managerReviewDeadline: body.managerReviewDeadline
          ? new Date(body.managerReviewDeadline)
          : undefined,
        reviewDeadline: body.reviewDeadline ? new Date(body.reviewDeadline) : undefined,
        weightsConfig: body.weightsConfig,
        ratingScaleConfig: body.ratingScaleConfig,
      },
      auth.user.id
    );

    return apiSuccess({ cycle: updated }, 'Performance cycle updated successfully');
  } catch (error: any) {
    console.error('Error updating performance cycle:', error);
    return apiError(error.message || 'Failed to update performance cycle', 400);
  }
}
