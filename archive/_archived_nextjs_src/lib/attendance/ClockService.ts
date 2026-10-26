import { db } from '@/lib/db';
import { AttendanceCalculationService } from './AttendanceCalculationService';
import { ScheduleService } from './ScheduleService';
import { AttendancePolicyService } from './AttendancePolicyService';
import { AuditService } from '@/lib/audit';

export interface ClockInInput {
  employeeId: string;
  timestamp?: Date | string;
  source?: string; // PORTAL, WEB, MOBILE, BIOMETRIC, MANUAL
  deviceInfo?: string;
  ipAddress?: string;
  locationLat?: number;
  locationLng?: number;
  notes?: string;
  isRemote?: boolean;
  remoteLocationDescription?: string;
  createdById?: string;
}

export interface ClockOutInput {
  employeeId: string;
  timestamp?: Date | string;
  source?: string;
  deviceInfo?: string;
  ipAddress?: string;
  locationLat?: number;
  locationLng?: number;
  notes?: string;
  createdById?: string;
}

export class ClockService {
  /**
   * Normalizes date to midnight UTC for daily attendance records.
   */
  static getWorkdayDate(timestamp: Date = new Date()): Date {
    const d = new Date(timestamp);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Records a Clock In event. Prevents duplicate open clock-ins.
   */
  static async clockIn(input: ClockInInput) {
    const clockTime = input.timestamp ? new Date(input.timestamp) : new Date();
    const workday = this.getWorkdayDate(clockTime);

    // Check for existing open record
    const existing = await db.attendanceRecord.findUnique({
      where: {
        employeeId_date: {
          employeeId: input.employeeId,
          date: workday,
        },
      },
      include: { scheduledShift: true },
    });

    if (existing && existing.actualClockIn && !existing.actualClockOut) {
      throw new Error(`Employee is already clocked in at ${new Date(existing.actualClockIn).toLocaleTimeString('en-KE')}. Please clock out before clocking in again.`);
    }

    if (!existing) {
      const priorOpen = await db.attendanceRecord.findFirst({
        where: {
          employeeId: input.employeeId,
          actualClockIn: { not: null },
          actualClockOut: null,
        },
      });
      if (priorOpen) {
        throw new Error(`Employee is already clocked in at ${new Date(priorOpen.actualClockIn!).toLocaleTimeString('en-KE')}. Please clock out before clocking in again.`);
      }
    }

    // Resolve active shift assignment and policy
    const [assignment, settings] = await Promise.all([
      ScheduleService.getActiveAssignment(input.employeeId, clockTime),
      AttendancePolicyService.getSettings(),
    ]);

    const shift = assignment?.shift || null;
    const isCrossMidnight = shift?.isOvernight || false;

    const calc = AttendanceCalculationService.calculateAttendance(
      shift?.startTime,
      shift?.endTime,
      clockTime,
      null,
      {
        gracePeriodMinutes: shift?.gracePeriodMinutes ?? settings.gracePeriodMinutes,
        isCrossMidnight,
      }
    );

    let status = 'PRESENT';
    if (calc.isLate) status = 'LATE';
    if (input.isRemote) status = 'REMOTE';

    let record: any;

    if (existing) {
      record = await db.attendanceRecord.update({
        where: { id: existing.id },
        data: {
          actualClockIn: clockTime,
          actualClockOut: null,
          lateMinutes: calc.lateMinutes,
          attendanceStatus: status,
          source: input.source || 'PORTAL',
          isCrossMidnight,
          isRemote: input.isRemote ?? false,
          remoteLocationDescription: input.remoteLocationDescription || null,
          notes: input.notes || existing.notes,
        },
        include: { scheduledShift: true },
      });
    } else {
      record = await db.attendanceRecord.create({
        data: {
          employeeId: input.employeeId,
          date: workday,
          scheduledShiftId: shift?.id || null,
          scheduledStartTime: shift?.startTime || null,
          scheduledEndTime: shift?.endTime || null,
          actualClockIn: clockTime,
          lateMinutes: calc.lateMinutes,
          attendanceStatus: status,
          source: input.source || 'PORTAL',
          isCrossMidnight,
          isRemote: input.isRemote ?? false,
          remoteLocationDescription: input.remoteLocationDescription || null,
          notes: input.notes || null,
        },
        include: { scheduledShift: true },
      });
    }

    // Record Event
    await db.attendanceEvent.create({
      data: {
        attendanceRecordId: record.id,
        employeeId: input.employeeId,
        eventType: 'CLOCK_IN',
        timestamp: clockTime,
        source: input.source || 'PORTAL',
        deviceInfo: input.deviceInfo || null,
        ipAddress: input.ipAddress || null,
        locationLat: input.locationLat || null,
        locationLng: input.locationLng || null,
        notes: input.notes || null,
        createdById: input.createdById || null,
      },
    });

    if (input.createdById) {
      await AuditService.log({
        userId: input.createdById,
        action: 'ATTENDANCE_CLOCK_IN',
        resource: 'attendance_records',
        resourceId: record.id,
        details: { employeeId: input.employeeId, timestamp: clockTime, status },
      });
    }

    return record;
  }

  /**
   * Records a Clock Out event and finalizes working time calculations.
   */
  static async clockOut(input: ClockOutInput) {
    const clockTime = input.timestamp ? new Date(input.timestamp) : new Date();
    const workday = this.getWorkdayDate(clockTime);

    // Look for open attendance record for today or previous night shift
    let record = await db.attendanceRecord.findUnique({
      where: {
        employeeId_date: {
          employeeId: input.employeeId,
          date: workday,
        },
      },
      include: { scheduledShift: true },
    });

    // If not found or not clocked in, check previous day for overnight shift
    if (!record || !record.actualClockIn) {
      const yesterday = new Date(workday);
      yesterday.setDate(yesterday.getDate() - 1);

      const yesterdayRecord = await db.attendanceRecord.findUnique({
        where: {
          employeeId_date: {
            employeeId: input.employeeId,
            date: yesterday,
          },
        },
        include: { scheduledShift: true },
      });

      if (yesterdayRecord && yesterdayRecord.actualClockIn && !yesterdayRecord.actualClockOut) {
        record = yesterdayRecord;
      }
    }

    if (!record || !record.actualClockIn) {
      throw new Error('Cannot clock out: No active clock-in session found for this employee.');
    }

    if (record.actualClockOut) {
      throw new Error(`Employee is already clocked out at ${new Date(record.actualClockOut).toLocaleTimeString('en-KE')}.`);
    }

    const settings = await AttendancePolicyService.getSettings();
    const shift = record.scheduledShift;
    const isCrossMidnight = record.isCrossMidnight || shift?.isOvernight || false;

    const calc = AttendanceCalculationService.calculateAttendance(
      record.scheduledStartTime,
      record.scheduledEndTime,
      record.actualClockIn,
      clockTime,
      {
        gracePeriodMinutes: shift?.gracePeriodMinutes ?? settings.gracePeriodMinutes,
        earlyDepartureThresholdMinutes: settings.earlyDepartureThresholdMins,
        breakDurationMinutes: record.breakDurationMinutes,
        isBreakPaid: shift?.isBreakPaid ?? false,
        roundingIntervalMinutes: settings.roundingIntervalMinutes,
        isCrossMidnight,
      }
    );

    let status = record.attendanceStatus;
    if (status === 'PRESENT' || status === 'LATE') {
      if (calc.overtimeMinutes > 0) {
        status = 'PRESENT_WITH_OVERTIME';
      } else if (calc.isEarlyDeparture) {
        status = 'EARLY_DEPARTURE';
      }
    }

    const updatedRecord = await db.attendanceRecord.update({
      where: { id: record.id },
      data: {
        actualClockOut: clockTime,
        workedMinutes: calc.workedMinutes,
        earlyDepartureMinutes: calc.earlyDepartureMinutes,
        overtimeMinutes: calc.overtimeMinutes,
        attendanceStatus: status,
        notes: input.notes ? `${record.notes || ''} | ${input.notes}`.trim() : record.notes,
      },
      include: { scheduledShift: true },
    });

    // Record Clock Out Event
    await db.attendanceEvent.create({
      data: {
        attendanceRecordId: record.id,
        employeeId: input.employeeId,
        eventType: 'CLOCK_OUT',
        timestamp: clockTime,
        source: input.source || 'PORTAL',
        deviceInfo: input.deviceInfo || null,
        ipAddress: input.ipAddress || null,
        locationLat: input.locationLat || null,
        locationLng: input.locationLng || null,
        notes: input.notes || null,
        createdById: input.createdById || null,
      },
    });

    // If overtime occurred, record OvertimeRecord
    if (calc.overtimeHours > 0) {
      const existingOt = await db.overtimeRecord.findFirst({
        where: {
          employeeId: input.employeeId,
          attendanceRecordId: record.id,
        },
      });

      if (!existingOt) {
        await db.overtimeRecord.create({
          data: {
            employeeId: input.employeeId,
            attendanceRecordId: record.id,
            date: record.date,
            scheduledHours: AttendanceCalculationService.calculateScheduledHours(
              record.scheduledStartTime || '08:00',
              record.scheduledEndTime || '17:00',
              record.breakDurationMinutes,
              shift?.isBreakPaid ?? false
            ),
            actualHours: calc.workedHours,
            overtimeMinutes: calc.overtimeMinutes,
            overtimeHours: calc.overtimeHours,
            overtimeType: 'NORMAL',
            reason: 'Automated post-shift overtime threshold logged',
            approvalStatus: 'PENDING',
          },
        });
      }
    }

    if (input.createdById) {
      await AuditService.log({
        userId: input.createdById,
        action: 'ATTENDANCE_CLOCK_OUT',
        resource: 'attendance_records',
        resourceId: record.id,
        details: {
          employeeId: input.employeeId,
          clockOut: clockTime,
          workedMinutes: calc.workedMinutes,
          overtimeMinutes: calc.overtimeMinutes,
        },
      });
    }

    return updatedRecord;
  }

  /**
   * Retrieves active today attendance status for employee.
   */
  static async getTodayStatus(employeeId: string) {
    const today = this.getWorkdayDate(new Date());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [todayRecord, yesterdayRecord, assignment, events] = await Promise.all([
      db.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId, date: today } },
        include: { scheduledShift: true },
      }),
      db.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId, date: yesterday } },
        include: { scheduledShift: true },
      }),
      ScheduleService.getActiveAssignment(employeeId, new Date()),
      db.attendanceEvent.findMany({
        where: {
          employeeId,
          timestamp: { gte: yesterday },
        },
        orderBy: { timestamp: 'desc' },
        take: 10,
      }),
    ]);

    // Active session could be yesterday if overnight shift, or most recent unclosed shift
    let activeRecord =
      yesterdayRecord && yesterdayRecord.actualClockIn && !yesterdayRecord.actualClockOut
        ? yesterdayRecord
        : todayRecord;

    if (!activeRecord || (!activeRecord.actualClockIn || !!activeRecord.actualClockOut)) {
      const openRecord = await db.attendanceRecord.findFirst({
        where: {
          employeeId,
          actualClockIn: { not: null },
          actualClockOut: null,
        },
        orderBy: { date: 'desc' },
        include: { scheduledShift: true },
      });
      if (openRecord) activeRecord = openRecord;
    }

    const isClockedIn = !!activeRecord?.actualClockIn && !activeRecord?.actualClockOut;
    const isBreakActive = activeRecord?.isBreakActive ?? false;

    return {
      activeRecord,
      assignment,
      isClockedIn,
      isBreakActive,
      recentEvents: events,
    };
  }
}
