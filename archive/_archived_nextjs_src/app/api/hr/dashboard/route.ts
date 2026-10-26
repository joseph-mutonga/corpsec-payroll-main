import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { apiError, apiSuccess, apiUnauthorized } from '@/lib/response';
import { HRAnalyticsService } from '@/lib/hr/HRAnalyticsService';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    if (!session) return apiUnauthorized();

    const metrics = await HRAnalyticsService.getHRDashboardMetrics();
    return apiSuccess(metrics);
  } catch (error: any) {
    console.error('Error fetching HR dashboard metrics:', error);
    return apiError(error.message || 'Failed to fetch HR dashboard metrics');
  }
}
