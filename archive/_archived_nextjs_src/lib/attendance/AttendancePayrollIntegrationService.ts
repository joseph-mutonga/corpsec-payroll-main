import { db } from '@/lib/db';
import { TimesheetService } from './TimesheetService';

export interface EmployeePayrollAttendanceSummary {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  departmentName?: string;
  stationName?: string;
  regularHours: number;
  overtimeHours: number;
  holidayOvertimeHours: number;
  restDayOvertimeHours: number;
  totalWorkedHours: number;
  unpaidAbsenceHours: number;
  unpaidLeaveDays: number;
  lateMinutesTotal: number;
  timesheetApproved: boolean;
  timesheetLocked: boolean;
}

export class AttendancePayrollIntegrationService {
  /**
   * Generates payroll consumption dataset for a specific payroll period date range.
   * STRICT SAFETY INVARIANT: Read-only extraction. Does not mutate payroll tables or base salaries.
   */
  static async getPeriodAttendanceData(startDate: Date | string, endDate: Date | string): Promise<EmployeePayrollAttendanceSummary[]> {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const [employees, records, overtimes, unpaidLeaves, timesheets] = await Promise.all([
      db.employee.findMany({
        where: { employmentStatus: 'ACTIVE', deletedAt: null },
        include: { department: true, station: true },
        orderBy: { fullName: 'asc' },
      }),
      db.attendanceRecord.findMany({
        where: {
          date: { gte: start, lte: end },
        },
      }),
      db.overtimeRecord.findMany({
        where: {
          date: { gte: start, lte: end },
          approvalStatus: 'APPROVED',
        },
      }),
      db.leaveRequest.findMany({
        where: {
          status: { in: ['APPROVED', 'ACTIVE'] },
          startDate: { lte: end },
          endDate: { gte: start },
          leaveType: { isPaid: false },
        },
      }),
      db.timesheet.findMany({
        where: {
          periodStart: { gte: start },
          periodEnd: { lte: end },
        },
      }),
    ]);

    const summaries: EmployeePayrollAttendanceSummary[] = [];

    for (const emp of employees) {
      const empRecords = records.filter((r) => r.employeeId === emp.id);
      const empOvertimes = overtimes.filter((ot) => ot.employeeId === emp.id);
      const empUnpaidLeaves = unpaidLeaves.filter((l) => l.employeeId === emp.id);
      const empTimesheet = timesheets.find((ts) => ts.employeeId === emp.id);

      let totalWorkedMinutes = 0;
      let lateMinutesTotal = 0;
      let unpaidAbsenceHours = 0;

      for (const r of empRecords) {
        totalWorkedMinutes += r.workedMinutes;
        lateMinutesTotal += r.lateMinutes;
        if (r.attendanceStatus === 'ABSENT') {
          unpaidAbsenceHours += 8;
        }
      }

      let normalOtHours = 0;
      let holidayOtHours = 0;
      let restDayOtHours = 0;

      for (const ot of empOvertimes) {
        if (ot.overtimeType === 'HOLIDAY') holidayOtHours += ot.overtimeHours;
        else if (ot.overtimeType === 'REST_DAY') restDayOtHours += ot.overtimeHours;
        else normalOtHours += ot.overtimeHours;
      }

      const totalWorkedHours = Number((totalWorkedMinutes / 60).toFixed(2));
      const totalOvertimeHours = Number((normalOtHours + holidayOtHours + restDayOtHours).toFixed(2));
      const regularHours = Math.max(0, Number((totalWorkedHours - totalOvertimeHours).toFixed(2)));

      let unpaidLeaveDays = 0;
      for (const ul of empUnpaidLeaves) {
        unpaidLeaveDays += ul.durationDays;
      }

      summaries.push({
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        employeeName: emp.fullName,
        departmentName: emp.department?.name,
        stationName: emp.station?.name,
        regularHours,
        overtimeHours: normalOtHours,
        holidayOvertimeHours: holidayOtHours,
        restDayOvertimeHours: restDayOtHours,
        totalWorkedHours,
        unpaidAbsenceHours,
        unpaidLeaveDays,
        lateMinutesTotal,
        timesheetApproved: empTimesheet?.status === 'APPROVED' || empTimesheet?.status === 'LOCKED',
        timesheetLocked: empTimesheet?.isPayrollLocked ?? false,
      });
    }

    return summaries;
  }

  /**
   * Enforces period attendance locking upon payroll finalization.
   */
  static async lockAttendanceForPayroll(startDate: Date | string, endDate: Date | string, lockerUserId?: string) {
    return TimesheetService.lockTimesheetsForPeriod(startDate, endDate, lockerUserId);
  }
}
