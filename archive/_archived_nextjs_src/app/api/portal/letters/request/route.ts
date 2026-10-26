import { NextRequest } from 'next/server';
import { resolveSessionEmployee } from '@/lib/portal/PortalAuth';
import { HRRequestService } from '@/lib/portal/HRRequestService';
import { apiSuccess, apiError, apiBadRequest } from '@/lib/response';

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
      letterType, // 'PROOF_OF_EMPLOYMENT' | 'BANK_INTRODUCTION' | 'EMBASSY_VISA' | 'SALARY_CONFIRMATION' | 'OTHER'
      purpose,
      addressedTo,
      additionalNotes,
    } = body;

    if (!letterType || !purpose) {
      return apiBadRequest('Please specify the letter type and the purpose of the request.');
    }

    const letterTypeNames: Record<string, string> = {
      PROOF_OF_EMPLOYMENT: 'Proof of Employment Letter',
      BANK_INTRODUCTION: 'Bank Account Introduction Letter',
      EMBASSY_VISA: 'Embassy / Visa Application Letter',
      SALARY_CONFIRMATION: 'Salary Confirmation Letter',
      OTHER: 'General HR Recommendation Letter',
    };

    const friendlyName = letterTypeNames[letterType] || 'Employment Letter';

    const proposedData = {
      letterType,
      letterTitle: friendlyName,
      purpose,
      addressedTo: addressedTo || 'To Whom It May Concern',
      additionalNotes: additionalNotes || null,
    };

    const hrRequest = await HRRequestService.createRequest({
      employeeId: employee.id,
      requestType: 'EMPLOYMENT_LETTER',
      subject: `Official Letter Request: ${friendlyName}`,
      description: `Purpose: ${purpose}. Addressed to: ${addressedTo || 'To Whom It May Concern'}. ${additionalNotes ? `Notes: ${additionalNotes}` : ''}`,
      priority: 'MEDIUM',
      proposedData,
    });

    return apiSuccess(
      hrRequest,
      'Employment letter request submitted successfully. HR Operations will verify and prepare the document.'
    );
  } catch (error: any) {
    console.error('Error submitting employment letter request:', error);
    return apiError(error.message || 'Failed to submit letter request');
  }
}
