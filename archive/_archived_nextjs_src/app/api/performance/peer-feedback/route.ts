import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { CompetencyService } from '@/lib/performance/CompetencyService';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId');
    const cycleId = searchParams.get('cycleId') || undefined;

    if (!employeeId) {
      return apiError('employeeId query parameter is required.', 400);
    }

    const currentEmp = await db.employee.findFirst({ where: { userId: auth.user.id } });
    const isHrAdmin = auth.session.roles.includes('hr_admin') || auth.session.roles.includes('super_admin');

    const feedbacks = await CompetencyService.listPeerFeedbackForEmployee(
      employeeId,
      cycleId,
      currentEmp?.id,
      isHrAdmin
    );

    return apiSuccess({ feedbacks });
  } catch (error: any) {
    console.error('Error fetching peer feedback:', error);
    return apiError(error.message || 'Failed to fetch peer feedback', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    let reviewerId = body.reviewerId;
    if (!reviewerId) {
      const currentEmp = await db.employee.findFirst({ where: { userId: auth.user.id } });
      if (currentEmp) reviewerId = currentEmp.id;
    }

    if (!reviewerId || !body.employeeId || !body.cycleId || !body.generalComments) {
      return apiError('reviewerId, employeeId, cycleId, and generalComments are required.', 400);
    }

    const feedback = await CompetencyService.submitPeerFeedback({
      cycleId: body.cycleId,
      employeeId: body.employeeId,
      reviewerId,
      competencyId: body.competencyId,
      isAnonymous: body.isAnonymous !== undefined ? body.isAnonymous : true,
      rating: body.rating !== undefined ? parseFloat(body.rating) : undefined,
      strengths: body.strengths,
      improvements: body.improvements,
      generalComments: body.generalComments,
    });

    return apiSuccess({ feedback }, 'Peer feedback submitted successfully', 201);
  } catch (error: any) {
    console.error('Error submitting peer feedback:', error);
    return apiError(error.message || 'Failed to submit peer feedback', 400);
  }
}
