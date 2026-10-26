import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { HRRequestService } from '@/lib/portal/HRRequestService';
import { apiSuccess, apiError, apiNotFound, apiBadRequest } from '@/lib/response';
import { HRRequestStatus } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['hr_request.view', 'hr_request.manage']);
    if ('errorResponse' in auth) {
      return auth.errorResponse;
    }

    const requestId = params.id;
    const hrRequest = await HRRequestService.getRequestById(requestId, true); // true = include internal notes

    if (!hrRequest) {
      return apiNotFound('HR request not found');
    }

    return apiSuccess(hrRequest);
  } catch (error: any) {
    console.error('Error fetching HR request detail for management:', error);
    return apiError(error.message || 'Failed to load request');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['hr_request.manage']);
    if ('errorResponse' in auth) {
      return auth.errorResponse;
    }

    const { session } = auth;
    const requestId = params.id;
    const body = await request.json();

    const {
      status,
      employeeVisibleResponse,
      internalHrNotes,
      rejectionReason,
      assignedToId,
    } = body;

    if (!status) {
      return apiBadRequest('Please provide a status for the request update.');
    }

    const updated = await HRRequestService.reviewRequest({
      requestId,
      status: status as HRRequestStatus,
      employeeVisibleResponse,
      internalHrNotes,
      rejectionReason,
      assignedToId,
      reviewerUserId: session.userId,
    });

    return apiSuccess(
      updated,
      `Request ${updated.requestNumber} status updated to ${updated.status} successfully.`
    );
  } catch (error: any) {
    console.error('Error updating HR request:', error);
    return apiError(error.message || 'Failed to update request');
  }
}
