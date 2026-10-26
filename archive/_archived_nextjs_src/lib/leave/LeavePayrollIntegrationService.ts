import { db } from '../db';

export interface LeavePayrollSummary {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  departmentName: string;
  totalLeaveDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  leaveRequests: Array<{
    requestNumber: string;
    leaveTypeName: string;
    isPaid: boolean;
    startDate: Date;
    endDate: Date;
    durationDays: number;
  }>;
}

export class LeavePayrollIntegrationService {
  /**
   * Retrieves leave consumption data for a specific payroll period date range.
   */
  static async getPeriodLeaveData(
    periodStartDate: Date | string,
    periodEndDate: Date | string,
    departmentId?: string
  ): Promise<LeavePayrollSummary[]> {
    const start = new Date(periodStartDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(periodEndDate);
    end.setHours(23, 59, 59, 999);

    const employeeWhere: any = {
      employmentStatus: 'ACTIVE',
      deletedAt: null,
    };
    if (departmentId && departmentId !== 'ALL') {
      employeeWhere.departmentId = departmentId;
    }

    const employees = await db.employee.findMany({
      where: employeeWhere,
      orderBy: { fullName: 'asc' },
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    const summaries: LeavePayrollSummary[] = [];

    for (const emp of employees) {
      const approvedLeaves = await db.leaveRequest.findMany({
        where: {
          employeeId: emp.id,
          status: { in: ['APPROVED', 'COMPLETED', 'ACTIVE'] },
          AND: [
            { startDate: { lte: end } },
            { endDate: { gte: start } },
          ],
        },
        include: { leaveType: true },
      });

      if (approvedLeaves.length === 0) continue;

      let paidDays = 0;
      let unpaidDays = 0;
      let totalDays = 0;

      const details = approvedLeaves.map((r) => {
        totalDays += r.durationDays;
        if (r.leaveType.isPaid) {
          paidDays += r.durationDays;
        } else {
          unpaidDays += r.durationDays;
        }

        return {
          requestNumber: r.requestNumber,
          leaveTypeName: r.leaveType.name,
          isPaid: r.leaveType.isPaid,
          startDate: r.startDate,
          endDate: r.endDate,
          durationDays: r.durationDays,
        };
      });

      summaries.push({
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        employeeName: emp.fullName,
        departmentName: emp.department?.name || 'General',
        totalLeaveDays: totalDays,
        paidLeaveDays: paidDays,
        unpaidLeaveDays: unpaidDays,
        leaveRequests: details,
      });
    }

    return summaries;
  }
}
