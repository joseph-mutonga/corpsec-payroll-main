import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export const DEFAULT_COMPETENCIES = [
  {
    code: 'COMP-COMM',
    name: 'Effective Communication',
    description: 'Articulates information clearly, concisely, and professionally across radio, written incident logs, and verbal reports.',
    category: 'CORE',
    defaultWeight: 15,
  },
  {
    code: 'COMP-VIGIL',
    name: 'Vigilance & Situational Awareness',
    description: 'Maintains active alertness, detects security anomalies proactively, and acts swiftly to de-escalate safety risks.',
    category: 'CORE',
    defaultWeight: 20,
  },
  {
    code: 'COMP-INTEG',
    name: 'Integrity, Ethics & Compliance',
    description: 'Upholds CorpSec standing orders, strictly adheres to post SOPs, and protects client confidentiality and assets.',
    category: 'CORE',
    defaultWeight: 20,
  },
  {
    code: 'COMP-TEAM',
    name: 'Teamwork & Collaboration',
    description: 'Works harmoniously with shift partners, supports team members during emergency drills, and fosters morale.',
    category: 'CORE',
    defaultWeight: 15,
  },
  {
    code: 'COMP-RELIAB',
    name: 'Reliability & Punctuality',
    description: 'Demonstrates impeccable attendance, adheres to shift schedules without unexcused tardiness, and follows through on commitments.',
    category: 'CORE',
    defaultWeight: 15,
  },
  {
    code: 'COMP-LEAD',
    name: 'Leadership & Decision Making',
    description: 'Takes initiative during tactical incidents, provides clear command direction, and mentors junior guards.',
    category: 'LEADERSHIP',
    defaultWeight: 15,
  },
];

export class CompetencyService {
  static async seedDefaultCompetencies() {
    for (const comp of DEFAULT_COMPETENCIES) {
      await db.competency.upsert({
        where: { code: comp.code },
        update: {
          name: comp.name,
          description: comp.description,
          category: comp.category,
          defaultWeight: comp.defaultWeight,
        },
        create: comp,
      });
    }
  }

  static async createCompetency(data: {
    code: string;
    name: string;
    description?: string;
    category?: string;
    defaultWeight?: number;
    createdById?: string;
  }) {
    const existing = await db.competency.findUnique({ where: { code: data.code } });
    if (existing) throw new Error(`Competency with code ${data.code} already exists.`);

    const competency = await db.competency.create({
      data: {
        code: data.code.toUpperCase(),
        name: data.name,
        description: data.description,
        category: data.category || 'CORE',
        defaultWeight: data.defaultWeight || 10,
        isActive: true,
        createdById: data.createdById,
      },
    });

    if (data.createdById) {
      await AuditService.log({
        userId: data.createdById,
        action: 'CREATE_COMPETENCY',
        module: 'PERFORMANCE',
        resourceId: competency.id,
        newValues: { code: competency.code, name: competency.name },
      });
    }

    return competency;
  }

  static async listCompetencies(filters?: { category?: string; isActive?: boolean }) {
    const where: any = {};
    if (filters?.category && filters.category !== 'ALL') where.category = filters.category;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;

    return db.competency.findMany({
      where,
      orderBy: { code: 'asc' },
    });
  }

  static async submitPeerFeedback(data: {
    cycleId: string;
    employeeId: string;
    reviewerId: string;
    competencyId?: string;
    isAnonymous?: boolean;
    rating?: number;
    strengths?: string;
    improvements?: string;
    generalComments: string;
  }) {
    if (data.employeeId === data.reviewerId) {
      throw new Error('Employees cannot submit peer feedback for themselves.');
    }
    if (data.rating !== undefined && (data.rating < 1 || data.rating > 5)) {
      throw new Error('Peer feedback rating must be between 1.0 and 5.0.');
    }

    const feedback = await db.peerFeedback.create({
      data: {
        cycleId: data.cycleId,
        employeeId: data.employeeId,
        reviewerId: data.reviewerId,
        competencyId: data.competencyId,
        isAnonymous: data.isAnonymous !== undefined ? data.isAnonymous : true,
        rating: data.rating,
        strengths: data.strengths,
        improvements: data.improvements,
        generalComments: data.generalComments,
        status: 'SUBMITTED',
      },
    });

    return feedback;
  }

  static async listPeerFeedbackForEmployee(
    employeeId: string,
    cycleId?: string,
    viewerEmployeeId?: string,
    isHrAdmin: boolean = false
  ) {
    const where: any = { employeeId };
    if (cycleId && cycleId !== 'ALL') where.cycleId = cycleId;

    const feedbacks = await db.peerFeedback.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      include: {
        reviewer: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
          },
        },
        competency: {
          select: {
            id: true,
            code: true,
            name: true,
            category: true,
          },
        },
      },
    });

    // Privacy & Anonymity Scrubbing:
    return feedbacks.map((fb) => {
      const canSeeIdentity = isHrAdmin || (viewerEmployeeId && viewerEmployeeId === fb.reviewerId);
      if (fb.isAnonymous && !canSeeIdentity) {
        return {
          ...fb,
          reviewerId: 'ANONYMOUS',
          reviewer: {
            id: 'ANONYMOUS',
            employeeNumber: '***',
            fullName: 'Anonymous Colleague',
            jobTitle: 'Peer Reviewer',
          },
        };
      }
      return fb;
    });
  }

  static async calculateEmployeeCompetenciesScore(
    reviewId: string
  ): Promise<{ rawScore: number; totalWeight: number; competenciesCount: number }> {
    const ratings = await db.reviewCompetencyRating.findMany({
      where: { reviewId },
      include: { competency: true },
    });

    if (ratings.length === 0) {
      return { rawScore: 3.0, totalWeight: 0, competenciesCount: 0 };
    }

    let weightedSum = 0;
    let totalWeight = 0;

    for (const r of ratings) {
      const score = r.managerScore || r.selfScore || 3.0;
      const weight = r.weight || r.competency.defaultWeight || 10;
      weightedSum += score * weight;
      totalWeight += weight;
    }

    const rawScore = totalWeight > 0 ? weightedSum / totalWeight : 3.0;
    return {
      rawScore: Math.round(rawScore * 100) / 100,
      totalWeight,
      competenciesCount: ratings.length,
    };
  }
}
