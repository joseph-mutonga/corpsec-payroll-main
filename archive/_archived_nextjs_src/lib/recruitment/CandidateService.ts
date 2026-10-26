import { db } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

export interface SubmitApplicationInput {
  vacancyId: string;
  fullName: string;
  email: string;
  phone: string;
  location?: string;
  currentOccupation?: string;
  experienceYears?: number;
  highestQualification?: string;
  skills?: string;
  relevantExperience?: string;
  coverLetter?: string;
  resumeUrl?: string;
  resumeFilename?: string;
  source?: string;
}

export interface RecordScreeningInput {
  candidateId: string;
  screeningStatus: 'PASS' | 'FAIL' | 'HOLD';
  screeningScore?: number;
  screeningStrengths?: string;
  screeningWeaknesses?: string;
  screeningNotes?: string;
  rejectionReason?: string;
  advanceToStage?: string;
}

export const VALID_RECRUITMENT_STAGES = [
  'APPLIED',
  'SCREENING',
  'SHORTLISTED',
  'INTERVIEW',
  'ASSESSMENT',
  'OFFER',
  'HIRED',
  'REJECTED',
] as const;

export class CandidateService {
  /**
   * Generates next sequential Application Number: CORPSEC-APP-YYYY-XXXXXX
   */
  static async generateApplicationNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `CORPSEC-APP-${year}-`;
    const lastCandidate = await db.candidate.findFirst({
      where: { applicationNumber: { startsWith: prefix } },
      orderBy: { applicationNumber: 'desc' },
      select: { applicationNumber: true },
    });

    let seq = 1;
    if (lastCandidate) {
      const parts = lastCandidate.applicationNumber.split('-');
      if (parts.length >= 4) {
        const num = parseInt(parts[3], 10);
        if (!isNaN(num)) seq = num + 1;
      }
    }
    return `${prefix}${String(seq).padStart(6, '0')}`;
  }

  /**
   * Submit job application via public careers portal
   */
  static async submitApplication(input: SubmitApplicationInput) {
    if (!input.vacancyId || !input.fullName || !input.email || !input.phone) {
      throw new Error('Full name, email, phone number, and vacancy ID are required.');
    }

    const emailNormalized = input.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailNormalized)) {
      throw new Error('Please provide a valid email address.');
    }

    // Verify Vacancy is OPEN and active
    const vacancy = await db.vacancy.findUnique({
      where: { id: input.vacancyId },
    });

    if (!vacancy || vacancy.status !== 'OPEN') {
      throw new Error('This vacancy is not accepting applications at this time.');
    }

    if (vacancy.applicationDeadline && new Date(vacancy.applicationDeadline) < new Date()) {
      throw new Error('The application deadline for this vacancy has passed.');
    }

    // Prevent duplicate applications
    const existing = await db.candidate.findFirst({
      where: {
        vacancyId: input.vacancyId,
        email: emailNormalized,
      },
    });

    if (existing) {
      throw new Error('An application with this email has already been submitted for this position.');
    }

    const applicationNumber = await this.generateApplicationNumber();

    const candidate = await db.candidate.create({
      data: {
        applicationNumber,
        vacancyId: input.vacancyId,
        fullName: input.fullName.trim(),
        email: emailNormalized,
        phone: input.phone.trim(),
        location: input.location,
        currentOccupation: input.currentOccupation,
        experienceYears: input.experienceYears,
        highestQualification: input.highestQualification,
        skills: input.skills,
        relevantExperience: input.relevantExperience,
        coverLetter: input.coverLetter,
        resumeUrl: input.resumeUrl,
        resumeFilename: input.resumeFilename,
        source: input.source || 'CAREERS_PAGE',
        currentStage: 'APPLIED',
        screeningStatus: 'PENDING',
        assignedRecruiterId: vacancy.assignedRecruiterId,
        stageHistories: {
          create: {
            fromStage: null,
            toStage: 'APPLIED',
            reason: 'Initial job application submitted via Careers Portal',
          },
        },
      },
      include: {
        vacancy: { select: { id: true, title: true, vacancyNumber: true } },
      },
    });

    return candidate;
  }

  static async getCandidates(filters?: {
    vacancyId?: string;
    stage?: string;
    screeningStatus?: string;
    stationId?: string;
    departmentId?: string;
    search?: string;
  }) {
    const where: any = {};
    if (filters?.vacancyId && filters.vacancyId !== 'ALL') where.vacancyId = filters.vacancyId;
    if (filters?.stage && filters.stage !== 'ALL') where.currentStage = filters.stage;
    if (filters?.screeningStatus && filters.screeningStatus !== 'ALL') where.screeningStatus = filters.screeningStatus;
    if (filters?.stationId && filters.stationId !== 'ALL') where.vacancy = { ...where.vacancy, stationId: filters.stationId };
    if (filters?.departmentId && filters.departmentId !== 'ALL') where.vacancy = { ...where.vacancy, departmentId: filters.departmentId };

    if (filters?.search) {
      where.OR = [
        { fullName: { contains: filters.search } },
        { email: { contains: filters.search } },
        { phone: { contains: filters.search } },
        { applicationNumber: { contains: filters.search } },
        { currentOccupation: { contains: filters.search } },
      ];
    }

    const candidates = await db.candidate.findMany({
      where,
      include: {
        vacancy: {
          select: {
            id: true,
            title: true,
            vacancyNumber: true,
            department: { select: { name: true } },
            station: { select: { name: true } },
          },
        },
        assignedRecruiter: { select: { id: true, firstName: true, lastName: true, email: true } },
        offers: {
          select: { id: true, status: true, proposedSalary: true, secureToken: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return candidates;
  }

  static async getCandidateById(id: string) {
    const candidate = await db.candidate.findUnique({
      where: { id },
      include: {
        vacancy: {
          include: {
            department: { select: { id: true, name: true, code: true } },
            station: { select: { id: true, name: true, code: true } },
            position: { select: { id: true, title: true, code: true } },
          },
        },
        assignedRecruiter: { select: { id: true, firstName: true, lastName: true, email: true } },
        employee: {
          select: { id: true, employeeNumber: true, fullName: true, employmentStatus: true },
        },
        stageHistories: {
          include: {
            changedBy: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        interviews: {
          include: {
            panelMembers: {
              include: { interviewer: { select: { id: true, firstName: true, lastName: true } } },
            },
            scorecards: true,
          },
          orderBy: { scheduledDate: 'desc' },
        },
        assessments: {
          include: {
            evaluator: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { conductedDate: 'desc' },
        },
        communications: {
          include: {
            performedBy: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { sentAt: 'desc' },
        },
        internalNotes: {
          include: {
            author: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
        },
        offers: {
          include: {
            approvedBy: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return candidate;
  }

  /**
   * Move candidate to another recruitment pipeline stage
   */
  static async updateCandidateStage(
    id: string,
    newStage: string,
    reason?: string,
    userId?: string
  ) {
    if (!VALID_RECRUITMENT_STAGES.includes(newStage as any)) {
      throw new Error(`Invalid recruitment stage: ${newStage}`);
    }

    const candidate = await db.candidate.findUnique({ where: { id } });
    if (!candidate) throw new Error('Candidate not found');

    const previousStage = candidate.currentStage;
    if (previousStage === newStage) {
      return candidate;
    }

    const updated = await db.candidate.update({
      where: { id },
      data: {
        currentStage: newStage,
        rejectionReason: newStage === 'REJECTED' ? reason : candidate.rejectionReason,
        stageHistories: {
          create: {
            fromStage: previousStage,
            toStage: newStage,
            reason: reason || `Transitioned from ${previousStage} to ${newStage}`,
            changedById: userId,
          },
        },
      },
      include: {
        vacancy: { select: { id: true, title: true } },
      },
    });

    if (userId) {
      await createAuditLog({
        userId,
        action: 'CANDIDATE_STAGE_CHANGE',
        module: 'RECRUITMENT',
        entityType: 'RECRUITMENT',
        entityId: id,
        previousValue: { stage: previousStage },
        newValue: { stage: newStage },
      });
    }

    return updated;
  }

  /**
   * Record HR Application Screening
   */
  static async recordScreening(input: RecordScreeningInput, userId?: string) {
    const candidate = await db.candidate.findUnique({ where: { id: input.candidateId } });
    if (!candidate) throw new Error('Candidate not found');

    const updateData: any = {
      screeningStatus: input.screeningStatus,
      screeningScore: input.screeningScore,
      screeningStrengths: input.screeningStrengths,
      screeningWeaknesses: input.screeningWeaknesses,
      screeningNotes: input.screeningNotes,
      rejectionReason: input.screeningStatus === 'FAIL' ? (input.rejectionReason || 'Failed initial screening') : undefined,
    };

    if (input.advanceToStage && VALID_RECRUITMENT_STAGES.includes(input.advanceToStage as any)) {
      updateData.currentStage = input.advanceToStage;
      updateData.stageHistories = {
        create: {
          fromStage: candidate.currentStage,
          toStage: input.advanceToStage,
          reason: `Screening evaluation result: ${input.screeningStatus} (Score: ${input.screeningScore || 'N/A'})`,
          changedById: userId,
        },
      };
    }

    const updated = await db.candidate.update({
      where: { id: input.candidateId },
      data: updateData,
    });

    if (userId) {
      await createAuditLog({
        userId,
        action: 'CANDIDATE_SCREENING',
        module: 'RECRUITMENT',
        entityType: 'RECRUITMENT',
        entityId: input.candidateId,
        newValue: { screeningStatus: input.screeningStatus, score: input.screeningScore },
      });
    }

    return updated;
  }

  static async addInternalNote(candidateId: string, note: string, authorId?: string) {
    if (!note.trim()) throw new Error('Note text cannot be empty');

    const internalNote = await db.candidateInternalNote.create({
      data: {
        candidateId,
        note: note.trim(),
        authorId,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return internalNote;
  }

  static async addCommunication(
    candidateId: string,
    type: string,
    subject: string,
    summary: string,
    performedById?: string
  ) {
    const comm = await db.candidateCommunication.create({
      data: {
        candidateId,
        type,
        subject,
        summary,
        performedById,
      },
      include: {
        performedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return comm;
  }
}
