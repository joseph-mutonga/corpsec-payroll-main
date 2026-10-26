import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export class DevelopmentService {
  static async generatePlanNumber(): Promise<string> {
    const year = new Date().getFullYear();
    let count = (await db.developmentPlan.count()) + 1;
    let planNumber = `DEV-${year}-${String(count).padStart(4, '0')}`;
    while (await db.developmentPlan.findUnique({ where: { planNumber } })) {
      count++;
      planNumber = `DEV-${year}-${String(count).padStart(4, '0')}`;
    }
    return planNumber;
  }

  static async generateTrainingNeedNumber(): Promise<string> {
    const year = new Date().getFullYear();
    let count = (await db.trainingNeed.count()) + 1;
    let needNumber = `TRN-${year}-${String(count).padStart(4, '0')}`;
    while (await db.trainingNeed.findUnique({ where: { needNumber } })) {
      count++;
      needNumber = `TRN-${year}-${String(count).padStart(4, '0')}`;
    }
    return needNumber;
  }

  // --- Development Plans & PIPs ---
  static async createDevelopmentPlan(data: {
    employeeId: string;
    cycleId?: string;
    reviewId?: string;
    planType?: 'SKILL_DEVELOPMENT' | 'PIP' | 'LEADERSHIP_PREPARATION';
    objective: string;
    skillGap: string;
    action: string;
    owner?: string;
    startDate: Date;
    targetDate: Date;
    createdById?: string;
  }) {
    if (data.startDate >= data.targetDate) {
      throw new Error('Plan Start Date must be strictly before Target Date.');
    }

    const planNumber = await this.generatePlanNumber();

    const plan = await db.developmentPlan.create({
      data: {
        planNumber,
        employeeId: data.employeeId,
        cycleId: data.cycleId,
        reviewId: data.reviewId,
        planType: data.planType || 'SKILL_DEVELOPMENT',
        objective: data.objective,
        skillGap: data.skillGap,
        action: data.action,
        owner: data.owner || 'EMPLOYEE',
        startDate: data.startDate,
        targetDate: data.targetDate,
        status: 'NOT_STARTED',
        completionPercentage: 0,
        createdById: data.createdById,
      },
    });

    if (data.createdById) {
      await AuditService.log({
        userId: data.createdById,
        action: 'CREATE_DEVELOPMENT_PLAN',
        module: 'PERFORMANCE',
        resourceId: plan.id,
        newValues: { planNumber: plan.planNumber, planType: plan.planType, objective: plan.objective },
      });
    }

    return plan;
  }

  static async updateDevelopmentPlan(
    id: string,
    data: {
      objective?: string;
      skillGap?: string;
      action?: string;
      owner?: string;
      startDate?: Date;
      targetDate?: Date;
      status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
      completionPercentage?: number;
      outcomeNotes?: string;
    },
    userId?: string
  ) {
    const existing = await db.developmentPlan.findUnique({ where: { id } });
    if (!existing) throw new Error('Development plan not found.');

    if (data.completionPercentage !== undefined && (data.completionPercentage < 0 || data.completionPercentage > 100)) {
      throw new Error('Completion percentage must be between 0% and 100%.');
    }

    const updated = await db.developmentPlan.update({
      where: { id },
      data: {
        objective: data.objective,
        skillGap: data.skillGap,
        action: data.action,
        owner: data.owner,
        startDate: data.startDate,
        targetDate: data.targetDate,
        status: data.status,
        completionPercentage: data.completionPercentage,
        outcomeNotes: data.outcomeNotes,
      },
    });

    if (userId) {
      await AuditService.log({
        userId,
        action: 'UPDATE_DEVELOPMENT_PLAN',
        module: 'PERFORMANCE',
        resourceId: id,
        newValues: { status: updated.status, completionPercentage: updated.completionPercentage },
      });
    }

    return updated;
  }

  static async listDevelopmentPlans(filters?: { employeeId?: string; cycleId?: string; status?: string; planType?: string }) {
    const where: any = {};
    if (filters?.employeeId) where.employeeId = filters.employeeId;
    if (filters?.cycleId && filters.cycleId !== 'ALL') where.cycleId = filters.cycleId;
    if (filters?.status && filters.status !== 'ALL') where.status = filters.status;
    if (filters?.planType && filters.planType !== 'ALL') where.planType = filters.planType;

    return db.developmentPlan.findMany({
      where,
      orderBy: { targetDate: 'asc' },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  // --- Training Needs ---
  static async createTrainingNeed(data: {
    employeeId: string;
    cycleId?: string;
    competencyId?: string;
    skill: string;
    identifiedNeed: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    source?: 'PERFORMANCE_REVIEW' | 'MANAGER_RECOMMENDATION' | 'EMPLOYEE_REQUEST' | 'HR_ASSESSMENT';
    recommendedTraining?: string;
    targetDate?: Date;
    createdById?: string;
  }) {
    const needNumber = await this.generateTrainingNeedNumber();

    const need = await db.trainingNeed.create({
      data: {
        needNumber,
        employeeId: data.employeeId,
        cycleId: data.cycleId,
        competencyId: data.competencyId,
        skill: data.skill,
        identifiedNeed: data.identifiedNeed,
        priority: data.priority || 'MEDIUM',
        source: data.source || 'PERFORMANCE_REVIEW',
        recommendedTraining: data.recommendedTraining,
        targetDate: data.targetDate,
        status: 'IDENTIFIED',
        createdById: data.createdById,
      },
    });

    if (data.createdById) {
      await AuditService.log({
        userId: data.createdById,
        action: 'LOG_TRAINING_NEED',
        module: 'PERFORMANCE',
        resourceId: need.id,
        newValues: { needNumber: need.needNumber, skill: need.skill, priority: need.priority },
      });
    }

    return need;
  }

  static async updateTrainingNeedStatus(
    id: string,
    status: 'IDENTIFIED' | 'APPROVED' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED',
    notes?: string,
    userId?: string
  ) {
    const updated = await db.trainingNeed.update({
      where: { id },
      data: { status, notes },
    });

    if (userId) {
      await AuditService.log({
        userId,
        action: 'UPDATE_TRAINING_NEED_STATUS',
        module: 'PERFORMANCE',
        resourceId: id,
        newValues: { status: updated.status },
      });
    }

    return updated;
  }

  static async listTrainingNeeds(filters?: { employeeId?: string; priority?: string; status?: string }) {
    const where: any = {};
    if (filters?.employeeId) where.employeeId = filters.employeeId;
    if (filters?.priority && filters.priority !== 'ALL') where.priority = filters.priority;
    if (filters?.status && filters.status !== 'ALL') where.status = filters.status;

    return db.trainingNeed.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            department: { select: { id: true, name: true } },
          },
        },
        competency: { select: { id: true, code: true, name: true } },
      },
    });
  }

  // --- Career Development ---
  static async upsertCareerDevelopment(
    employeeId: string,
    data: {
      careerGoals?: string;
      skillsToDevelop?: string;
      desiredFutureRoles?: string;
      developmentInterests?: string;
      mentorshipInterest?: boolean;
      mobilityPreference?: string;
    }
  ) {
    const cd = await db.careerDevelopment.upsert({
      where: { employeeId },
      update: {
        careerGoals: data.careerGoals,
        skillsToDevelop: data.skillsToDevelop,
        desiredFutureRoles: data.desiredFutureRoles,
        developmentInterests: data.developmentInterests,
        mentorshipInterest: data.mentorshipInterest,
        mobilityPreference: data.mobilityPreference,
        lastUpdated: new Date(),
      },
      create: {
        employeeId,
        careerGoals: data.careerGoals,
        skillsToDevelop: data.skillsToDevelop,
        desiredFutureRoles: data.desiredFutureRoles,
        developmentInterests: data.developmentInterests,
        mentorshipInterest: data.mentorshipInterest !== undefined ? data.mentorshipInterest : false,
        mobilityPreference: data.mobilityPreference || 'LOCAL_ONLY',
      },
    });

    return cd;
  }

  static async getCareerDevelopment(employeeId: string) {
    return db.careerDevelopment.findUnique({ where: { employeeId } });
  }
}
