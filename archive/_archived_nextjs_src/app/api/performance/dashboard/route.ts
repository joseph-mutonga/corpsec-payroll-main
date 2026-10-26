import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { PerformanceAnalyticsService } from '@/lib/performance/PerformanceAnalyticsService';

export async function GET() {
  try {
    const auth = await requireAuth(['performance.view', 'hr.analytics.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const data = await PerformanceAnalyticsService.getDashboardMetrics();
    const deptSummary = await PerformanceAnalyticsService.getDepartmentPerformanceSummary(data.activeCycle?.id);

    return apiSuccess({
      ...data,
      departmentSummary: deptSummary,
    });
  } catch (error: any) {
    console.error('Error fetching performance dashboard metrics:', error);
    return apiError(error.message || 'Failed to fetch performance dashboard metrics', 500);
  }
}
