import { NextRequest } from 'next/server';
import { resolveSessionEmployee } from '@/lib/portal/PortalAuth';
import { HRRequestService } from '@/lib/portal/HRRequestService';
import { apiSuccess, apiError, apiBadRequest } from '@/lib/response';
import { HRRequestType } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authContext = await resolveSessionEmployee();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { employee } = authContext;
    const body = await request.json();

    const {
      changeCategory, // 'CONTACT' | 'BANK' | 'MPESA' | 'OTHER'
      subject,
      description,
      proposedData,
    } = body;

    if (!description || !description.trim()) {
      return apiBadRequest('Please provide a description and justification for the change request.');
    }

    let requestType: HRRequestType = 'PROFILE_UPDATE';
    if (changeCategory === 'BANK') {
      requestType = 'BANK_DETAILS_CHANGE';
    } else if (changeCategory === 'MPESA') {
      requestType = 'MPESA_CHANGE';
    }

    // Capture previous data
    const previousData: Record<string, any> = {
      primaryPhone: employee.primaryPhone,
      alternativePhone: employee.alternativePhone,
      email: employee.email,
      physicalAddress: employee.physicalAddress,
      preferredPaymentMethod: employee.preferredPaymentMethod,
      bankName: employee.bankName,
      bankAccountName: employee.bankAccountName,
      bankAccountNumber: employee.bankAccountNumber,
      mpesaPhoneNumber: employee.mpesaPhoneNumber,
    };

    const hrRequest = await HRRequestService.createRequest({
      employeeId: employee.id,
      requestType,
      subject: subject || `Profile Change Request: ${requestType.replace(/_/g, ' ')}`,
      description,
      priority: 'MEDIUM',
      proposedData: proposedData || {},
      previousData,
    });

    return apiSuccess(
      hrRequest,
      'Change request submitted successfully. It will be reviewed by HR Operations before updates are applied.'
    );
  } catch (error: any) {
    console.error('Error creating profile change request:', error);
    return apiError(error.message || 'Failed to submit profile change request');
  }
}
