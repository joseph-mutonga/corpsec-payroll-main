import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';
import { EmployeeLifecycleService } from '@/lib/hr/EmployeeLifecycleService';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth('hr.probation.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const probations = await EmployeeLifecycleService.getProbationPipeline();
    return apiSuccess(probations);
  } catch (error: any) {
    console.error('Error fetching probation list:', error);
    return apiError(error.message || 'Failed to fetch probation list');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth('hr.probation.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const { employeeId, outcome, newEndDate, reason } = body;

    if (!employeeId || !outcome || !['CONFIRM', 'EXTEND', 'FAIL'].includes(outcome)) {
      return apiBadRequest('employeeId and valid outcome (CONFIRM, EXTEND, FAIL) are required');
    }

    const updated = await EmployeeLifecycleService.recordProbationOutcome(
      employeeId,
      outcome,
      auth.session.userId,
      {
        newEndDate: newEndDate ? new Date(newEndDate) : undefined,
        reason: reason || `Probation ${outcome.toLowerCase()} decision recorded by HR.`,
      }
    );

    return apiSuccess(updated);
  } catch (error: any) {
    console.error('Error recording probation outcome:', error);
    return apiError(error.message || 'Failed to record probation outcome');
  }
}
