import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { CandidateService } from '@/lib/recruitment/CandidateService';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth('recruitment.candidates.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const { candidateId, type, subject, summary } = body;

    if (!candidateId || !type || !subject || !summary) {
      return apiBadRequest('candidateId, type, subject, and summary are required.');
    }

    const comm = await CandidateService.addCommunication(
      candidateId,
      type,
      subject,
      summary,
      auth.session.userId
    );

    return apiSuccess({ communication: comm }, undefined, 201);
  } catch (error: any) {
    console.error('Error adding communication log:', error);
    return apiBadRequest(error.message || 'Failed to add communication log');
  }
}
