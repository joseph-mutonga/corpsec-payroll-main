import { db } from '@/lib/db';

export interface CommandCenterKpis {
  presentToday: number;
  absentToday: number;
  lateToday: number;
  onLeaveToday: number;
  remoteToday: number;
  earlyDeparturesToday: number;
  missingClockOut: number;
  overtimeHoursToday: number;
  attendanceRate: number;
  pendingTimesheets: number;
  totalActiveEmployees: number;
}

export interface DepartmentAttendanceSummary {
  departmentId: string;
  departmentName: string;
  totalEmployees: number;
  present: number;
  absent: number;
  onLeave: number;
  late: number;
  attendanceRate: number;
}

export class AttendanceAnalyticsService {
  /**
   * Retrieves live Attendance Command Center KPIs for today.
   */
  static async getCommandCenterKpis(targetDate: Date | string = new Date()): Promise<CommandCenterKpis> {
    const today = new Date(targetDate);
    today.setHours(0, 0, 0, 0);

    const [totalActiveEmployees, todayRecords, pendingTimesheets] = await Promise.all([
      db.employee.count({
        where: { employmentStatus: 'ACTIVE', deletedAt: null },
      }),
      db.attendanceRecord.findMany({
        where: { date: today },
      }),
      db.timesheet.count({
        where: { status: { in: ['SUBMITTED', 'MANAGER_REVIEW'] } },
      }),
    ]);

    let presentToday = 0;
    let absentToday = 0;
    let lateToday = 0;
    let onLeaveToday = 0;
    let remoteToday = 0;
    let earlyDeparturesToday = 0;
    let missingClockOut = 0;
    let overtimeMinutesToday = 0;

    for (const r of todayRecords) {
      if (['PRESENT', 'PRESENT_WITH_OVERTIME', 'LATE', 'EARLY_DEPARTURE'].includes(r.attendanceStatus) && !!r.actualClockIn) {
        presentToday++;
      }
      if (r.attendanceStatus === 'ABSENT') absentToday++;
      if (r.attendanceStatus === 'LATE' || r.lateMinutes > 0) lateToday++;
      if (r.attendanceStatus === 'ON_LEAVE' || r.attendanceStatus === 'SICK_LEAVE') onLeaveToday++;
      if (r.isRemote || r.attendanceStatus === 'REMOTE') remoteToday++;
      if (r.earlyDepartureMinutes > 0 || r.attendanceStatus === 'EARLY_DEPARTURE') earlyDeparturesToday++;
      if (r.actualClockIn && !r.actualClockOut) missingClockOut++;
      overtimeMinutesToday += r.overtimeMinutes;
    }

    const scheduledBaseline = Math.max(1, totalActiveEmployees - onLeaveToday);
    const attendanceRate = Number(((presentToday / scheduledBaseline) * 100).toFixed(1));
    const overtimeHoursToday = Number((overtimeMinutesToday / 60).toFixed(2));

    return {
      presentToday,
      absentToday,
      lateToday,
      onLeaveToday,
      remoteToday,
      earlyDeparturesToday,
      missingClockOut,
      overtimeHoursToday,
      attendanceRate: Math.min(100, attendanceRate),
      pendingTimesheets,
      totalActiveEmployees,
    };
  }

  /**
   * Generates department attendance breakdown for a given date.
   */
  static async getDepartmentSummary(targetDate: Date | string = new Date()): Promise<DepartmentAttendanceSummary[]> {
    const date = new Date(targetDate);
    date.setHours(0, 0, 0, 0);

    const [departments, employees, records] = await Promise.all([
      db.department.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { name: 'asc' },
      }),
      db.employee.findMany({
        where: { employmentStatus: 'ACTIVE', deletedAt: null },
        select: { id: true, departmentId: true },
      }),
      db.attendanceRecord.findMany({
        where: { date },
        include: { employee: { select: { departmentId: true } } },
      }),
    ]);

    const summaries: DepartmentAttendanceSummary[] = [];

    for (const dept of departments) {
      const deptEmployees = employees.filter((e) => e.departmentId === dept.id);
      const totalEmployees = deptEmployees.length;
      const deptRecords = records.filter((r) => r.employee.departmentId === dept.id);

      const present = deptRecords.filter((r) =>
        ['PRESENT', 'PRESENT_WITH_OVERTIME', 'LATE', 'EARLY_DEPARTURE'].includes(r.attendanceStatus) &&
        !!r.actualClockIn
      ).length;

      const absent = deptRecords.filter((r) => r.attendanceStatus === 'ABSENT').length;
      const onLeave = deptRecords.filter((r) => r.attendanceStatus === 'ON_LEAVE' || r.attendanceStatus === 'SICK_LEAVE').length;
      const late = deptRecords.filter((r) => r.attendanceStatus === 'LATE' || r.lateMinutes > 0).length;

      const baseline = Math.max(1, totalEmployees - onLeave);
      const attendanceRate = totalEmployees > 0 ? Math.min(100, Number(((present / baseline) * 100).toFixed(1))) : 100.0;

      summaries.push({
        departmentId: dept.id,
        departmentName: dept.name,
        totalEmployees,
        present,
        absent,
        onLeave,
        late,
        attendanceRate,
      });
    }

    return summaries;
  }
}
