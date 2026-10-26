import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { CandidateService } from '@/lib/recruitment/CandidateService';
import { apiError, apiSuccess } from '@/lib/response';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth('recruitment.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const vacancyId = searchParams.get('vacancyId') || undefined;
    const stage = searchParams.get('stage') || undefined;
    const screeningStatus = searchParams.get('screeningStatus') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;
    const stationId = searchParams.get('stationId') || undefined;
    const search = searchParams.get('search') || undefined;

    const applicants = await CandidateService.getCandidates({
      vacancyId,
      stage,
      screeningStatus,
      departmentId,
      stationId,
      search,
    });

    return apiSuccess({ applicants, count: applicants.length });
  } catch (error: any) {
    console.error('Error fetching applicants:', error);
    return apiError(error.message || 'Failed to fetch applicants');
  }
}
