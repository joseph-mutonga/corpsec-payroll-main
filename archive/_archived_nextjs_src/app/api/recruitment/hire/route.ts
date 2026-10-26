import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { HiringService } from '@/lib/recruitment/HiringService';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth('recruitment.hire');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const {
      candidateId,
      nationalId,
      gender,
      dateOfBirth,
      startDate,
      departmentId,
      stationId,
      branchId,
      positionId,
      jobTitle,
      employmentType,
      basicSalary,
    } = body;

    if (!candidateId || !nationalId || !gender) {
      return apiBadRequest('Candidate ID, National ID number, and Gender are required.');
    }

    const result = await HiringService.convertCandidateToEmployee(
      {
        candidateId,
        nationalId,
        gender,
        dateOfBirth,
        startDate,
        departmentId,
        stationId,
        branchId,
        positionId,
        jobTitle,
        employmentType,
        basicSalary: basicSalary ? parseFloat(basicSalary) : undefined,
      },
      auth.session.userId
    );

    return apiSuccess({
      message: `Candidate successfully converted to Employee (${result.employee.employeeNumber}). Onboarding initiated.`,
      employee: result.employee,
      onboardingCase: result.onboardingCase,
    });
  } catch (error: any) {
    console.error('Error converting candidate to employee:', error);
    return apiBadRequest(error.message || 'Failed to convert candidate to employee');
  }
}
