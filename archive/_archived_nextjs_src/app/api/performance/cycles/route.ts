import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { PerformanceCycleService } from '@/lib/performance/PerformanceCycleService';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['performance.view', 'performance.cycles.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;

    const cycles = await PerformanceCycleService.listCycles({ status });
    return apiSuccess({ cycles });
  } catch (error: any) {
    console.error('Error listing performance cycles:', error);
    return apiError(error.message || 'Failed to list performance cycles', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['performance.cycles.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    if (!body.name || !body.startDate || !body.endDate) {
      return apiError('Name, start date, and end date are required.', 400);
    }

    const cycle = await PerformanceCycleService.createCycle({
      name: body.name,
      description: body.description,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      selfAssessmentDeadline: new Date(body.selfAssessmentDeadline || body.endDate),
      managerReviewDeadline: new Date(body.managerReviewDeadline || body.endDate),
      reviewDeadline: new Date(body.reviewDeadline || body.endDate),
      weightsConfig: body.weightsConfig,
      ratingScaleConfig: body.ratingScaleConfig,
      createdById: auth.user.id,
    });

    return apiSuccess({ cycle }, 'Performance cycle created successfully', 201);
  } catch (error: any) {
    console.error('Error creating performance cycle:', error);
    return apiError(error.message || 'Failed to create performance cycle', 400);
  }
}
