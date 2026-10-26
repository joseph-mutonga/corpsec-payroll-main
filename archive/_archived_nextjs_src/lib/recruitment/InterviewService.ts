import { db } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

export interface ScheduleInterviewInput {
  candidateId: string;
  vacancyId: string;
  interviewType?: string;
  scheduledDate: Date | string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  location?: string;
  meetingLink?: string;
  notes?: string;
  panelMemberIds?: Array<{ interviewerId: string; role?: string }>;
  advanceStage?: boolean;
}

export interface SubmitScorecardInput {
  interviewId: string;
  interviewerId: string;
  scores: Array<{
    category: string;
    score: number; // 1 to 5
    comment?: string;
  }>;
  overallRecommendation?: 'HIRE' | 'HOLD' | 'REJECT';
  panelComments?: string;
}

export interface RecordAssessmentInput {
  candidateId: string;
  assessmentType: string;
  title: string;
  conductedDate: Date | string;
  score?: number;
  maxScore?: number;
  result: 'PASS' | 'FAIL' | 'PENDING';
  evaluatorId?: string;
  comments?: string;
  attachmentUrl?: string;
}

export class InterviewService {
  static async scheduleInterview(input: ScheduleInterviewInput, createdById?: string) {
    const candidate = await db.candidate.findUnique({ where: { id: input.candidateId } });
    if (!candidate) throw new Error('Candidate not found');

    const scheduledDate = new Date(input.scheduledDate);

    const interview = await db.interview.create({
      data: {
        candidateId: input.candidateId,
        vacancyId: input.vacancyId,
        interviewType: input.interviewType || 'PHONE',
        scheduledDate,
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location,
        meetingLink: input.meetingLink,
        notes: input.notes,
        createdById,
        status: 'SCHEDULED',
        panelMembers: input.panelMemberIds?.length
          ? {
              create: input.panelMemberIds.map((p) => ({
                interviewerId: p.interviewerId,
                role: p.role || 'Interviewer',
              })),
            }
          : undefined,
      },
      include: {
        candidate: { select: { id: true, fullName: true, applicationNumber: true } },
        vacancy: { select: { id: true, title: true } },
        panelMembers: {
          include: { interviewer: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
      },
    });

    if (input.advanceStage && candidate.currentStage !== 'INTERVIEW') {
      await db.candidate.update({
        where: { id: input.candidateId },
        data: {
          currentStage: 'INTERVIEW',
          stageHistories: {
            create: {
              fromStage: candidate.currentStage,
              toStage: 'INTERVIEW',
              reason: `Interview scheduled (${input.interviewType || 'PHONE'}) on ${scheduledDate.toISOString().split('T')[0]} at ${input.startTime}`,
              changedById: createdById,
            },
          },
        },
      });
    }

    if (createdById) {
      await createAuditLog({
        userId: createdById,
        action: 'INTERVIEW_SCHEDULE',
        module: 'RECRUITMENT',
        entityType: 'RECRUITMENT',
        entityId: interview.id,
        newValue: { interviewType: interview.interviewType, scheduledDate: input.scheduledDate },
      });
    }

    return interview;
  }

  static async updateInterviewStatus(
    id: string,
    status: string,
    notes?: string,
    userId?: string
  ) {
    const interview = await db.interview.findUnique({
      where: { id },
      include: { candidate: true },
    });
    if (!interview) throw new Error('Interview not found');

    const updated = await db.interview.update({
      where: { id },
      data: {
        status,
        notes: notes ? `${interview.notes ? interview.notes + '\n' : ''}${notes}` : interview.notes,
      },
    });

    if (userId) {
      await createAuditLog({
        userId,
        action: 'INTERVIEW_STATUS_UPDATE',
        module: 'RECRUITMENT',
        entityType: 'RECRUITMENT',
        entityId: id,
        newValue: { status },
      });
    }

    return updated;
  }

  static async submitScorecard(input: SubmitScorecardInput, currentUserId?: string) {
    const interview = await db.interview.findUnique({
      where: { id: input.interviewId },
      include: { candidate: true },
    });
    if (!interview) throw new Error('Interview not found');

    // Create or update scorecard entries
    for (const sc of input.scores) {
      await db.interviewScorecard.create({
        data: {
          interviewId: input.interviewId,
          interviewerId: input.interviewerId,
          category: sc.category,
          score: sc.score,
          comment: sc.comment,
        },
      });
    }

    // Compute average score
    const total = input.scores.reduce((acc, curr) => acc + curr.score, 0);
    const avgScore = parseFloat((total / input.scores.length).toFixed(1));

    // Update panel member record
    await db.interviewPanelMember.updateMany({
      where: {
        interviewId: input.interviewId,
        interviewerId: input.interviewerId,
      },
      data: {
        overallScore: avgScore,
        recommendation: input.overallRecommendation,
        comments: input.panelComments,
        submittedAt: new Date(),
      },
    });

    if (currentUserId) {
      await createAuditLog({
        userId: currentUserId,
        action: 'SCORECARD_SUBMIT',
        module: 'RECRUITMENT',
        entityType: 'RECRUITMENT',
        entityId: input.interviewId,
        newValue: { avgScore, recommendation: input.overallRecommendation },
      });
    }

    return { success: true, averageScore: avgScore, recommendation: input.overallRecommendation };
  }

  static async recordAssessment(input: RecordAssessmentInput, createdById?: string) {
    const candidate = await db.candidate.findUnique({ where: { id: input.candidateId } });
    if (!candidate) throw new Error('Candidate not found');

    const assessment = await db.candidateAssessment.create({
      data: {
        candidateId: input.candidateId,
        assessmentType: input.assessmentType,
        title: input.title,
        conductedDate: new Date(input.conductedDate),
        score: input.score,
        maxScore: input.maxScore || 100,
        result: input.result,
        evaluatorId: input.evaluatorId || createdById,
        comments: input.comments,
        attachmentUrl: input.attachmentUrl,
      },
      include: {
        evaluator: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (createdById) {
      await createAuditLog({
        userId: createdById,
        action: 'ASSESSMENT_RECORD',
        module: 'RECRUITMENT',
        entityType: 'RECRUITMENT',
        entityId: assessment.id,
        newValue: { title: input.title, result: input.result, score: input.score },
      });
    }

    return assessment;
  }

  static async getInterviews(filters?: {
    vacancyId?: string;
    candidateId?: string;
    status?: string;
  }) {
    const where: any = {};
    if (filters?.vacancyId && filters.vacancyId !== 'ALL') where.vacancyId = filters.vacancyId;
    if (filters?.candidateId && filters.candidateId !== 'ALL') where.candidateId = filters.candidateId;
    if (filters?.status && filters.status !== 'ALL') where.status = filters.status;

    return db.interview.findMany({
      where,
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            applicationNumber: true,
            email: true,
            phone: true,
          },
        },
        vacancy: { select: { id: true, title: true, vacancyNumber: true } },
        panelMembers: {
          include: { interviewer: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
        scorecards: true,
      },
      orderBy: { scheduledDate: 'desc' },
    });
  }
}
