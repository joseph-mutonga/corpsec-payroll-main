import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { InterviewService } from '@/lib/recruitment/InterviewService';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth('recruitment.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const vacancyId = searchParams.get('vacancyId') || undefined;
    const candidateId = searchParams.get('candidateId') || undefined;
    const status = searchParams.get('status') || undefined;

    const interviews = await InterviewService.getInterviews({
      vacancyId,
      candidateId,
      status,
    });

    return apiSuccess({ interviews, count: interviews.length });
  } catch (error: any) {
    console.error('Error fetching interviews:', error);
    return apiError(error.message || 'Failed to fetch interviews');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth('recruitment.interviews.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const {
      candidateId,
      vacancyId,
      interviewType,
      scheduledDate,
      startTime,
      endTime,
      location,
      meetingLink,
      notes,
      panelMemberIds,
      advanceStage,
    } = body;

    if (!candidateId || !vacancyId || !scheduledDate || !startTime || !endTime) {
      return apiBadRequest('Candidate, vacancy, scheduled date, and start/end times are required.');
    }

    const interview = await InterviewService.scheduleInterview(
      {
        candidateId,
        vacancyId,
        interviewType,
        scheduledDate,
        startTime,
        endTime,
        location,
        meetingLink,
        notes,
        panelMemberIds,
        advanceStage: advanceStage ?? true,
      },
      auth.session.userId
    );

    return apiSuccess({ interview }, undefined, 201);
  } catch (error: any) {
    console.error('Error scheduling interview:', error);
    return apiBadRequest(error.message || 'Failed to schedule interview');
  }
}
