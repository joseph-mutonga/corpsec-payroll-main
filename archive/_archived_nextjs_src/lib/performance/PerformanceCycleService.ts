import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export type CycleStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'SELF_ASSESSMENT'
  | 'MANAGER_REVIEW'
  | 'CALIBRATION'
  | 'COMPLETED'
  | 'ARCHIVED';

export const VALID_CYCLE_TRANSITIONS: Record<CycleStatus, CycleStatus[]> = {
  DRAFT: ['OPEN', 'ARCHIVED'],
  OPEN: ['SELF_ASSESSMENT', 'MANAGER_REVIEW', 'ARCHIVED'],
  SELF_ASSESSMENT: ['MANAGER_REVIEW', 'OPEN', 'ARCHIVED'],
  MANAGER_REVIEW: ['CALIBRATION', 'COMPLETED', 'SELF_ASSESSMENT', 'ARCHIVED'],
  CALIBRATION: ['COMPLETED', 'MANAGER_REVIEW', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

export const DEFAULT_WEIGHTS_CONFIG = {
  goalsWeight: 50, // 50%
  kpisWeight: 30, // 30%
  competenciesWeight: 20, // 20%
};

export const DEFAULT_RATING_SCALE = [
  { rating: 1, label: 'Does Not Meet Expectations', minScore: 1.0, maxScore: 1.99, description: 'Consistently fails to achieve key targets and performance standards.' },
  { rating: 2, label: 'Needs Improvement', minScore: 2.0, maxScore: 2.99, description: 'Meets some objectives but requires development and close supervision.' },
  { rating: 3, label: 'Meets Expectations', minScore: 3.0, maxScore: 3.99, description: 'Fully achieves core responsibilities and expected KPI metrics.' },
  { rating: 4, label: 'Exceeds Expectations', minScore: 4.0, maxScore: 4.59, description: 'Consistently surpasses standard requirements and demonstrates high initiative.' },
  { rating: 5, label: 'Outstanding', minScore: 4.6, maxScore: 5.0, description: 'Exceptional performance, exemplary role model, and strategic contributor.' },
];

export class PerformanceCycleService {
  static async generateCycleCode(name: string, year: number = new Date().getFullYear()): Promise<string> {
    const slug = name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8);
    const baseCode = `CYC-${year}-${slug || 'APPRAISAL'}`;
    const existing = await db.performanceCycle.findUnique({ where: { code: baseCode } });
    if (!existing) return baseCode;
    return `${baseCode}-${Math.floor(100 + Math.random() * 900)}`;
  }

  static async createCycle(data: {
    name: string;
    description?: string;
    startDate: Date;
    endDate: Date;
    selfAssessmentDeadline: Date;
    managerReviewDeadline: Date;
    reviewDeadline: Date;
    weightsConfig?: { goalsWeight: number; kpisWeight: number; competenciesWeight: number };
    ratingScaleConfig?: any[];
    createdById?: string;
  }) {
    if (data.startDate >= data.endDate) {
      throw new Error('Cycle Start Date must be strictly before End Date.');
    }
    if (data.selfAssessmentDeadline > data.managerReviewDeadline) {
      throw new Error('Self-Assessment deadline cannot be after Manager Review deadline.');
    }
    if (data.managerReviewDeadline > data.reviewDeadline) {
      throw new Error('Manager Review deadline cannot be after Final Review deadline.');
    }

    const weights = data.weightsConfig || DEFAULT_WEIGHTS_CONFIG;
    const totalWeight = weights.goalsWeight + weights.kpisWeight + weights.competenciesWeight;
    if (Math.round(totalWeight) !== 100) {
      throw new Error(`Total component weights must sum to exactly 100% (Got ${totalWeight}%).`);
    }

    const year = data.startDate.getFullYear();
    const code = await this.generateCycleCode(data.name, year);

    const cycle = await db.performanceCycle.create({
      data: {
        code,
        name: data.name,
        description: data.description,
        startDate: data.startDate,
        endDate: data.endDate,
        selfAssessmentDeadline: data.selfAssessmentDeadline,
        managerReviewDeadline: data.managerReviewDeadline,
        reviewDeadline: data.reviewDeadline,
        status: 'DRAFT',
        weightsConfig: JSON.stringify(weights),
        ratingScaleConfig: JSON.stringify(data.ratingScaleConfig || DEFAULT_RATING_SCALE),
        createdById: data.createdById,
      },
    });

    if (data.createdById) {
      await AuditService.log({
        userId: data.createdById,
        action: 'CREATE_PERFORMANCE_CYCLE',
        module: 'PERFORMANCE',
        resourceId: cycle.id,
        newValues: { code: cycle.code, name: cycle.name, status: cycle.status },
      });
    }

    return cycle;
  }

  static async updateCycle(
    id: string,
    data: {
      name?: string;
      description?: string;
      startDate?: Date;
      endDate?: Date;
      selfAssessmentDeadline?: Date;
      managerReviewDeadline?: Date;
      reviewDeadline?: Date;
      weightsConfig?: { goalsWeight: number; kpisWeight: number; competenciesWeight: number };
      ratingScaleConfig?: any[];
    },
    userId?: string
  ) {
    const existing = await db.performanceCycle.findUnique({ where: { id } });
    if (!existing) throw new Error('Performance cycle not found.');

    if (existing.status === 'ARCHIVED') {
      throw new Error('Cannot modify an archived performance cycle.');
    }

    if (data.weightsConfig) {
      const totalWeight =
        data.weightsConfig.goalsWeight +
        data.weightsConfig.kpisWeight +
        data.weightsConfig.competenciesWeight;
      if (Math.round(totalWeight) !== 100) {
        throw new Error(`Total component weights must sum to exactly 100% (Got ${totalWeight}%).`);
      }
    }

    const updated = await db.performanceCycle.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        startDate: data.startDate,
        endDate: data.endDate,
        selfAssessmentDeadline: data.selfAssessmentDeadline,
        managerReviewDeadline: data.managerReviewDeadline,
        reviewDeadline: data.reviewDeadline,
        weightsConfig: data.weightsConfig ? JSON.stringify(data.weightsConfig) : undefined,
        ratingScaleConfig: data.ratingScaleConfig ? JSON.stringify(data.ratingScaleConfig) : undefined,
      },
    });

    if (userId) {
      await AuditService.log({
        userId,
        action: 'UPDATE_PERFORMANCE_CYCLE',
        module: 'PERFORMANCE',
        resourceId: id,
        oldValues: { name: existing.name, status: existing.status },
        newValues: { name: updated.name, status: updated.status },
      });
    }

    return updated;
  }

  static async updateCycleStatus(id: string, targetStatus: CycleStatus, userId?: string) {
    const cycle = await db.performanceCycle.findUnique({
      where: { id },
      include: { reviews: true },
    });
    if (!cycle) throw new Error('Performance cycle not found.');

    const currentStatus = cycle.status as CycleStatus;
    const allowed = VALID_CYCLE_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(targetStatus)) {
      throw new Error(
        `Invalid status transition from ${currentStatus} to ${targetStatus}. Allowed: [${allowed.join(', ')}].`
      );
    }

    // Auto-generate reviews for all active employees when opening a cycle if none exist
    if ((targetStatus === 'OPEN' || targetStatus === 'SELF_ASSESSMENT') && cycle.reviews.length === 0) {
      await this.initializeCycleReviews(id, userId);
    }

    const updated = await db.performanceCycle.update({
      where: { id },
      data: { status: targetStatus },
    });

    if (userId) {
      await AuditService.log({
        userId,
        action: 'CHANGE_PERFORMANCE_CYCLE_STATUS',
        module: 'PERFORMANCE',
        resourceId: id,
        oldValues: { status: currentStatus },
        newValues: { status: targetStatus },
      });
    }

    return updated;
  }

  static async initializeCycleReviews(cycleId: string, _userId?: string) {
    const activeEmployees = await db.employee.findMany({
      where: { employmentStatus: 'ACTIVE', isArchived: false },
      select: { id: true, supervisorId: true, departmentId: true, positionId: true },
    });

    const year = new Date().getFullYear();
    let count = (await db.performanceReview.count()) + 1;

    for (let i = 0; i < activeEmployees.length; i++) {
      const emp = activeEmployees[i];

      // Check if review already exists for this cycle & employee
      const existing = await db.performanceReview.findUnique({
        where: { cycleId_employeeId: { cycleId, employeeId: emp.id } },
      });

      if (!existing) {
        let reviewNumber = `REV-${year}-${String(count).padStart(4, '0')}`;
        while (await db.performanceReview.findUnique({ where: { reviewNumber } })) {
          count++;
          reviewNumber = `REV-${year}-${String(count).padStart(4, '0')}`;
        }
        count++;

        await db.performanceReview.create({
          data: {
            reviewNumber,
            cycleId,
            employeeId: emp.id,
            reviewerId: emp.supervisorId,
            status: 'SELF_ASSESSMENT',
          },
        });
      }
    }
  }

  static async getActiveCycle() {
    const active = await db.performanceCycle.findFirst({
      where: {
        status: { in: ['OPEN', 'SELF_ASSESSMENT', 'MANAGER_REVIEW', 'CALIBRATION'] },
      },
      orderBy: { startDate: 'desc' },
      include: {
        reviews: {
          select: {
            id: true,
            status: true,
            overallScore: true,
            overallRating: true,
          },
        },
        goals: { select: { id: true, status: true } },
        _count: {
          select: {
            reviews: true,
            goals: true,
            kpiAssignments: true,
            developmentPlans: true,
            trainingNeeds: true,
          },
        },
      },
    });

    return active;
  }

  static async listCycles(filters?: { status?: string }) {
    const where: any = {};
    if (filters?.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }

    return db.performanceCycle.findMany({
      where,
      orderBy: { startDate: 'desc' },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: {
          select: {
            reviews: true,
            goals: true,
            kpiAssignments: true,
            developmentPlans: true,
            trainingNeeds: true,
          },
        },
      },
    });
  }

  static async getCycleById(id: string) {
    return db.performanceCycle.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        reviews: {
          include: {
            employee: {
              select: {
                id: true,
                employeeNumber: true,
                fullName: true,
                jobTitle: true,
                department: { select: { id: true, name: true } },
                station: { select: { id: true, name: true } },
              },
            },
            reviewer: {
              select: {
                id: true,
                employeeNumber: true,
                fullName: true,
                jobTitle: true,
              },
            },
          },
        },
        _count: {
          select: {
            reviews: true,
            goals: true,
            kpiAssignments: true,
            developmentPlans: true,
            trainingNeeds: true,
          },
        },
      },
    });
  }
}
