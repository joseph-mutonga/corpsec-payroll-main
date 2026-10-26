import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { VacancyService } from '@/lib/recruitment/VacancyService';
import { apiError, apiSuccess } from '@/lib/response';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth('recruitment.vacancies.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const cloned = await VacancyService.duplicateVacancy(params.id, auth.session.userId);
    return apiSuccess({ vacancy: cloned }, undefined, 201);
  } catch (error: any) {
    console.error('Error duplicating vacancy:', error);
    return apiError(error.message || 'Failed to duplicate vacancy');
  }
}
