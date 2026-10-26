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

    if (!body.concern || !body.explanation) {
      return apiError('Concern summary and detailed explanation are required.', 400);
    }

    const concern = await ReviewService.submitReviewConcern({
      reviewId: params.id,
      employeeId: currentEmp.id,
      concern: body.concern,
      explanation: body.explanation,
      supportingDocUrl: body.supportingDocUrl,
    });

    return apiSuccess({ concern }, 'Performance review concern raised successfully', 201);
  } catch (error: any) {
    console.error('Error raising review concern:', error);
    return apiError(error.message || 'Failed to raise review concern', 400);
  }
}
