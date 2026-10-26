import { NextRequest } from 'next/server';
import { VacancyService } from '@/lib/recruitment/VacancyService';
import { apiNotFound, apiError, apiSuccess } from '@/lib/response';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const vacancy = await VacancyService.getPublicVacancyDetail(params.id);
    if (!vacancy) {
      return apiNotFound('Vacancy not found or is no longer accepting applications.');
    }

    return apiSuccess({ vacancy });
  } catch (error: any) {
    console.error('Error fetching public vacancy detail:', error);
    return apiError(error.message || 'Failed to fetch vacancy details', 500);
  }
}
