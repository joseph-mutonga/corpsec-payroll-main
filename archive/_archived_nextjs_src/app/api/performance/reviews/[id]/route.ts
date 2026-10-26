import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { ReviewService } from '@/lib/performance/ReviewService';
import { db } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const currentEmp = await db.employee.findFirst({ where: { userId: auth.user.id } });
    const isHrAdmin =
      auth.session.roles.includes('hr_admin') || auth.session.roles.includes('super_admin');

    const review = await ReviewService.getReviewById(params.id, currentEmp?.id, isHrAdmin);
    if (!review) return apiError('Performance review not found', 404);

    // IDOR check: If employee is not an admin, manager, or owner, block access
    const isOwner = currentEmp && review.employeeId === currentEmp.id;
    const isReviewer = currentEmp && review.reviewerId === currentEmp.id;

    if (!isHrAdmin && !auth.session.roles.includes('hr_manager') && !isOwner && !isReviewer) {
      return apiError('You are not authorized to view this performance review record.', 403);
    }

    return apiSuccess({ review });
  } catch (error: any) {
    console.error('Error fetching performance review:', error);
    return apiError(error.message || 'Failed to fetch performance review', 500);
  }
}
