import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { resolveSessionEmployee } from '@/lib/portal/PortalAuth';
import { apiSuccess, apiError } from '@/lib/response';
import { EmployeeDashboardStats } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authContext = await resolveSessionEmployee();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { employee } = authContext;

    // 1. Latest Finalized Payroll Record & Payslip
    const latestRecord = await db.payrollEmployeeRecord.findFirst({
      where: {
        employeeId: employee.id,
        payrollRun: {
          status: { in: ['FINALIZED', 'PAID', 'APPROVED'] },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        payrollRun: {
          include: {
            payrollPeriod: true,
          },
        },
      },
    });

    // 2. Leave Summary
    const currentYear = new Date().getFullYear();
    const entitlements = await db.leaveEntitlement.findMany({
      where: {
        employeeId: employee.id,
        leaveYear: currentYear,
        status: 'ACTIVE',
      },
      include: {
        leaveType: true,
      },
    });

    let annualAvailable = 0;
    let sickAvailable = 0;
    for (const ent of entitlements) {
      if (ent.leaveType?.code?.includes('ANN') || ent.leaveType?.name?.toLowerCase().includes('annual')) {
        annualAvailable += ent.availableBalance;
      } else if (ent.leaveType?.code?.includes('SCK') || ent.leaveType?.name?.toLowerCase().includes('sick')) {
        sickAvailable += ent.availableBalance;
      } else {
        annualAvailable += ent.availableBalance; // generic fallback
      }
    }

    const pendingLeaveCount = await db.leaveRequest.count({
      where: {
        employeeId: employee.id,
        status: 'SUBMITTED',
      },
    });

    // 3. Attendance Summary (Current Month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const attendanceRecords = await db.attendanceRecord.findMany({
      where: {
        employeeId: employee.id,
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    let daysPresent = 0;
    let daysAbsent = 0;
    let daysLate = 0;
    let overtimeHours = 0;

    for (const att of attendanceRecords) {
      if (
        att.attendanceStatus === 'PRESENT' ||
        att.attendanceStatus === 'ON_DUTY' ||
        att.attendanceStatus === 'PRESENT_WITH_OVERTIME'
      ) {
        daysPresent++;
      } else if (att.attendanceStatus === 'ABSENT') {
        daysAbsent++;
      } else if (att.attendanceStatus === 'LATE') {
        daysPresent++;
        daysLate++;
      }
      overtimeHours += att.overtimeMinutes ? att.overtimeMinutes / 60 : 0;
    }

    // 4. Pending HR Requests Count
    const pendingRequestsCount = await db.hRRequest.count({
      where: {
        employeeId: employee.id,
        status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
      },
    });

    // 5. Last Payment Transaction
    const lastPayment = await db.paymentTransaction.findFirst({
      where: {
        employeeId: employee.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    const stats: EmployeeDashboardStats = {
      employee: {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        fullName: employee.fullName,
        jobTitle: employee.jobTitle,
        department: employee.department?.name || 'Operations',
        station: employee.station?.name || 'HQ / Unassigned',
        employmentStatus: employee.employmentStatus,
        employmentType: employee.employmentType,
        avatarUrl: employee.profilePhotoUrl || null,
      },
      currentNetPay: latestRecord ? latestRecord.netPay : 0,
      latestPayslip: latestRecord
        ? {
            id: latestRecord.id,
            periodName: latestRecord.payrollRun.payrollPeriod.name,
            periodNumber: latestRecord.payrollRun.payrollPeriod.periodNumber,
            netPay: latestRecord.netPay,
            grossPay: latestRecord.grossPay,
            totalDeductions: latestRecord.totalDeductions,
            paymentStatus: latestRecord.paymentStatus || 'PENDING',
            payDate: latestRecord.payrollRun.payrollPeriod.paymentDate
              ? latestRecord.payrollRun.payrollPeriod.paymentDate.toISOString()
              : null,
          }
        : null,
      leaveSummary: {
        annualAvailable: Math.max(0, annualAvailable),
        sickAvailable: Math.max(0, sickAvailable),
        pendingApplications: pendingLeaveCount,
      },
      attendanceSummary: {
        month: `${monthNames[now.getMonth()]} ${now.getFullYear()}`,
        daysPresent,
        daysAbsent,
        daysLate,
        overtimeHours: Math.round(overtimeHours * 10) / 10,
      },
      pendingRequestsCount,
      lastPayment: lastPayment
        ? {
            transactionNumber: lastPayment.transactionNumber,
            amount: lastPayment.amount,
            paymentMethod: lastPayment.paymentMethod,
            status: lastPayment.status,
            paidAt: lastPayment.completedAt ? lastPayment.completedAt.toISOString() : lastPayment.createdAt.toISOString(),
          }
        : null,
    };

    return apiSuccess(stats);
  } catch (error: any) {
    console.error('Error fetching employee dashboard stats:', error);
    return apiError(error.message || 'Failed to load employee portal dashboard');
  }
}
