import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { CandidateService } from '@/lib/recruitment/CandidateService';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth('recruitment.candidates.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const { candidateId, toStage, reason } = body;

    if (!candidateId || !toStage) {
      return apiBadRequest('candidateId and toStage are required.');
    }

    const updated = await CandidateService.updateCandidateStage(
      candidateId,
      toStage,
      reason,
      auth.session.userId
    );

    return apiSuccess({
      candidate: updated,
      message: `Candidate moved to ${toStage} successfully.`,
    });
  } catch (error: any) {
    console.error('Error updating candidate stage:', error);
    return apiBadRequest(error.message || 'Failed to update candidate stage');
  }
}
