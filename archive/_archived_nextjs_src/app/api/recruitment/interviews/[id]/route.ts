import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { InterviewService } from '@/lib/recruitment/InterviewService';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth('recruitment.interviews.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const { status, notes } = body;

    if (!status) {
      return apiBadRequest('Status is required.');
    }

    const updated = await InterviewService.updateInterviewStatus(
      params.id,
      status,
      notes,
      auth.session.userId
    );

    return apiSuccess({ interview: updated });
  } catch (error: any) {
    console.error('Error updating interview:', error);
    return apiBadRequest(error.message || 'Failed to update interview');
  }
}
