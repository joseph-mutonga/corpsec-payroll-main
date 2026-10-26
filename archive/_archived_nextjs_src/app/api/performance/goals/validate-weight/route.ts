import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { GoalService } from '@/lib/performance/GoalService';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId');
    const cycleId = searchParams.get('cycleId');
    const excludeGoalId = searchParams.get('excludeGoalId') || undefined;

    if (!employeeId || !cycleId) {
      return apiError('employeeId and cycleId are required query parameters.', 400);
    }

    const validation = await GoalService.validateEmployeeGoalWeights(
      employeeId,
      cycleId,
      excludeGoalId
    );

    return apiSuccess(validation);
  } catch (error: any) {
    console.error('Error validating goal weights:', error);
    return apiError(error.message || 'Failed to validate goal weights', 500);
  }
}
