import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { ReviewService } from '@/lib/performance/ReviewService';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['performance.reviews.evaluate', 'performance.reviews.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    const updated = await ReviewService.submitManagerReview(
      params.id,
      {
        managerStrengths: body.managerStrengths,
        managerImprovements: body.managerImprovements,
        managerRecommendation: body.managerRecommendation,
        goalRatings: body.goalRatings,
        competencyRatings: body.competencyRatings,
        targetStatus: body.targetStatus,
      },
      auth.user.id
    );

    return apiSuccess({ review: updated }, 'Manager performance review submitted successfully');
  } catch (error: any) {
    console.error('Error submitting manager review:', error);
    return apiError(error.message || 'Failed to submit manager review', 400);
  }
}
