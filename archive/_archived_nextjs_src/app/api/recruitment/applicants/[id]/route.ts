import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { CandidateService } from '@/lib/recruitment/CandidateService';
import { apiBadRequest, apiNotFound, apiError, apiSuccess } from '@/lib/response';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth('recruitment.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const applicant = await CandidateService.getCandidateById(params.id);
    if (!applicant) return apiNotFound('Applicant not found');

    return apiSuccess({ applicant });
  } catch (error: any) {
    console.error('Error fetching applicant detail:', error);
    return apiError(error.message || 'Failed to fetch applicant detail');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth('recruitment.candidates.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const { currentStage, reason } = body;

    if (currentStage) {
      const updated = await CandidateService.updateCandidateStage(
        params.id,
        currentStage,
        reason,
        auth.session.userId
      );
      return apiSuccess({ applicant: updated });
    }

    return apiBadRequest('No valid update fields specified');
  } catch (error: any) {
    console.error('Error updating applicant:', error);
    return apiBadRequest(error.message || 'Failed to update applicant');
  }
}
