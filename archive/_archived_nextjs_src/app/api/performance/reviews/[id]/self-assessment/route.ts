import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { ReviewService } from '@/lib/performance/ReviewService';
import { db } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const currentEmp = await db.employee.findFirst({ where: { userId: auth.user.id } });
    if (!currentEmp) {
      return apiError('Employee record not linked to current user account.', 400);
    }

    const body = await req.json();

    const updated = await ReviewService.submitSelfAssessment(
      params.id,
      {
        achievements: body.achievements,
        challenges: body.challenges,
        strengths: body.strengths,
        improvements: body.improvements,
        trainingNeeds: body.trainingNeeds,
        careerAspirations: body.careerAspirations,
        overallSelfScore:
          body.overallSelfScore !== undefined ? parseFloat(body.overallSelfScore) : undefined,
        goalRatings: body.goalRatings,
        competencyRatings: body.competencyRatings,
        isDraft: body.isDraft,
      },
      currentEmp.id
    );

    return apiSuccess(
      { review: updated },
      body.isDraft
        ? 'Self-assessment draft saved successfully'
        : 'Self-assessment submitted successfully'
    );
  } catch (error: any) {
    console.error('Error submitting self-assessment:', error);
    return apiError(error.message || 'Failed to submit self-assessment', 400);
  }
}
