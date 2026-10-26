import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export interface RosterEntry {
  date: string; // YYYY-MM-DD
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  departmentName?: string;
  stationName?: string;
  shiftId?: string;
  shiftCode?: string;
  shiftName?: string;
  startTime?: string;
  endTime?: string;
  status: 'SCHEDULED' | 'ON_LEAVE' | 'HOLIDAY' | 'REST_DAY' | 'PRESENT' | 'ABSENT' | 'LATE';
  leaveType?: string;
  notes?: string;
}

export class RosterService {
  /**
   * Generates or retrieves team roster across date range.
   */
  static async getTeamRoster(params: {
    startDate: Date | string;
    endDate: Date | string;
    departmentId?: string;
    stationId?: string;
    branchId?: string;
    employeeId?: string;
  }): Promise<RosterEntry[]> {
    const start = new Date(params.startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(params.endDate);
    end.setHours(23, 59, 59, 999);

    const empWhere: any = {
      employmentStatus: 'ACTIVE',
      deletedAt: null,
    };
    if (params.departmentId && params.departmentId !== 'ALL') empWhere.departmentId = params.departmentId;
    if (params.stationId && params.stationId !== 'ALL') empWhere.stationId = params.stationId;
    if (params.branchId && params.branchId !== 'ALL') empWhere.branchId = params.branchId;
    if (params.employeeId) empWhere.id = params.employeeId;

    const [employees, shiftAssignments, holidays, leaves, attendanceRecords] = await Promise.all([
      db.employee.findMany({
        where: empWhere,
        include: { department: true, station: true },
        orderBy: { fullName: 'asc' },
      }),
      db.employeeShiftAssignment.findMany({
        where: {
          startDate: { lte: end },
          OR: [{ endDate: null }, { endDate: { gte: start } }],
          status: 'ACTIVE',
        },
        include: { shift: true, workSchedule: true },
      }),
      db.publicHoliday.findMany({
        where: {
          date: { gte: start, lte: end },
          isActive: true,
          deletedAt: null,
        },
      }),
      db.leaveRequest.findMany({
        where: {
          status: { in: ['APPROVED', 'ACTIVE'] },
          startDate: { lte: end },
          endDate: { gte: start },
        },
        include: { leaveType: true },
      }),
      db.attendanceRecord.findMany({
        where: {
          date: { gte: start, lte: end },
        },
        include: { scheduledShift: true },
      }),
    ]);

    const toDateKey = (d: Date | string) => {
      const date = new Date(d);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };

    const roster: RosterEntry[] = [];
    const currentDate = new Date(start);

    while (currentDate <= end) {
      const dateKey = toDateKey(currentDate);
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);

      // Check Holiday
      const holiday = holidays.find(
        (h) => toDateKey(h.date) === dateKey
      );

      for (const emp of employees) {
        // 1. Check Leave
        const activeLeave = leaves.find(
          (l) =>
            l.employeeId === emp.id &&
            new Date(l.startDate) <= dayEnd &&
            new Date(l.endDate) >= dayStart
        );

        if (activeLeave) {
          roster.push({
            date: dateKey,
            employeeId: emp.id,
            employeeName: emp.fullName,
            employeeNumber: emp.employeeNumber,
            departmentName: emp.department?.name,
            stationName: emp.station?.name,
            status: 'ON_LEAVE',
            leaveType: activeLeave.leaveType?.name,
            notes: `Approved Leave (${activeLeave.requestNumber})`,
          });
          continue;
        }

        // 2. Check Active Assignment & Shift
        const assignment = shiftAssignments.find(
          (sa) =>
            sa.employeeId === emp.id &&
            new Date(sa.startDate) <= dayEnd &&
            (!sa.endDate || new Date(sa.endDate) >= dayStart)
        );

        // Check Attendance Record
        const att = attendanceRecords.find(
          (a) => a.employeeId === emp.id && toDateKey(a.date) === dateKey
        );

        if (att && att.actualClockIn) {
          roster.push({
            date: dateKey,
            employeeId: emp.id,
            employeeName: emp.fullName,
            employeeNumber: emp.employeeNumber,
            departmentName: emp.department?.name,
            stationName: emp.station?.name,
            shiftId: att.scheduledShiftId || assignment?.shiftId || undefined,
            shiftCode: att.scheduledShift?.code || assignment?.shift?.code,
            shiftName: att.scheduledShift?.name || assignment?.shift?.name,
            startTime: att.scheduledStartTime || assignment?.shift?.startTime,
            endTime: att.scheduledEndTime || assignment?.shift?.endTime,
            status: att.attendanceStatus === 'LATE' ? 'LATE' : 'PRESENT',
            notes: `Clocked In: ${new Date(att.actualClockIn).toLocaleTimeString('en-KE')}`,
          });
          continue;
        }

        // 3. Holiday vs Shift
        if (holiday && !assignment?.shiftId) {
          roster.push({
            date: dateKey,
            employeeId: emp.id,
            employeeName: emp.fullName,
            employeeNumber: emp.employeeNumber,
            departmentName: emp.department?.name,
            stationName: emp.station?.name,
            status: 'HOLIDAY',
            notes: `Gazetted Holiday: ${holiday.name}`,
          });
          continue;
        }

        // 4. Scheduled Shift or Rest Day
        if (assignment?.shift) {
          roster.push({
            date: dateKey,
            employeeId: emp.id,
            employeeName: emp.fullName,
            employeeNumber: emp.employeeNumber,
            departmentName: emp.department?.name,
            stationName: emp.station?.name,
            shiftId: assignment.shift.id,
            shiftCode: assignment.shift.code,
            shiftName: assignment.shift.name,
            startTime: assignment.shift.startTime,
            endTime: assignment.shift.endTime,
            status: 'SCHEDULED',
            notes: holiday ? `Working on Public Holiday (${holiday.name})` : undefined,
          });
        } else {
          roster.push({
            date: dateKey,
            employeeId: emp.id,
            employeeName: emp.fullName,
            employeeNumber: emp.employeeNumber,
            departmentName: emp.department?.name,
            stationName: emp.station?.name,
            status: 'REST_DAY',
            notes: 'Scheduled Off Day',
          });
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return roster;
  }

  /**
   * Bulk creates employee shift roster assignments for a station or department.
   */
  static async bulkAssignRoster(data: {
    employeeIds: string[];
    shiftId: string;
    stationId?: string;
    startDate: Date | string;
    endDate?: Date | string;
    notes?: string;
    createdById?: string;
  }) {
    const results = [];
    for (const employeeId of data.employeeIds) {
      const assignment = await db.employeeShiftAssignment.create({
        data: {
          employeeId,
          shiftId: data.shiftId,
          stationId: data.stationId || null,
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : null,
          status: 'ACTIVE',
          notes: data.notes || 'Bulk roster assignment',
          createdById: data.createdById || null,
        },
      });
      results.push(assignment);
    }

    if (data.createdById) {
      await AuditService.log({
        userId: data.createdById,
        action: 'BULK_ROSTER_ASSIGNMENT',
        resource: 'employee_shift_assignments',
        resourceId: `bulk-${Date.now()}`,
        details: { count: data.employeeIds.length, shiftId: data.shiftId },
      });
    }

    return results;
  }
}
