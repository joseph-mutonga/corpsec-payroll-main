import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { db } from '@/lib/db';
import { InterviewService } from '@/lib/recruitment/InterviewService';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth('recruitment.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const candidateId = searchParams.get('candidateId') || undefined;
    const result = searchParams.get('result') || undefined;

    const where: any = {};
    if (candidateId && candidateId !== 'ALL') where.candidateId = candidateId;
    if (result && result !== 'ALL') where.result = result;

    const assessments = await db.candidateAssessment.findMany({
      where,
      include: {
        candidate: { select: { id: true, fullName: true, applicationNumber: true } },
        evaluator: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { conductedDate: 'desc' },
    });

    return apiSuccess({ assessments, count: assessments.length });
  } catch (error: any) {
    console.error('Error fetching assessments:', error);
    return apiError(error.message || 'Failed to fetch assessments');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth('recruitment.assessments.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const {
      candidateId,
      assessmentType,
      title,
      conductedDate,
      score,
      maxScore,
      result,
      evaluatorId,
      comments,
      attachmentUrl,
    } = body;

    if (!candidateId || !assessmentType || !title || !conductedDate || !result) {
      return apiBadRequest('Candidate ID, assessment type, title, date, and result (PASS/FAIL/PENDING) are required.');
    }

    const assessment = await InterviewService.recordAssessment(
      {
        candidateId,
        assessmentType,
        title,
        conductedDate,
        score: score ? parseFloat(score) : undefined,
        maxScore: maxScore ? parseFloat(maxScore) : 100,
        result,
        evaluatorId: evaluatorId || auth.session.userId,
        comments,
        attachmentUrl,
      },
      auth.session.userId
    );

    return apiSuccess({ assessment }, undefined, 201);
  } catch (error: any) {
    console.error('Error recording assessment:', error);
    return apiBadRequest(error.message || 'Failed to record assessment');
  }
}
