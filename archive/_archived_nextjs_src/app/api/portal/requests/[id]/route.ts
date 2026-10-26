import { NextRequest } from 'next/server';
import { resolveSessionEmployee } from '@/lib/portal/PortalAuth';
import { HRRequestService } from '@/lib/portal/HRRequestService';
import { apiSuccess, apiError, apiNotFound, apiForbidden } from '@/lib/response';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authContext = await resolveSessionEmployee();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { employee, isHRAdmin } = authContext;
    const requestId = params.id;

    const hrRequest = await HRRequestService.getRequestById(requestId, false); // false = scrub internal notes

    if (!hrRequest) {
      return apiNotFound('HR request not found');
    }

    // IDOR Protection: Non-HR employee can only access their own request
    if (!isHRAdmin && hrRequest.employeeId !== employee.id) {
      return apiForbidden("Access Denied: You cannot view another employee's HR request.");
    }

    return apiSuccess(hrRequest);
  } catch (error: any) {
    console.error('Error fetching HR request detail:', error);
    return apiError(error.message || 'Failed to load request detail');
  }
}
