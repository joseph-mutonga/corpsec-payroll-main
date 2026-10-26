import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { InterviewService } from '@/lib/recruitment/InterviewService';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth('recruitment.interviews.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const { scores, overallRecommendation, panelComments, interviewerId } = body;

    if (!scores || !Array.isArray(scores) || scores.length === 0) {
      return apiBadRequest('Scores array with categories and ratings is required.');
    }

    const result = await InterviewService.submitScorecard(
      {
        interviewId: params.id,
        interviewerId: interviewerId || auth.session.userId,
        scores,
        overallRecommendation,
        panelComments,
      },
      auth.session.userId
    );

    return apiSuccess(result);
  } catch (error: any) {
    console.error('Error submitting interview scorecard:', error);
    return apiBadRequest(error.message || 'Failed to submit interview scorecard');
  }
}
