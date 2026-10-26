import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { PerformanceCycleService } from '@/lib/performance/PerformanceCycleService';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['performance.cycles.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    if (!body.status) {
      return apiError('Target status is required.', 400);
    }

    const updated = await PerformanceCycleService.updateCycleStatus(
      params.id,
      body.status,
      auth.user.id
    );

    return apiSuccess({ cycle: updated }, `Performance cycle status changed to ${body.status}`);
  } catch (error: any) {
    console.error('Error changing cycle status:', error);
    return apiError(error.message || 'Failed to change cycle status', 400);
  }
}
