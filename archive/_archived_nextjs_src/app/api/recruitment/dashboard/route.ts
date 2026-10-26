import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { RecruitmentAnalyticsService } from '@/lib/recruitment/RecruitmentAnalyticsService';
import { apiError, apiSuccess } from '@/lib/response';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth('recruitment.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const data = await RecruitmentAnalyticsService.getDashboardStats();
    return apiSuccess(data);
  } catch (error: any) {
    console.error('Error fetching recruitment dashboard stats:', error);
    return apiError(error.message || 'Failed to fetch recruitment dashboard');
  }
}
