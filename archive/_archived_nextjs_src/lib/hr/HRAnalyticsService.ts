import { db } from '@/lib/db';
import { EmployerCostCalculator } from '../payroll-reports/EmployerCostCalculator';

export class HRAnalyticsService {
  /**
   * Aggregates real-time metrics for the main HR Command Center (/hr)
   */
  static async getHRDashboardMetrics() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const [
      totalEmployees,
      activeEmployees,
      onLeaveEmployees,
      onProbationEmployees,
      exitingEmployees,
      newEmployeesThisMonth,
      expiringContractsCount,
      pendingHRRequests,
      pendingLeaveRequests,
      departments,
      stations,
      allEmployees,
      recentHistories,
    ] = await Promise.all([
      db.employee.count(),
      db.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
      db.employee.count({ where: { employmentStatus: 'ON_LEAVE' } }),
      db.employee.count({
        where: {
          OR: [{ employmentStatus: 'ON_PROBATION' }, { probationStatus: 'IN_PROGRESS' }],
        },
      }),
      db.employee.count({
        where: { employmentStatus: { in: ['NOTICE_PERIOD', 'TERMINATED', 'RESIGNED'] } },
      }),
      db.employee.count({ where: { employmentDate: { gte: startOfMonth } } }),
      db.employee.count({
        where: {
          contractEndDate: { not: null, lte: in90Days },
          employmentStatus: { notIn: ['TERMINATED', 'RESIGNED', 'RETIRED'] },
        },
      }),
      db.hRRequest.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
      db.leaveRequest.count({ where: { status: { in: ['SUBMITTED', 'PENDING_APPROVAL'] } } }),
      db.department.findMany({
        where: { isActive: true },
        select: { id: true, name: true, _count: { select: { employees: true } } },
      }),
      db.station.findMany({
        where: { isActive: true },
        select: { id: true, name: true, requiredStaffing: true, _count: { select: { employees: true } } },
      }),
      db.employee.findMany({
        select: {
          id: true,
          fullName: true,
          employeeNumber: true,
          dateOfBirth: true,
          gender: true,
          employmentType: true,
          employmentStatus: true,
          contractEndDate: true,
        },
      }),
      db.employeeHistory.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: { id: true, fullName: true, employeeNumber: true } },
          performedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    // Upcoming birthdays in next 30 days
    const upcomingBirthdays = allEmployees
      .filter((e) => e.dateOfBirth)
      .map((e) => {
        const dob = new Date(e.dateOfBirth!);
        const currentYearBirthday = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
        let daysUntil = Math.ceil((currentYearBirthday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntil < 0) {
          // If birthday already passed this year, check next year
          const nextYearBirthday = new Date(now.getFullYear() + 1, dob.getMonth(), dob.getDate());
          daysUntil = Math.ceil((nextYearBirthday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        }
        return {
          id: e.id,
          fullName: e.fullName,
          employeeNumber: e.employeeNumber,
          dateOfBirth: dob.toISOString().split('T')[0],
          daysUntil,
        };
      })
      .filter((b) => b.daysUntil >= 0 && b.daysUntil <= 30)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    // Status breakdown
    const statusCounts: Record<string, number> = {};
    for (const e of allEmployees) {
      statusCounts[e.employmentStatus] = (statusCounts[e.employmentStatus] || 0) + 1;
    }

    // Employment type breakdown
    const typeCounts: Record<string, number> = {};
    for (const e of allEmployees) {
      typeCounts[e.employmentType] = (typeCounts[e.employmentType] || 0) + 1;
    }

    // Attendance exceptions count (mocked/queried from unresolved adjustments)
    const attendanceExceptionsCount = await db.attendanceAdjustment.count({
      where: { status: 'PENDING' },
    });

    return {
      kpis: {
        totalEmployees,
        activeEmployees,
        onLeaveEmployees,
        onProbationEmployees,
        exitingEmployees,
        newEmployeesThisMonth,
        expiringContractsCount,
        pendingHRRequests,
        pendingLeaveRequests,
        attendanceExceptionsCount,
      },
      upcomingBirthdays,
      departmentDistribution: departments.map((d) => ({
        id: d.id,
        name: d.name,
        count: d._count.employees,
      })),
      stationDistribution: stations.map((s) => ({
        id: s.id,
        name: s.name,
        actualCount: s._count.employees,
        requiredStaffing: s.requiredStaffing,
      })),
      statusDistribution: statusCounts,
      employmentTypeDistribution: typeCounts,
      recentActivity: recentHistories.map((h) => ({
        id: h.id,
        employeeName: h.employee.fullName,
        employeeNumber: h.employee.employeeNumber,
        changeType: h.changeType,
        description: h.description,
        performedBy: h.performedBy ? `${h.performedBy.firstName} ${h.performedBy.lastName}` : 'System',
        createdAt: h.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Computes full workforce analytics, demographics, turnover rates, and labor cost integration
   */
  static async getWorkforceAnalytics() {
    const allEmployees = await db.employee.findMany({
      include: {
        department: true,
        station: true,
        branch: true,
      },
    });

    const totalCount = allEmployees.length;
    const activeCount = allEmployees.filter((e) => e.employmentStatus === 'ACTIVE').length;
    const exitedCount = allEmployees.filter((e) =>
      ['TERMINATED', 'RESIGNED', 'RETIRED'].includes(e.employmentStatus)
    ).length;

    // Safe turnover rate computation
    const turnoverRate = totalCount > 0 ? Math.round((exitedCount / totalCount) * 10000) / 100 : 0;

    // Gender breakdown
    const genderBreakdown: Record<string, number> = { MALE: 0, FEMALE: 0, OTHER: 0 };
    for (const e of allEmployees) {
      if (e.gender in genderBreakdown) {
        genderBreakdown[e.gender]++;
      } else {
        genderBreakdown.OTHER++;
      }
    }

    // Department breakdown with active vs total
    const deptStats: Record<string, { total: number; active: number }> = {};
    for (const e of allEmployees) {
      const name = e.department?.name || 'Unassigned';
      if (!deptStats[name]) deptStats[name] = { total: 0, active: 0 };
      deptStats[name].total++;
      if (e.employmentStatus === 'ACTIVE') deptStats[name].active++;
    }

    // Station breakdown
    const stationStats: Record<string, { total: number; active: number }> = {};
    for (const e of allEmployees) {
      const name = e.station?.name || 'Unassigned';
      if (!stationStats[name]) stationStats[name] = { total: 0, active: 0 };
      stationStats[name].total++;
      if (e.employmentStatus === 'ACTIVE') stationStats[name].active++;
    }

    // Labor cost analytics from latest payroll run
    const latestRun = await db.payrollRun.findFirst({
      where: { status: { in: ['APPROVED', 'FINALIZED', 'COMPLETED', 'CALCULATED'] } },
      orderBy: { createdAt: 'desc' },
      include: {
        payrollPeriod: true,
        employeeRecords: {
          include: {
            employee: {
              include: { department: true, station: true, branch: true },
            },
          },
        },
      },
    });

    let costData = null;
    if (latestRun && latestRun.employeeRecords.length > 0) {
      costData = EmployerCostCalculator.calculate(latestRun, latestRun.employeeRecords);
    }

    return {
      workforceTotals: {
        total: totalCount,
        active: activeCount,
        exited: exitedCount,
        turnoverRatePercentage: turnoverRate,
      },
      demographics: {
        gender: genderBreakdown,
      },
      departmentDistribution: Object.entries(deptStats).map(([name, stat]) => ({
        name,
        total: stat.total,
        active: stat.active,
      })),
      stationDistribution: Object.entries(stationStats).map(([name, stat]) => ({
        name,
        total: stat.total,
        active: stat.active,
      })),
      laborCostAnalytics: costData,
    };
  }
}
