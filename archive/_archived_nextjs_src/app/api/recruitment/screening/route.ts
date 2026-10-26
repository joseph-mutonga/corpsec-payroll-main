import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { CandidateService } from '@/lib/recruitment/CandidateService';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth('recruitment.candidates.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const {
      candidateId,
      screeningStatus,
      screeningScore,
      screeningStrengths,
      screeningWeaknesses,
      screeningNotes,
      rejectionReason,
      advanceToStage,
    } = body;

    if (!candidateId || !screeningStatus) {
      return apiBadRequest('candidateId and screeningStatus (PASS, FAIL, HOLD) are required.');
    }

    const candidate = await CandidateService.recordScreening(
      {
        candidateId,
        screeningStatus,
        screeningScore: screeningScore !== undefined ? parseFloat(screeningScore) : undefined,
        screeningStrengths,
        screeningWeaknesses,
        screeningNotes,
        rejectionReason,
        advanceToStage,
      },
      auth.session.userId
    );

    return apiSuccess({ candidate, message: 'Screening evaluation recorded successfully.' });
  } catch (error: any) {
    console.error('Error recording screening evaluation:', error);
    return apiBadRequest(error.message || 'Failed to record screening evaluation');
  }
}
