import { db } from '@/lib/db';
import { PerformanceCycleService } from './PerformanceCycleService';

export class PerformanceAnalyticsService {
  static async getDashboardMetrics() {
    const activeCycle = await PerformanceCycleService.getActiveCycle();

    const cycleId = activeCycle?.id;
    const whereCycle: any = cycleId ? { cycleId } : {};

    const [
      totalReviews,
      completedReviews,
      selfPendingReviews,
      managerPendingReviews,
      allCompletedWithScore,
      totalActiveGoals,
      completedGoals,
      activePips,
      allActiveEmployees,
    ] = await Promise.all([
      db.performanceReview.count({ where: whereCycle }),
      db.performanceReview.count({ where: { ...whereCycle, status: 'COMPLETED' } }),
      db.performanceReview.count({ where: { ...whereCycle, status: 'SELF_ASSESSMENT' } }),
      db.performanceReview.count({
        where: { ...whereCycle, status: { in: ['MANAGER_REVIEW', 'CALIBRATION'] } },
      }),
      db.performanceReview.findMany({
        where: {
          ...whereCycle,
          overallScore: { not: null },
        },
        select: { overallScore: true, overallRating: true },
      }),
      db.performanceGoal.count({ where: { ...whereCycle, status: { notIn: ['CANCELLED'] } } }),
      db.performanceGoal.count({ where: { ...whereCycle, status: 'COMPLETED' } }),
      db.developmentPlan.count({
        where: {
          planType: 'PIP',
          status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
        },
      }),
      db.employee.count({ where: { employmentStatus: 'ACTIVE', isArchived: false } }),
    ]);

    let avgScore = 0;
    if (allCompletedWithScore.length > 0) {
      const sum = allCompletedWithScore.reduce((acc, r) => acc + (r.overallScore || 0), 0);
      avgScore = Math.round((sum / allCompletedWithScore.length) * 100) / 100;
    }

    // Overdue reviews based on cycle deadlines
    let overdueReviews = 0;
    if (activeCycle) {
      const now = new Date();
      if (now > activeCycle.reviewDeadline) {
        overdueReviews = totalReviews - completedReviews;
      } else if (now > activeCycle.selfAssessmentDeadline) {
        overdueReviews = selfPendingReviews;
      }
    }

    // Rating distribution
    const ratingDistribution: Record<string, number> = {
      'Outstanding': 0,
      'Exceeds Expectations': 0,
      'Meets Expectations': 0,
      'Needs Improvement': 0,
      'Does Not Meet Expectations': 0,
    };

    for (const r of allCompletedWithScore) {
      const label = r.overallRating || 'Meets Expectations';
      if (ratingDistribution[label] !== undefined) {
        ratingDistribution[label]++;
      } else {
        ratingDistribution['Meets Expectations']++;
      }
    }

    const completionRate = totalReviews > 0 ? Math.round((completedReviews / totalReviews) * 100) : 0;
    const goalCompletionRate = totalActiveGoals > 0 ? Math.round((completedGoals / totalActiveGoals) * 100) : 0;

    return {
      activeCycle: activeCycle
        ? {
            id: activeCycle.id,
            code: activeCycle.code,
            name: activeCycle.name,
            status: activeCycle.status,
            startDate: activeCycle.startDate,
            endDate: activeCycle.endDate,
            selfAssessmentDeadline: activeCycle.selfAssessmentDeadline,
            managerReviewDeadline: activeCycle.managerReviewDeadline,
            reviewDeadline: activeCycle.reviewDeadline,
          }
        : null,
      kpis: {
        totalEmployeesInReview: totalReviews || allActiveEmployees,
        reviewsCompleted: completedReviews,
        reviewsPending: totalReviews - completedReviews,
        selfAssessmentsPending: selfPendingReviews,
        managerReviewsPending: managerPendingReviews,
        averagePerformanceScore: avgScore,
        employeesRequiringPips: activePips,
        overdueReviews,
        completionRate,
        goalCompletionRate,
      },
      ratingDistribution,
    };
  }

  static async getDepartmentPerformanceSummary(cycleId?: string) {
    const departments = await db.department.findMany({
      where: { isActive: true },
      include: {
        employees: {
          where: { employmentStatus: 'ACTIVE' },
          select: {
            id: true,
            performanceReviews: {
              where: cycleId ? { cycleId } : undefined,
              select: { overallScore: true, status: true },
            },
            performanceGoals: {
              where: cycleId ? { cycleId } : undefined,
              select: { status: true },
            },
          },
        },
      },
    });

    return departments.map((dept) => {
      let totalEmployees = dept.employees.length;
      let reviewedCount = 0;
      let completedReviews = 0;
      let scoreSum = 0;
      let totalGoals = 0;
      let completedGoals = 0;

      for (const emp of dept.employees) {
        for (const rev of emp.performanceReviews) {
          reviewedCount++;
          if (rev.status === 'COMPLETED') completedReviews++;
          if (rev.overallScore) scoreSum += rev.overallScore;
        }
        for (const g of emp.performanceGoals) {
          totalGoals++;
          if (g.status === 'COMPLETED') completedGoals++;
        }
      }

      const avgScore = reviewedCount > 0 && scoreSum > 0
        ? Math.round((scoreSum / reviewedCount) * 100) / 100
        : 0;
      const reviewCompletion = totalEmployees > 0
        ? Math.round((completedReviews / totalEmployees) * 100)
        : 0;
      const goalCompletion = totalGoals > 0
        ? Math.round((completedGoals / totalGoals) * 100)
        : 0;

      return {
        id: dept.id,
        code: dept.code,
        name: dept.name,
        totalEmployees,
        employeesReviewed: reviewedCount,
        averageScore: avgScore,
        reviewCompletionPercentage: reviewCompletion,
        goalCompletionPercentage: goalCompletion,
      };
    });
  }

  static async getReportData(reportType: string, cycleId?: string) {
    if (reportType === 'PERFORMANCE_SUMMARY') {
      const reviews = await db.performanceReview.findMany({
        where: cycleId && cycleId !== 'ALL' ? { cycleId } : undefined,
        include: {
          employee: {
            select: {
              employeeNumber: true,
              fullName: true,
              jobTitle: true,
              department: { select: { name: true } },
              station: { select: { name: true } },
            },
          },
          cycle: { select: { name: true, code: true } },
          reviewer: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reviews.map((r) => ({
        reviewNumber: r.reviewNumber,
        employeeNumber: r.employee.employeeNumber,
        fullName: r.employee.fullName,
        jobTitle: r.employee.jobTitle,
        department: r.employee.department?.name || 'N/A',
        station: r.employee.station?.name || 'N/A',
        cycleName: r.cycle.name,
        reviewer: r.reviewer?.fullName || 'Unassigned',
        goalsScore: r.goalsScore ?? 'N/A',
        kpisScore: r.kpisScore ?? 'N/A',
        competenciesScore: r.competenciesScore ?? 'N/A',
        overallScore: r.overallScore ?? 'N/A',
        overallRating: r.overallRating || 'N/A',
        status: r.status,
        acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString().split('T')[0] : 'N/A',
      }));
    }

    if (reportType === 'GOALS_ACHIEVEMENT') {
      const goals = await db.performanceGoal.findMany({
        where: cycleId && cycleId !== 'ALL' ? { cycleId } : undefined,
        include: {
          employee: {
            select: {
              employeeNumber: true,
              fullName: true,
              department: { select: { name: true } },
            },
          },
          cycle: { select: { name: true } },
        },
      });

      return goals.map((g) => ({
        goalNumber: g.goalNumber,
        employeeNumber: g.employee.employeeNumber,
        fullName: g.employee.fullName,
        department: g.employee.department?.name || 'N/A',
        title: g.title,
        category: g.category,
        priority: g.priority,
        weight: `${g.weight}%`,
        progress: `${g.progressPercentage}%`,
        status: g.status,
        managerRating: g.managerRating ?? 'N/A',
      }));
    }

    if (reportType === 'DEVELOPMENT_NEEDS') {
      const needs = await db.trainingNeed.findMany({
        where: cycleId && cycleId !== 'ALL' ? { cycleId } : undefined,
        include: {
          employee: {
            select: {
              employeeNumber: true,
              fullName: true,
              department: { select: { name: true } },
            },
          },
          competency: { select: { name: true } },
        },
      });

      return needs.map((n) => ({
        needNumber: n.needNumber,
        employeeNumber: n.employee.employeeNumber,
        fullName: n.employee.fullName,
        department: n.employee.department?.name || 'N/A',
        skill: n.skill,
        identifiedNeed: n.identifiedNeed,
        priority: n.priority,
        source: n.source,
        recommendedTraining: n.recommendedTraining || 'N/A',
        status: n.status,
      }));
    }

    return [];
  }
}
