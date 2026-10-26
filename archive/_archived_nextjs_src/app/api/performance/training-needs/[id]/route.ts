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

    if (!body.status) {
      return apiError('Training need status is required.', 400);
    }

    const updated = await DevelopmentService.updateTrainingNeedStatus(
      params.id,
      body.status,
      body.notes,
      auth.user.id
    );

    return apiSuccess({ trainingNeed: updated }, 'Training need status updated successfully');
  } catch (error: any) {
    console.error('Error updating training need status:', error);
    return apiError(error.message || 'Failed to update training need status', 400);
  }
}
