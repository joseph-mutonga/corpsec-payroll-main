import { db } from '@/lib/db';

export class TrainingAnalyticsService {
  static async getCommandCenterKpis() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const sixtyDaysAhead = new Date();
    sixtyDaysAhead.setDate(sixtyDaysAhead.getDate() + 60);

    const [
      activePrograms,
      upcomingSessions,
      totalEnrolled,
      completedEnrollments,
      pendingEnrollments,
      expiringCerts,
      mandatoryCourses,
      attendancesThisMonth,
      costsThisMonth,
      totalAttendances,
      presentAttendances,
      allAssessments,
      passedAssessments,
      budgets,
    ] = await Promise.all([
      db.trainingProgram.count({ where: { status: { in: ['OPEN', 'ACTIVE'] } } }),
      db.trainingSession.count({ where: { startDate: { gte: now }, status: { in: ['SCHEDULED', 'OPEN'] } } }),
      db.trainingEnrollment.count({ where: { status: { in: ['APPROVED', 'ENROLLED'] } } }),
      db.trainingEnrollment.count({ where: { status: 'COMPLETED' } }),
      db.trainingEnrollment.count({ where: { status: { in: ['REQUESTED', 'WAITLISTED'] } } }),
      db.trainingCertificate.count({
        where: {
          status: 'ACTIVE',
          expiryDate: { lte: sixtyDaysAhead, gte: now },
        },
      }),
      db.course.findMany({
        where: { isMandatory: true, status: 'ACTIVE' },
        select: { id: true, title: true, validityMonths: true },
      }),
      db.trainingAttendance.findMany({
        where: { date: { gte: startOfMonth, lte: endOfMonth } },
        select: { hoursAttended: true },
      }),
      db.trainingCost.findMany({
        where: { createdAt: { gte: startOfMonth, lte: endOfMonth } },
        select: { totalCost: true },
      }),
      db.trainingAttendance.count(),
      db.trainingAttendance.count({ where: { status: 'PRESENT' } }),
      db.trainingAssessment.count(),
      db.trainingAssessment.count({ where: { result: 'PASS' } }),
      db.trainingBudget.findMany({ where: { budgetPeriod: now.getFullYear().toString() } }),
    ]);

    const trainingHoursThisMonth = Math.round(
      attendancesThisMonth.reduce((sum, a) => sum + a.hoursAttended, 0)
    );
    const trainingCostThisMonth = Math.round(
      costsThisMonth.reduce((sum, c) => sum + c.totalCost, 0)
    );

    const totalFinished = completedEnrollments + (await db.trainingEnrollment.count({ where: { status: 'FAILED' } }));
    const completionRate = totalFinished > 0 ? Math.round((completedEnrollments / totalFinished) * 100) : 100;
    const attendanceRate = totalAttendances > 0 ? Math.round((presentAttendances / totalAttendances) * 100) : 100;
    const assessmentPassRate = allAssessments > 0 ? Math.round((passedAssessments / allAssessments) * 100) : 100;

    const totalAllocatedBudget = budgets.reduce((sum, b) => sum + b.allocatedAmount, 0);
    const totalUsedBudget = budgets.reduce((sum, b) => sum + b.usedAmount, 0);
    const budgetUtilizationRate = totalAllocatedBudget > 0
      ? Math.round((totalUsedBudget / totalAllocatedBudget) * 100)
      : 0;

    // Calculate active employees compliance for mandatory training
    const totalActiveEmployees = await db.employee.count({
      where: { employmentStatus: 'ACTIVE', isArchived: false },
    });

    const mandatoryDueCount = mandatoryCourses.length * totalActiveEmployees;

    return {
      activePrograms,
      upcomingSessions,
      employeesEnrolled: totalEnrolled,
      trainingCompleted: completedEnrollments,
      trainingPending: pendingEnrollments,
      certificationsExpiring: expiringCerts,
      mandatoryTrainingDue: mandatoryDueCount,
      trainingHoursThisMonth,
      trainingCostThisMonth,
      rates: {
        completionRate,
        attendanceRate,
        assessmentPassRate,
        budgetUtilizationRate,
      },
    };
  }

  static async getComplianceMatrix(departmentId?: string) {
    const activeEmployees = await db.employee.findMany({
      where: {
        employmentStatus: 'ACTIVE',
        isArchived: false,
        departmentId: departmentId && departmentId !== 'ALL' ? departmentId : undefined,
      },
      select: {
        id: true,
        employeeNumber: true,
        fullName: true,
        jobTitle: true,
        department: { select: { id: true, name: true } },
        trainingCertificates: {
          where: { status: { in: ['ACTIVE', 'EXPIRING'] } },
          select: { courseId: true, expiryDate: true, status: true, certificateNumber: true },
        },
      },
      orderBy: { fullName: 'asc' },
    });

    const mandatoryCourses = await db.course.findMany({
      where: { isMandatory: true, status: 'ACTIVE' },
      select: { id: true, code: true, title: true, validityMonths: true },
    });

    const matrix = activeEmployees.map((emp) => {
      const courseStatuses = mandatoryCourses.map((course) => {
        const cert = emp.trainingCertificates.find((c) => c.courseId === course.id);
        let status: 'COMPLIANT' | 'DUE' | 'OVERDUE' | 'EXPIRED' = 'DUE';

        if (cert) {
          if (cert.expiryDate && new Date() > new Date(cert.expiryDate)) {
            status = 'EXPIRED';
          } else {
            status = 'COMPLIANT';
          }
        }

        return {
          courseId: course.id,
          courseCode: course.code,
          courseTitle: course.title,
          status,
          certificateNumber: cert?.certificateNumber || null,
          expiryDate: cert?.expiryDate || null,
        };
      });

      const compliantCount = courseStatuses.filter((c) => c.status === 'COMPLIANT').length;
      const complianceRate = mandatoryCourses.length > 0
        ? Math.round((compliantCount / mandatoryCourses.length) * 100)
        : 100;

      return {
        employee: {
          id: emp.id,
          employeeNumber: emp.employeeNumber,
          fullName: emp.fullName,
          jobTitle: emp.jobTitle,
          department: emp.department?.name || 'Unassigned',
        },
        complianceRate,
        courses: courseStatuses,
      };
    });

    return {
      mandatoryCourses,
      employees: matrix,
    };
  }

  static async getDepartmentTrainingSummary() {
    const departments = await db.department.findMany({
      where: { isActive: true },
      include: {
        employees: {
          where: { employmentStatus: 'ACTIVE' },
          select: {
            id: true,
            trainingEnrollments: { select: { status: true } },
            trainingAttendances: { select: { hoursAttended: true } },
          },
        },
        trainingCosts: { select: { totalCost: true } },
        trainingBudgets: { select: { allocatedAmount: true, usedAmount: true } },
      },
    });

    return departments.map((dept) => {
      let employeesTrained = 0;
      let totalHours = 0;
      let completedCount = 0;
      let enrolledCount = 0;

      dept.employees.forEach((emp) => {
        const hasTrained = emp.trainingEnrollments.some((e) => ['ATTENDED', 'COMPLETED'].includes(e.status));
        if (hasTrained) employeesTrained++;

        emp.trainingEnrollments.forEach((e) => {
          enrolledCount++;
          if (e.status === 'COMPLETED') completedCount++;
        });

        emp.trainingAttendances.forEach((a) => {
          totalHours += a.hoursAttended;
        });
      });

      const totalCost = dept.trainingCosts.reduce((sum, c) => sum + c.totalCost, 0);
      const completionRate = enrolledCount > 0 ? Math.round((completedCount / enrolledCount) * 100) : 100;

      return {
        id: dept.id,
        code: dept.code,
        name: dept.name,
        totalEmployees: dept.employees.length,
        employeesTrained,
        totalHours: Math.round(totalHours),
        completionRate,
        totalCost,
      };
    });
  }
}
