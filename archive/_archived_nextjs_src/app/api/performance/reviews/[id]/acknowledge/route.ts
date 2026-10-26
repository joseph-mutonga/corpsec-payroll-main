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

    const updated = await ReviewService.acknowledgeReview(
      params.id,
      { acknowledgementComment: body.acknowledgementComment },
      currentEmp.id
    );

    return apiSuccess({ review: updated }, 'Performance review acknowledged successfully');
  } catch (error: any) {
    console.error('Error acknowledging performance review:', error);
    return apiError(error.message || 'Failed to acknowledge performance review', 400);
  }
}
