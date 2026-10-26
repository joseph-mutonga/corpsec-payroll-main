import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { db } from '@/lib/db';
import { PerformanceCycleService } from '@/lib/performance/PerformanceCycleService';
import { DevelopmentService } from '@/lib/performance/DevelopmentService';
import { ReviewService } from '@/lib/performance/ReviewService';

export async function GET() {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const currentEmp = await db.employee.findFirst({
      where: { userId: auth.user.id },
      include: {
        department: { select: { id: true, name: true } },
        position: { select: { id: true, title: true } },
        supervisor: { select: { id: true, fullName: true, jobTitle: true } },
      },
    });

    if (!currentEmp) {
      return apiError('Employee record not linked to current user account.', 400);
    }

    const activeCycle = await PerformanceCycleService.getActiveCycle();

    // Fetch active review, goals, KPI measurements, competencies, development plans, and career development
    let activeReview: any = null;
    if (activeCycle) {
      const reviewRecord = await db.performanceReview.findUnique({
        where: {
          cycleId_employeeId: {
            cycleId: activeCycle.id,
            employeeId: currentEmp.id,
          },
        },
      });
      if (reviewRecord) {
        activeReview = await ReviewService.getReviewById(reviewRecord.id, currentEmp.id, false);
      }
    }

    const [
      allReviews,
      goals,
      developmentPlans,
      trainingNeeds,
      careerDevelopment,
      competencies,
    ] = await Promise.all([
      db.performanceReview.findMany({
        where: { employeeId: currentEmp.id },
        include: {
          cycle: { select: { id: true, code: true, name: true, status: true, startDate: true, endDate: true } },
          reviewer: { select: { fullName: true, jobTitle: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.performanceGoal.findMany({
        where: {
          employeeId: currentEmp.id,
          cycleId: activeCycle?.id,
        },
        orderBy: { createdAt: 'desc' },
      }),
      DevelopmentService.listDevelopmentPlans({ employeeId: currentEmp.id }),
      DevelopmentService.listTrainingNeeds({ employeeId: currentEmp.id }),
      DevelopmentService.getCareerDevelopment(currentEmp.id),
      db.competency.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
    ]);

    return apiSuccess({
      employee: {
        id: currentEmp.id,
        employeeNumber: currentEmp.employeeNumber,
        fullName: currentEmp.fullName,
        jobTitle: currentEmp.jobTitle,
        department: currentEmp.department?.name || 'N/A',
        position: currentEmp.position?.title || currentEmp.jobTitle,
        supervisor: currentEmp.supervisor?.fullName || 'N/A',
      },
      activeCycle,
      activeReview,
      reviewHistory: allReviews,
      goals,
      developmentPlans,
      trainingNeeds,
      careerDevelopment: careerDevelopment || null,
      competencies,
    });
  } catch (error: any) {
    console.error('Error fetching employee portal performance data:', error);
    return apiError(error.message || 'Failed to fetch employee portal performance data', 500);
  }
}
