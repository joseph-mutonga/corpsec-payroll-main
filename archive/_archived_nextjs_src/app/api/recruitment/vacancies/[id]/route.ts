import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { VacancyService } from '@/lib/recruitment/VacancyService';
import { apiBadRequest, apiNotFound, apiError, apiSuccess } from '@/lib/response';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth('recruitment.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const vacancy = await VacancyService.getVacancyById(params.id);
    if (!vacancy) return apiNotFound('Vacancy not found');

    return apiSuccess({ vacancy });
  } catch (error: any) {
    console.error('Error fetching vacancy:', error);
    return apiError(error.message || 'Failed to fetch vacancy');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth('recruitment.vacancies.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const updated = await VacancyService.updateVacancy(params.id, body, auth.session.userId);

    return apiSuccess({ vacancy: updated });
  } catch (error: any) {
    console.error('Error updating vacancy:', error);
    return apiBadRequest(error.message || 'Failed to update vacancy');
  }
}
