import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    const [
      totalUsers,
      activeUsers,
      totalBranches,
      activeBranches,
      totalDepartments,
      activeDepartments,
      totalStations,
      activeStations,
      totalPositions,
      activePositions,
      totalEmployees,
      activeEmployees,
      onLeaveEmployees,
      inactiveEmployees,
      unassignedEmployees,
      departmentBreakdown,
      branchBreakdown,
      stationList,
      recentAuditLogs,
      companySetting,
      todayAttendance,
      pendingOvertimeCount,
      pendingApprovalCount,
      onLeaveTodayCount,
      pendingLeaveApprovalCount,
      currentOpenPeriod,
      activeSalariesList,
      pendingSalaryProposalsCount,
    ] = await Promise.all([
      db.user.count({ where: { deletedAt: null } }),
      db.user.count({ where: { isActive: true, deletedAt: null } }),
      db.branch.count({ where: { deletedAt: null } }),
      db.branch.count({ where: { isActive: true, deletedAt: null } }),
      db.department.count({ where: { deletedAt: null } }),
      db.department.count({ where: { isActive: true, deletedAt: null } }),
      db.station.count({ where: { deletedAt: null } }),
      db.station.count({ where: { isActive: true, deletedAt: null } }),
      db.position.count({ where: { deletedAt: null } }),
      db.position.count({ where: { isActive: true, deletedAt: null } }),
      db.employee.count({ where: { deletedAt: null, isArchived: false } }),
      db.employee.count({ where: { deletedAt: null, isArchived: false, employmentStatus: 'ACTIVE' } }),
      db.employee.count({ where: { deletedAt: null, isArchived: false, employmentStatus: 'ON_LEAVE' } }),
      db.employee.count({
        where: {
          deletedAt: null,
          OR: [{ isArchived: true }, { employmentStatus: { in: ['INACTIVE', 'TERMINATED', 'RESIGNED', 'RETIRED'] } }],
        },
      }),
      db.employee.count({
        where: {
          deletedAt: null,
          isArchived: false,
          OR: [{ branchId: null }, { departmentId: null }],
        },
      }),
      db.department.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          code: true,
          _count: {
            select: {
              employees: { where: { deletedAt: null, isArchived: false } },
            },
          },
        },
      }),
      db.branch.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          code: true,
          _count: {
            select: {
              employees: { where: { deletedAt: null, isArchived: false } },
            },
          },
        },
      }),
      db.station.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          code: true,
          requiredStaffing: true,
          _count: {
            select: {
              employees: { where: { deletedAt: null, isArchived: false, employmentStatus: 'ACTIVE' } },
            },
          },
        },
      }),
      db.auditLog.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
      }),
      db.companySetting.findFirst(),
      db.attendanceRecord.findMany({
        where: {
          date: { gte: today, lte: endOfToday },
        },
        select: {
          attendanceStatus: true,
          lateMinutes: true,
          overtimeMinutes: true,
        },
      }),
      db.overtimeRecord.count({
        where: { approvalStatus: 'PENDING' },
      }),
      db.attendanceRecord.count({
        where: { approvalStatus: 'SUBMITTED' },
      }),
      db.leaveRequest.count({
        where: {
          status: 'APPROVED',
          startDate: { lte: endOfToday },
          endDate: { gte: today },
        },
      }),
      db.leaveRequest.count({
        where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
      }),
      db.payrollPeriod.findFirst({
        where: { status: 'OPEN' },
      }),
      db.salaryRecord.findMany({
        where: { status: 'ACTIVE' },
        select: { basicSalary: true, employeeId: true },
      }),
      db.salaryRecord.count({
        where: { status: 'PENDING_APPROVAL' },
      }),
    ]);

    const totalRequiredGuardQuota = stationList.reduce((acc, s) => acc + s.requiredStaffing, 0);
    const totalDeployedGuards = stationList.reduce((acc, s) => acc + s._count.employees, 0);

    let presentToday = 0;
    let lateToday = 0;
    let absentToday = 0;
    let totalOvertimeMins = 0;

    for (const r of todayAttendance) {
      if (r.attendanceStatus === 'PRESENT' || r.attendanceStatus === 'PRESENT_WITH_OVERTIME') presentToday++;
      else if (r.attendanceStatus === 'LATE') lateToday++;
      else if (r.attendanceStatus === 'ABSENT') absentToday++;
      totalOvertimeMins += r.overtimeMinutes;
    }

    const uniqueSalariesCount = new Set(activeSalariesList.map((s) => s.employeeId)).size;
    const totalMonthlyPayrollKES = activeSalariesList.reduce((acc, s) => acc + s.basicSalary, 0);

    return apiSuccess({
      foundationMetrics: {
        totalUsers,
        activeUsers,
        totalBranches,
        activeBranches,
        totalDepartments,
        activeDepartments,
        totalStations,
        activeStations,
        totalPositions,
        activePositions,
        unassignedEmployees,
        systemStatus: 'Operational',
        databaseEngine: 'SQLite (Postgres-ready)',
        authRegime: 'RBAC Active',
      },
      employeeMetrics: {
        totalEmployees,
        activeEmployees,
        onLeaveEmployees,
        inactiveEmployees,
        unassignedEmployees,
        totalRequiredGuardQuota,
        totalDeployedGuards,
        guardingShortage: Math.max(0, totalRequiredGuardQuota - totalDeployedGuards),
        departments: departmentBreakdown.map((d) => ({
          name: d.name,
          code: d.code,
          count: d._count.employees,
        })),
        branches: branchBreakdown.map((b) => ({
          name: b.name,
          code: b.code,
          count: b._count.employees,
        })),
      },
      attendanceMetrics: {
        presentToday,
        lateToday,
        absentToday,
        totalRecordedToday: todayAttendance.length,
        totalOvertimeHoursToday: Math.round((totalOvertimeMins / 60) * 10) / 10,
        pendingOvertimeClaims: pendingOvertimeCount,
        pendingAttendanceApprovals: pendingApprovalCount,
      },
      leaveMetrics: {
        onLeaveToday: onLeaveTodayCount,
        pendingLeaveApprovals: pendingLeaveApprovalCount,
      },
      payrollStatus: {
        currentPeriod: currentOpenPeriod ? currentOpenPeriod.name : 'August 2026 Monthly Payroll',
        periodCode: currentOpenPeriod ? currentOpenPeriod.periodNumber : 'PRD-2026-08',
        phaseStatus: 'Phase 6 Active (Configuration & Salaries Set)',
        statutoryRegime: 'Kenya 2026 (PAYE / NSSF / SHA / AHL Configured)',
        coveredEmployees: uniqueSalariesCount,
        totalMonthlyPayrollKES,
        pendingSalaryProposals: pendingSalaryProposalsCount,
      },
      company: {
        name: companySetting?.companyName || 'CorpSec Investigations & Guarding Services',
        currency: companySetting?.defaultCurrency || 'KES',
        timezone: companySetting?.timezone || 'Africa/Nairobi',
      },
      recentLogs: recentAuditLogs,
    });
  } catch (error) {
    console.error('Fetch dashboard stats error:', error);
    return apiError('Failed to fetch dashboard foundation statistics.');
  }
}
