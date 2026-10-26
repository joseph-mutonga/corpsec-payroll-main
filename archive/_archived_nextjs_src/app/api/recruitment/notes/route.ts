import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { CandidateService } from '@/lib/recruitment/CandidateService';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth('recruitment.candidates.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const { candidateId, note } = body;

    if (!candidateId || !note) {
      return apiBadRequest('candidateId and note text are required.');
    }

    const createdNote = await CandidateService.addInternalNote(
      candidateId,
      note,
      auth.session.userId
    );

    return apiSuccess({ note: createdNote }, undefined, 201);
  } catch (error: any) {
    console.error('Error adding internal recruiter note:', error);
    return apiBadRequest(error.message || 'Failed to add note');
  }
}
