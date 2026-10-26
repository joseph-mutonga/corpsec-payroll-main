import { db } from '../db';

export class LeaveAnalyticsService {
  /**
   * Computes the 8 core real-time Leave Command Center KPIs.
   */
  static async getCommandCenterKpis(year: number = new Date().getFullYear()) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    const next7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      employeesOnLeaveToday,
      pendingRequests,
      approvedThisMonth,
      upcomingLeave,
      employeesReturningSoon,
      unclosedAbsences,
      requestsRequiringHrAction,
      allRequestsYear,
      entitlementsYear,
    ] = await Promise.all([
      // 1. Employees on leave today
      db.leaveRequest.count({
        where: {
          status: { in: ['APPROVED', 'ACTIVE'] },
          startDate: { lte: endOfToday },
          endDate: { gte: today },
        },
      }),

      // 2. Pending Requests
      db.leaveRequest.count({
        where: { status: { in: ['SUBMITTED', 'MANAGER_REVIEW', 'HR_REVIEW'] } },
      }),

      // 3. Approved This Month
      db.leaveRequest.count({
        where: {
          status: 'APPROVED',
          reviewedAt: { gte: startOfMonth, lte: endOfMonth },
        },
      }),

      // 4. Upcoming Leave (next 14 days)
      db.leaveRequest.count({
        where: {
          status: 'APPROVED',
          startDate: { gt: endOfToday, lte: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000) },
        },
      }),

      // 5. Employees Returning Soon (next 7 days)
      db.leaveRequest.count({
        where: {
          status: { in: ['APPROVED', 'ACTIVE'] },
          endDate: { gte: today, lte: next7Days },
        },
      }),

      // 6. Unclosed / Open Absences
      db.leaveAbsence.count({
        where: { status: { in: ['OPEN', 'UNEXCUSED'] } },
      }),

      // 7. Requests Requiring HR Action
      db.leaveRequest.count({
        where: { status: 'HR_REVIEW' },
      }),

      // 8. All Requests for Rate Calculations
      db.leaveRequest.findMany({
        where: { leaveYear: year },
        select: { status: true, durationDays: true },
      }),

      // 9. All Entitlements for Balance Totals
      db.leaveEntitlement.findMany({
        where: { leaveYear: year, status: 'ACTIVE' },
        select: {
          openingBalance: true,
          accruedDays: true,
          adjustmentDays: true,
          carriedForwardDays: true,
          usedDays: true,
          expiredDays: true,
          availableBalance: true,
        },
      }),
    ]);

    // Compute approval and rejection rates
    const totalDecided = allRequestsYear.filter((r) => ['APPROVED', 'REJECTED'].includes(r.status)).length;
    const approvedCount = allRequestsYear.filter((r) => r.status === 'APPROVED').length;
    const rejectedCount = allRequestsYear.filter((r) => r.status === 'REJECTED').length;

    const approvalRate = totalDecided > 0 ? Math.round((approvedCount / totalDecided) * 100) : 100;
    const rejectionRate = totalDecided > 0 ? Math.round((rejectedCount / totalDecided) * 100) : 0;

    // Compute total days taken vs. remaining
    let totalDaysTaken = 0;
    let totalDaysRemaining = 0;

    entitlementsYear.forEach((ent) => {
      totalDaysTaken += ent.usedDays;
      const closing =
        ent.openingBalance +
        ent.accruedDays +
        ent.adjustmentDays +
        ent.carriedForwardDays -
        ent.usedDays -
        ent.expiredDays;
      totalDaysRemaining += Math.max(0, closing);
    });

    return {
      employeesOnLeaveToday,
      pendingRequests,
      approvedThisMonth,
      upcomingLeave,
      employeesReturningSoon,
      totalLeaveDaysTaken: Math.round(totalDaysTaken * 10) / 10,
      totalLeaveDaysRemaining: Math.round(totalDaysRemaining * 10) / 10,
      unclosedAbsences,
      requestsRequiringHrAction,
      rates: {
        approvalRate,
        rejectionRate,
        totalRequestsYear: allRequestsYear.length,
      },
    };
  }

  /**
   * Computes Department-level Leave Utilization and Balances.
   */
  static async getDepartmentLeaveSummary(year: number = new Date().getFullYear()) {
    const departments = await db.department.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        employees: {
          where: { employmentStatus: 'ACTIVE', deletedAt: null },
          include: {
            leaveEntitlements: {
              where: { leaveYear: year, status: 'ACTIVE' },
            },
          },
        },
      },
    });

    return departments.map((dept) => {
      let daysTaken = 0;
      let daysRemaining = 0;

      dept.employees.forEach((emp) => {
        emp.leaveEntitlements.forEach((ent) => {
          daysTaken += ent.usedDays;
          const closing =
            ent.openingBalance +
            ent.accruedDays +
            ent.adjustmentDays +
            ent.carriedForwardDays -
            ent.usedDays -
            ent.expiredDays;
          daysRemaining += Math.max(0, closing);
        });
      });

      const totalPool = daysTaken + daysRemaining;
      const utilizationRate = totalPool > 0 ? Math.round((daysTaken / totalPool) * 100) : 0;

      return {
        departmentId: dept.id,
        departmentName: dept.name,
        employeeCount: dept.employees.length,
        daysTaken: Math.round(daysTaken * 10) / 10,
        daysRemaining: Math.round(daysRemaining * 10) / 10,
        utilizationRate,
      };
    });
  }

  /**
   * Computes leave breakdown by Leave Type.
   */
  static async getLeaveTypeBreakdown(year: number = new Date().getFullYear()) {
    const leaveTypes = await db.leaveType.findMany({
      where: { deletedAt: null },
      include: {
        requests: {
          where: { leaveYear: year, status: 'APPROVED' },
          select: { durationDays: true },
        },
      },
    });

    return leaveTypes.map((lt) => {
      const daysTaken = lt.requests.reduce((acc, r) => acc + r.durationDays, 0);
      return {
        leaveTypeId: lt.id,
        leaveTypeCode: lt.code,
        leaveTypeName: lt.name,
        isPaid: lt.isPaid,
        color: lt.color || '#2563eb',
        approvedRequestsCount: lt.requests.length,
        daysTaken: Math.round(daysTaken * 10) / 10,
      };
    });
  }
}
