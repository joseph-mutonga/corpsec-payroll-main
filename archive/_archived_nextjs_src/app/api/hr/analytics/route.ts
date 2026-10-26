import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { apiError, apiSuccess, apiUnauthorized } from '@/lib/response';
import { HRAnalyticsService } from '@/lib/hr/HRAnalyticsService';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    if (!session) return apiUnauthorized();

    const analytics = await HRAnalyticsService.getWorkforceAnalytics();
    return apiSuccess(analytics);
  } catch (error: any) {
    console.error('Error fetching HR workforce analytics:', error);
    return apiError(error.message || 'Failed to fetch workforce analytics');
  }
}
