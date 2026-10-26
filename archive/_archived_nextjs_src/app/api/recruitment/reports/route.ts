import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { RecruitmentAnalyticsService } from '@/lib/recruitment/RecruitmentAnalyticsService';
import { apiError, apiSuccess } from '@/lib/response';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth('recruitment.reports.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const departmentId = searchParams.get('departmentId') || undefined;
    const stationId = searchParams.get('stationId') || undefined;

    const report = await RecruitmentAnalyticsService.getRecruitmentReports({
      departmentId,
      stationId,
    });

    return apiSuccess(report);
  } catch (error: any) {
    console.error('Error fetching recruitment reports:', error);
    return apiError(error.message || 'Failed to fetch recruitment reports');
  }
}
