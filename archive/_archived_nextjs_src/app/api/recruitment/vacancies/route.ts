import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { VacancyService } from '@/lib/recruitment/VacancyService';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth('recruitment.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;
    const stationId = searchParams.get('stationId') || undefined;
    const employmentType = searchParams.get('employmentType') || undefined;
    const search = searchParams.get('search') || undefined;

    const vacancies = await VacancyService.getVacancies({
      status,
      departmentId,
      stationId,
      employmentType,
      search,
    });

    return apiSuccess({ vacancies, count: vacancies.length });
  } catch (error: any) {
    console.error('Error fetching vacancies:', error);
    return apiError(error.message || 'Failed to fetch vacancies');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth('recruitment.vacancies.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const {
      title,
      departmentId,
      branchId,
      stationId,
      positionId,
      employmentType,
      openingsCount,
      description,
      responsibilities,
      requirements,
      qualifications,
      skillsRequired,
      experienceYears,
      minSalary,
      maxSalary,
      showSalaryPublicly,
      applicationDeadline,
      hiringManagerId,
      assignedRecruiterId,
      status,
    } = body;

    if (!title || !departmentId || !description) {
      return apiBadRequest('Job title, department, and description are required.');
    }

    const vacancy = await VacancyService.createVacancy(
      {
        title,
        departmentId,
        branchId,
        stationId,
        positionId,
        employmentType,
        openingsCount: openingsCount ? parseInt(openingsCount, 10) : 1,
        description,
        responsibilities,
        requirements,
        qualifications,
        skillsRequired,
        experienceYears: experienceYears ? parseFloat(experienceYears) : undefined,
        minSalary: minSalary ? parseFloat(minSalary) : undefined,
        maxSalary: maxSalary ? parseFloat(maxSalary) : undefined,
        showSalaryPublicly: Boolean(showSalaryPublicly),
        applicationDeadline,
        hiringManagerId,
        assignedRecruiterId: assignedRecruiterId || auth.session.userId,
        status,
      },
      auth.session.userId
    );

    return apiSuccess({ vacancy }, undefined, 201);
  } catch (error: any) {
    console.error('Error creating vacancy:', error);
    return apiBadRequest(error.message || 'Failed to create vacancy');
  }
}
