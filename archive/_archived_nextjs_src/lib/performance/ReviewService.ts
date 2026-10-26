import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';
import { GoalService } from './GoalService';
import { KpiService } from './KpiService';
import { CompetencyService } from './CompetencyService';
import { DEFAULT_WEIGHTS_CONFIG, DEFAULT_RATING_SCALE } from './PerformanceCycleService';

export type ReviewStatus =
  | 'DRAFT'
  | 'SELF_ASSESSMENT'
  | 'MANAGER_REVIEW'
  | 'CALIBRATION'
  | 'EMPLOYEE_ACKNOWLEDGEMENT'
  | 'COMPLETED';

export class ReviewService {
  static async generateReviewNumber(): Promise<string> {
    const year = new Date().getFullYear();
    let count = (await db.performanceReview.count()) + 1;
    let reviewNumber = `REV-${year}-${String(count).padStart(4, '0')}`;
    while (await db.performanceReview.findUnique({ where: { reviewNumber } })) {
      count++;
      reviewNumber = `REV-${year}-${String(count).padStart(4, '0')}`;
    }
    return reviewNumber;
  }

  static async generateConcernNumber(): Promise<string> {
    const year = new Date().getFullYear();
    let count = (await db.performanceConcern.count()) + 1;
    let concernNumber = `CONC-${year}-${String(count).padStart(4, '0')}`;
    while (await db.performanceConcern.findUnique({ where: { concernNumber } })) {
      count++;
      concernNumber = `CONC-${year}-${String(count).padStart(4, '0')}`;
    }
    return concernNumber;
  }

  static resolveRatingLabel(score: number, ratingScaleConfig?: string | null): string {
    let scale = DEFAULT_RATING_SCALE;
    if (ratingScaleConfig) {
      try {
        scale = JSON.parse(ratingScaleConfig);
      } catch (e) {
        scale = DEFAULT_RATING_SCALE;
      }
    }

    const rounded = Math.round(score * 100) / 100;
    for (const tier of scale) {
      if (rounded >= tier.minScore && rounded <= tier.maxScore) {
        return tier.label;
      }
    }

    if (rounded >= 4.6) return 'Outstanding';
    if (rounded >= 4.0) return 'Exceeds Expectations';
    if (rounded >= 3.0) return 'Meets Expectations';
    if (rounded >= 2.0) return 'Needs Improvement';
    return 'Does Not Meet Expectations';
  }

  static async calculateReviewCompositeScore(reviewId: string) {
    const review = await db.performanceReview.findUnique({
      where: { id: reviewId },
      include: { cycle: true },
    });
    if (!review) throw new Error('Performance review not found.');

    let weights = DEFAULT_WEIGHTS_CONFIG;
    if (review.cycle.weightsConfig) {
      try {
        weights = JSON.parse(review.cycle.weightsConfig);
      } catch (e) {
        weights = DEFAULT_WEIGHTS_CONFIG;
      }
    }

    const [goalsResult, kpisResult, compResult] = await Promise.all([
      GoalService.calculateEmployeeGoalsScore(review.employeeId, review.cycleId, true),
      KpiService.calculateEmployeeKpisScore(review.employeeId, review.cycleId),
      CompetencyService.calculateEmployeeCompetenciesScore(review.id),
    ]);

    const goalsScore = goalsResult.rawScore;
    const kpisScore = kpisResult.rawScore;
    const competenciesScore = compResult.rawScore;

    const weightedGoals = (goalsScore * weights.goalsWeight) / 100;
    const weightedKpis = (kpisScore * weights.kpisWeight) / 100;
    const weightedComp = (competenciesScore * weights.competenciesWeight) / 100;

    const overallScore = Math.round((weightedGoals + weightedKpis + weightedComp) * 100) / 100;
    const overallRating = this.resolveRatingLabel(overallScore, review.cycle.ratingScaleConfig);

    return {
      goalsScore,
      kpisScore,
      competenciesScore,
      weights,
      weightedGoals: Math.round(weightedGoals * 100) / 100,
      weightedKpis: Math.round(weightedKpis * 100) / 100,
      weightedComp: Math.round(weightedComp * 100) / 100,
      overallScore,
      overallRating,
    };
  }

  static async submitSelfAssessment(
    reviewId: string,
    data: {
      achievements?: string;
      challenges?: string;
      strengths?: string;
      improvements?: string;
      trainingNeeds?: string;
      careerAspirations?: string;
      overallSelfScore?: number;
      goalRatings?: Array<{ goalId: string; selfRating: number; selfComment?: string }>;
      competencyRatings?: Array<{ competencyId: string; selfScore: number; selfComment?: string; weight?: number }>;
      isDraft?: boolean;
    },
    employeeId: string
  ) {
    const review = await db.performanceReview.findUnique({
      where: { id: reviewId },
      include: { cycle: true },
    });
    if (!review) throw new Error('Performance review not found.');
    if (review.employeeId !== employeeId) {
      throw new Error('You can only submit self-assessments for your own review record.');
    }
    if (review.status !== 'SELF_ASSESSMENT' && review.status !== 'DRAFT') {
      throw new Error(`Self-assessment is locked in current status: ${review.status}.`);
    }

    // Save goal self-ratings
    if (data.goalRatings && data.goalRatings.length > 0) {
      for (const gr of data.goalRatings) {
        await db.performanceGoal.update({
          where: { id: gr.goalId },
          data: {
            selfRating: gr.selfRating,
            selfComment: gr.selfComment,
          },
        });
      }
    }

    // Save competency self-ratings
    if (data.competencyRatings && data.competencyRatings.length > 0) {
      for (const cr of data.competencyRatings) {
        await db.reviewCompetencyRating.upsert({
          where: {
            reviewId_competencyId: {
              reviewId: review.id,
              competencyId: cr.competencyId,
            },
          },
          update: {
            selfScore: cr.selfScore,
            selfComment: cr.selfComment,
            weight: cr.weight,
          },
          create: {
            reviewId: review.id,
            competencyId: cr.competencyId,
            selfScore: cr.selfScore,
            selfComment: cr.selfComment,
            weight: cr.weight || 10,
          },
        });
      }
    }

    const isFinal = !data.isDraft;
    const updated = await db.performanceReview.update({
      where: { id: reviewId },
      data: {
        selfAchievements: data.achievements,
        selfChallenges: data.challenges,
        selfStrengths: data.strengths,
        selfImprovements: data.improvements,
        selfTrainingNeeds: data.trainingNeeds,
        selfCareerAspirations: data.careerAspirations,
        selfOverallScore: data.overallSelfScore,
        selfSubmittedAt: isFinal ? new Date() : undefined,
        status: isFinal ? 'MANAGER_REVIEW' : review.status,
      },
    });

    if (isFinal) {
      await AuditService.log({
        userId: employeeId,
        action: 'SUBMIT_SELF_ASSESSMENT',
        module: 'PERFORMANCE',
        resourceId: reviewId,
        newValues: { status: 'MANAGER_REVIEW', selfSubmittedAt: updated.selfSubmittedAt },
      });
    }

    return updated;
  }

  static async submitManagerReview(
    reviewId: string,
    data: {
      managerStrengths?: string;
      managerImprovements?: string;
      managerRecommendation?: string;
      goalRatings?: Array<{ goalId: string; managerRating: number; managerComment?: string }>;
      competencyRatings?: Array<{ competencyId: string; managerScore: number; managerComment?: string; weight?: number }>;
      targetStatus?: 'EMPLOYEE_ACKNOWLEDGEMENT' | 'CALIBRATION';
    },
    reviewerId?: string
  ) {
    const review = await db.performanceReview.findUnique({
      where: { id: reviewId },
      include: { cycle: true },
    });
    if (!review) throw new Error('Performance review not found.');

    // Save manager goal ratings
    if (data.goalRatings && data.goalRatings.length > 0) {
      for (const gr of data.goalRatings) {
        await db.performanceGoal.update({
          where: { id: gr.goalId },
          data: {
            managerRating: gr.managerRating,
            managerComment: gr.managerComment,
          },
        });
      }
    }

    // Save manager competency ratings
    if (data.competencyRatings && data.competencyRatings.length > 0) {
      for (const cr of data.competencyRatings) {
        await db.reviewCompetencyRating.upsert({
          where: {
            reviewId_competencyId: {
              reviewId: review.id,
              competencyId: cr.competencyId,
            },
          },
          update: {
            managerScore: cr.managerScore,
            managerComment: cr.managerComment,
            weight: cr.weight,
          },
          create: {
            reviewId: review.id,
            competencyId: cr.competencyId,
            managerScore: cr.managerScore,
            managerComment: cr.managerComment,
            weight: cr.weight || 10,
          },
        });
      }
    }

    // Compute composite score
    const scores = await this.calculateReviewCompositeScore(reviewId);

    const nextStatus = data.targetStatus || 'EMPLOYEE_ACKNOWLEDGEMENT';

    const updated = await db.performanceReview.update({
      where: { id: reviewId },
      data: {
        managerStrengths: data.managerStrengths,
        managerImprovements: data.managerImprovements,
        managerRecommendation: data.managerRecommendation,
        goalsScore: scores.goalsScore,
        kpisScore: scores.kpisScore,
        competenciesScore: scores.competenciesScore,
        overallScore: scores.overallScore,
        overallRating: scores.overallRating,
        managerSubmittedAt: new Date(),
        status: nextStatus,
      },
    });

    if (reviewerId) {
      await AuditService.log({
        userId: reviewerId,
        action: 'SUBMIT_MANAGER_REVIEW',
        module: 'PERFORMANCE',
        resourceId: reviewId,
        newValues: {
          status: nextStatus,
          overallScore: scores.overallScore,
          overallRating: scores.overallRating,
        },
      });
    }

    return updated;
  }

  static async acknowledgeReview(
    reviewId: string,
    data: { acknowledgementComment?: string },
    employeeId: string
  ) {
    const review = await db.performanceReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new Error('Performance review not found.');
    if (review.employeeId !== employeeId) {
      throw new Error('You can only acknowledge your own performance review.');
    }

    const updated = await db.performanceReview.update({
      where: { id: reviewId },
      data: {
        acknowledgedAt: new Date(),
        acknowledgementComment: data.acknowledgementComment,
        status: 'COMPLETED',
      },
    });

    await AuditService.log({
      userId: employeeId,
      action: 'ACKNOWLEDGE_PERFORMANCE_REVIEW',
      module: 'PERFORMANCE',
      resourceId: reviewId,
      newValues: { status: 'COMPLETED', acknowledgedAt: updated.acknowledgedAt },
    });

    return updated;
  }

  static async submitReviewConcern(data: {
    reviewId: string;
    employeeId: string;
    concern: string;
    explanation: string;
    supportingDocUrl?: string;
  }) {
    const review = await db.performanceReview.findUnique({ where: { id: data.reviewId } });
    if (!review) throw new Error('Performance review not found.');
    if (review.employeeId !== data.employeeId) {
      throw new Error('You can only submit concerns for your own performance review.');
    }

    const concernNumber = await this.generateConcernNumber();

    const concern = await db.performanceConcern.create({
      data: {
        concernNumber,
        reviewId: data.reviewId,
        employeeId: data.employeeId,
        concern: data.concern,
        explanation: data.explanation,
        supportingDocUrl: data.supportingDocUrl,
        status: 'PENDING_REVIEW',
      },
    });

    await db.performanceReview.update({
      where: { id: data.reviewId },
      data: { hasConcern: true },
    });

    await AuditService.log({
      userId: data.employeeId,
      action: 'RAISE_PERFORMANCE_CONCERN',
      module: 'PERFORMANCE',
      resourceId: concern.id,
      newValues: { concernNumber: concern.concernNumber, status: 'PENDING_REVIEW' },
    });

    return concern;
  }

  static async resolveConcern(
    concernId: string,
    data: {
      status: 'RESOLVED' | 'DISMISSED' | 'IN_REVIEW';
      hrResponse?: string;
      internalHrNotes?: string;
    },
    resolvedById: string
  ) {
    const concern = await db.performanceConcern.findUnique({ where: { id: concernId } });
    if (!concern) throw new Error('Performance concern not found.');

    const updated = await db.performanceConcern.update({
      where: { id: concernId },
      data: {
        status: data.status,
        hrResponse: data.hrResponse,
        internalHrNotes: data.internalHrNotes,
        resolvedById: data.status !== 'IN_REVIEW' ? resolvedById : undefined,
        resolvedAt: data.status !== 'IN_REVIEW' ? new Date() : undefined,
      },
    });

    await AuditService.log({
      userId: resolvedById,
      action: 'RESOLVE_PERFORMANCE_CONCERN',
      module: 'PERFORMANCE',
      resourceId: concernId,
      newValues: { status: data.status, resolvedAt: updated.resolvedAt },
    });

    return updated;
  }

  static async calibrateReview(
    reviewId: string,
    data: {
      calibratedScore: number;
      calibratedRating?: string;
      calibrationComment: string;
    },
    calibratedById: string
  ) {
    const review = await db.performanceReview.findUnique({
      where: { id: reviewId },
      include: { cycle: true },
    });
    if (!review) throw new Error('Performance review not found.');

    if (data.calibratedScore < 1.0 || data.calibratedScore > 5.0) {
      throw new Error('Calibrated score must be between 1.0 and 5.0.');
    }

    const calibratedRating =
      data.calibratedRating ||
      this.resolveRatingLabel(data.calibratedScore, review.cycle.ratingScaleConfig);

    // Keep original scores completely intact! Only update calibration fields.
    const updated = await db.performanceReview.update({
      where: { id: reviewId },
      data: {
        calibratedScore: data.calibratedScore,
        calibratedRating,
        isCalibrated: true,
        calibratedById,
        calibratedAt: new Date(),
        calibrationComment: data.calibrationComment,
        status: 'EMPLOYEE_ACKNOWLEDGEMENT',
      },
    });

    await AuditService.log({
      userId: calibratedById,
      action: 'CALIBRATE_PERFORMANCE_REVIEW',
      module: 'PERFORMANCE',
      resourceId: reviewId,
      oldValues: {
        originalScore: review.overallScore,
        originalRating: review.overallRating,
      },
      newValues: {
        calibratedScore: data.calibratedScore,
        calibratedRating,
      },
    });

    return updated;
  }

  static async getReviewById(id: string, viewerEmployeeId?: string, isHrAdmin: boolean = false) {
    const review = await db.performanceReview.findUnique({
      where: { id },
      include: {
        cycle: true,
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            employmentDate: true,
            department: { select: { id: true, name: true } },
            station: { select: { id: true, name: true, townCity: true } },
            branch: { select: { id: true, name: true } },
            position: { select: { id: true, title: true } },
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
        calibratedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        competencyRatings: {
          include: { competency: true },
        },
        concerns: {
          include: {
            resolvedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        developmentPlans: true,
      },
    });

    if (!review) return null;

    // Fetch related goals and KPI measurements for this employee in this cycle
    const [goals, kpiMeasurements] = await Promise.all([
      db.performanceGoal.findMany({
        where: { employeeId: review.employeeId, cycleId: review.cycleId },
        orderBy: { createdAt: 'desc' },
      }),
      db.kpiMeasurement.findMany({
        where: { employeeId: review.employeeId, cycleId: review.cycleId },
        include: { kpi: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Scrub internal HR notes on concerns for standard employees
    const isOwner = viewerEmployeeId && viewerEmployeeId === review.employeeId;
    const sanitizedConcerns = review.concerns.map((c) => {
      if (isOwner && !isHrAdmin) {
        return { ...c, internalHrNotes: null };
      }
      return c;
    });

    return {
      ...review,
      concerns: sanitizedConcerns,
      goals,
      kpiMeasurements,
    };
  }

  static async listReviews(filters?: {
    cycleId?: string;
    employeeId?: string;
    reviewerId?: string;
    departmentId?: string;
    status?: string;
  }) {
    const where: any = {};
    if (filters?.cycleId && filters.cycleId !== 'ALL') where.cycleId = filters.cycleId;
    if (filters?.employeeId) where.employeeId = filters.employeeId;
    if (filters?.reviewerId) where.reviewerId = filters.reviewerId;
    if (filters?.status && filters.status !== 'ALL') where.status = filters.status;
    if (filters?.departmentId && filters.departmentId !== 'ALL') {
      where.employee = { departmentId: filters.departmentId };
    }

    return db.performanceReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        cycle: { select: { id: true, code: true, name: true, status: true } },
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
        _count: { select: { concerns: true, developmentPlans: true } },
      },
    });
  }
}
