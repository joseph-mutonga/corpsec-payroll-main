import { NextRequest } from 'next/server';
import { resolveSessionEmployee } from '@/lib/portal/PortalAuth';
import { HRRequestService } from '@/lib/portal/HRRequestService';
import { apiSuccess, apiError, apiBadRequest } from '@/lib/response';
import { HRRequestType, HRRequestPriority } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authContext = await resolveSessionEmployee();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { employee } = authContext;
    const requests = await HRRequestService.getEmployeeRequests(employee.id);

    return apiSuccess(requests);
  } catch (error: any) {
    console.error('Error fetching employee HR requests:', error);
    return apiError(error.message || 'Failed to load employee requests');
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await resolveSessionEmployee();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { employee } = authContext;
    const body = await request.json();

    const {
      requestType,
      subject,
      description,
      priority = 'MEDIUM',
      proposedData,
    } = body;

    if (!requestType || !subject || !description) {
      return apiBadRequest('Please provide request type, subject, and description.');
    }

    const hrRequest = await HRRequestService.createRequest({
      employeeId: employee.id,
      requestType: requestType as HRRequestType,
      subject: subject.trim(),
      description: description.trim(),
      priority: priority as HRRequestPriority,
      proposedData: proposedData || null,
    });

    return apiSuccess(hrRequest, 'HR request submitted successfully. You can track updates here.');
  } catch (error: any) {
    console.error('Error submitting HR request:', error);
    return apiError(error.message || 'Failed to submit HR request');
  }
}
