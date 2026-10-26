import { NextRequest } from 'next/server';
import { VacancyService } from '@/lib/recruitment/VacancyService';
import { apiError, apiSuccess } from '@/lib/response';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const departmentId = searchParams.get('departmentId') || undefined;
    const stationId = searchParams.get('stationId') || undefined;
    const employmentType = searchParams.get('employmentType') || undefined;
    const search = searchParams.get('search') || undefined;

    const vacancies = await VacancyService.getPublicVacancies({
      departmentId,
      stationId,
      employmentType,
      search,
    });

    return apiSuccess({ vacancies, count: vacancies.length });
  } catch (error: any) {
    console.error('Error fetching public careers vacancies:', error);
    return apiError(error.message || 'Failed to fetch open vacancies', 500);
  }
}
