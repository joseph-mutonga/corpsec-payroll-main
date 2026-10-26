import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { DevelopmentService } from '@/lib/performance/DevelopmentService';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    let employeeId = searchParams.get('employeeId');

    if (!employeeId) {
      const emp = await db.employee.findFirst({ where: { userId: auth.user.id } });
      if (emp) employeeId = emp.id;
    }

    if (!employeeId) return apiError('employeeId is required.', 400);

    const careerDevelopment = await DevelopmentService.getCareerDevelopment(employeeId);
    return apiSuccess({ careerDevelopment: careerDevelopment || null });
  } catch (error: any) {
    console.error('Error fetching career development:', error);
    return apiError(error.message || 'Failed to fetch career development', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    let employeeId = body.employeeId;
    if (!employeeId) {
      const emp = await db.employee.findFirst({ where: { userId: auth.user.id } });
      if (emp) employeeId = emp.id;
    }

    if (!employeeId) return apiError('employeeId is required.', 400);

    const updated = await DevelopmentService.upsertCareerDevelopment(employeeId, {
      careerGoals: body.careerGoals,
      skillsToDevelop: body.skillsToDevelop,
      desiredFutureRoles: body.desiredFutureRoles,
      developmentInterests: body.developmentInterests,
      mentorshipInterest: body.mentorshipInterest,
      mobilityPreference: body.mobilityPreference,
    });

    return apiSuccess({ careerDevelopment: updated }, 'Career development profile saved successfully');
  } catch (error: any) {
    console.error('Error saving career development profile:', error);
    return apiError(error.message || 'Failed to save career development profile', 400);
  }
}
