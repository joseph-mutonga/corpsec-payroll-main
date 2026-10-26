import { db } from '@/lib/db';
import { CoverageService } from './CoverageService';
import { AttendanceAnalyticsService } from './AttendanceAnalyticsService';

export class AttendanceReportService {
  /**
   * Helper: converts an array of objects to standard CSV string.
   */
  static convertToCsv(headers: string[], rows: any[][]): string {
    const headerLine = headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',');
    const dataLines = rows.map((row) =>
      row.map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',')
    );
    return [headerLine, ...dataLines].join('\r\n');
  }

  /**
   * Generates Attendance Register Report.
   */
  static async generateAttendanceRegister(params: {
    startDate?: Date | string;
    endDate?: Date | string;
    departmentId?: string;
    format?: 'json' | 'csv';
  }) {
    const start = params.startDate ? new Date(params.startDate) : new Date();
    start.setHours(0, 0, 0, 0);

    const end = params.endDate ? new Date(params.endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const where: any = {
      date: { gte: start, lte: end },
    };
    if (params.departmentId && params.departmentId !== 'ALL') {
      where.employee = { departmentId: params.departmentId };
    }

    const records = await db.attendanceRecord.findMany({
      where,
      orderBy: [{ date: 'desc' }, { employee: { fullName: 'asc' } }],
      include: {
        scheduledShift: true,
        employee: {
          select: {
            id: true,
            fullName: true,
            employeeNumber: true,
            department: { select: { name: true } },
            station: { select: { name: true } },
          },
        },
      },
    });

    if (params.format === 'csv') {
      const headers = [
        'Date',
        'Employee Number',
        'Employee Name',
        'Department',
        'Station',
        'Shift',
        'Clock In',
        'Clock Out',
        'Worked Hours',
        'Late Minutes',
        'Early Departure (Mins)',
        'Overtime (Hrs)',
        'Status',
      ];
      const rows = records.map((r) => [
        new Date(r.date).toLocaleDateString('en-KE'),
        r.employee.employeeNumber,
        r.employee.fullName,
        r.employee.department?.name || 'N/A',
        r.employee.station?.name || 'N/A',
        r.scheduledShift?.name || 'Standard',
        r.actualClockIn ? new Date(r.actualClockIn).toLocaleTimeString('en-KE') : '—',
        r.actualClockOut ? new Date(r.actualClockOut).toLocaleTimeString('en-KE') : '—',
        (r.workedMinutes / 60).toFixed(2),
        r.lateMinutes,
        r.earlyDepartureMinutes,
        (r.overtimeMinutes / 60).toFixed(2),
        r.attendanceStatus,
      ]);
      return this.convertToCsv(headers, rows);
    }

    return records;
  }

  /**
   * Generates Overtime Report.
   */
  static async generateOvertimeReport(params: {
    startDate?: Date | string;
    endDate?: Date | string;
    format?: 'json' | 'csv';
  }) {
    const start = params.startDate ? new Date(params.startDate) : new Date();
    start.setHours(0, 0, 0, 0);

    const end = params.endDate ? new Date(params.endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const overtimes = await db.overtimeRecord.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: 'desc' },
      include: {
        employee: {
          select: {
            employeeNumber: true,
            fullName: true,
            department: { select: { name: true } },
          },
        },
      },
    });

    if (params.format === 'csv') {
      const headers = [
        'Date',
        'Employee Number',
        'Employee Name',
        'Department',
        'Overtime Hours',
        'Type',
        'Rate Multiplier',
        'Reason',
        'Approval Status',
      ];
      const rows = overtimes.map((ot) => [
        new Date(ot.date).toLocaleDateString('en-KE'),
        ot.employee.employeeNumber,
        ot.employee.fullName,
        ot.employee.department?.name || 'N/A',
        ot.overtimeHours.toFixed(2),
        ot.overtimeType,
        ot.overtimeRateMultiplier,
        ot.reason,
        ot.approvalStatus,
      ]);
      return this.convertToCsv(headers, rows);
    }

    return overtimes;
  }

  /**
   * Generates Station Coverage Report.
   */
  static async generateCoverageReport(targetDate: Date | string = new Date(), format: 'json' | 'csv' = 'json') {
    const coverage = await CoverageService.getStationCoverage(targetDate);

    if (format === 'csv') {
      const headers = [
        'Station Code',
        'Station Name',
        'Branch',
        'Required Guards',
        'Scheduled Guards',
        'Present Guards',
        'Missing Guards',
        'On Leave Guards',
        'Coverage %',
        'Status',
      ];
      const rows = coverage.map((c) => [
        c.stationCode,
        c.stationName,
        c.branchName || 'N/A',
        c.requiredPersonnel,
        c.scheduledPersonnel,
        c.presentPersonnel,
        c.missingPersonnel,
        c.onLeavePersonnel,
        `${c.coveragePercentage}%`,
        c.status,
      ]);
      return this.convertToCsv(headers, rows);
    }

    return coverage;
  }
}
