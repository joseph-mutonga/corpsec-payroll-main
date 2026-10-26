import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { ReviewService } from '@/lib/performance/ReviewService';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['performance.calibrate']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    if (body.calibratedScore === undefined || !body.calibrationComment) {
      return apiError('Calibrated score and calibration justification comment are required.', 400);
    }

    const updated = await ReviewService.calibrateReview(
      params.id,
      {
        calibratedScore: parseFloat(body.calibratedScore),
        calibratedRating: body.calibratedRating,
        calibrationComment: body.calibrationComment,
      },
      auth.user.id
    );

    return apiSuccess({ review: updated }, 'Performance review calibrated successfully');
  } catch (error: any) {
    console.error('Error calibrating performance review:', error);
    return apiError(error.message || 'Failed to calibrate performance review', 400);
  }
}
