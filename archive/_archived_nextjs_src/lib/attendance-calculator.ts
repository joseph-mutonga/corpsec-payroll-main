// CorpSec HR Payroll — Attendance & Time Calculation Engine
// Handles normal shifts, overnight shifts crossing midnight, grace periods,
// breaks, late arrivals, early departures, and overtime without monetary conversion.

export interface ShiftInfo {
  startTime: string; // "HH:mm" e.g. "06:00", "18:00"
  endTime: string;   // "HH:mm" e.g. "18:00", "06:00"
  isOvernight?: boolean;
  gracePeriodMinutes?: number;
  breakDurationMinutes?: number;
  isBreakPaid?: boolean;
}

export interface AttendanceEvaluationInput {
  workDate: Date; // The calendar workday represented
  shift?: ShiftInfo | null;
  actualClockIn?: Date | string | null;
  actualClockOut?: Date | string | null;
  customBreakMinutes?: number;
  existingStatus?: string;
}

export interface AttendanceEvaluationResult {
  workedMinutes: number;
  workedHours: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  overtimeMinutes: number;
  overtimeHours: number;
  attendanceStatus: string;
  isComplete: boolean;
  scheduledMinutes: number;
}

/**
 * Parses "HH:mm" string into minutes from midnight (0 - 1439).
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10));
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

/**
 * Calculates shift duration in minutes, safely handling overnight shifts crossing midnight.
 */
export function calculateShiftDurationMinutes(startTime: string, endTime: string, isOvernight = false): number {
  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);

  if (isOvernight || endMins <= startMins) {
    // Crosses midnight: (1440 - start) + end
    return 1440 - startMins + endMins;
  }

  return endMins - startMins;
}

/**
 * Given a work date and "HH:mm", constructs a full Date object.
 * For overnight shift end times, sets it to the subsequent calendar day.
 */
export function constructShiftDateTime(workDate: Date, timeStr: string, isNextDay = false): Date {
  const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10));
  const d = new Date(workDate.getFullYear(), workDate.getMonth(), workDate.getDate(), h, m, 0, 0);
  if (isNextDay) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/**
 * Core attendance calculation engine.
 */
export function evaluateAttendance(input: AttendanceEvaluationInput): AttendanceEvaluationResult {
  const { workDate, shift, actualClockIn, actualClockOut, customBreakMinutes, existingStatus } = input;

  // Handle special predefined statuses (OFF_DAY, REST_DAY, PUBLIC_HOLIDAY, ON_LEAVE, SICK_LEAVE, EXCUSED_ABSENCE)
  const specialStatuses = ['OFF_DAY', 'REST_DAY', 'PUBLIC_HOLIDAY', 'ON_LEAVE', 'SICK_LEAVE', 'EXCUSED_ABSENCE'];
  if (existingStatus && specialStatuses.includes(existingStatus)) {
    return {
      workedMinutes: 0,
      workedHours: 0,
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      overtimeMinutes: 0,
      overtimeHours: 0,
      attendanceStatus: existingStatus,
      isComplete: true,
      scheduledMinutes: 0,
    };
  }

  // Parse clock dates
  const clockIn = actualClockIn ? new Date(actualClockIn) : null;
  const clockOut = actualClockOut ? new Date(actualClockOut) : null;

  // If no shift is assigned or configured
  if (!shift) {
    if (!clockIn && !clockOut) {
      return {
        workedMinutes: 0,
        workedHours: 0,
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        overtimeMinutes: 0,
        overtimeHours: 0,
        attendanceStatus: 'OFF_DAY',
        isComplete: true,
        scheduledMinutes: 0,
      };
    }

    // Has clocks without assigned shift
    let workedMinutes = 0;
    if (clockIn && clockOut) {
      const diffMs = clockOut.getTime() - clockIn.getTime();
      workedMinutes = Math.max(0, Math.floor(diffMs / 60000));
    }

    return {
      workedMinutes,
      workedHours: Math.round((workedMinutes / 60) * 100) / 100,
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      overtimeMinutes: 0,
      overtimeHours: 0,
      attendanceStatus: clockIn && !clockOut ? 'MISSING_CLOCK_OUT' : 'PRESENT',
      isComplete: !!(clockIn && clockOut),
      scheduledMinutes: 0,
    };
  }

  // Shift exists
  const isOvernight = shift.isOvernight ?? (timeToMinutes(shift.endTime) <= timeToMinutes(shift.startTime));
  const graceMinutes = shift.gracePeriodMinutes ?? 15;
  const breakMinutes = customBreakMinutes ?? (shift.breakDurationMinutes ?? 60);
  const isBreakPaid = shift.isBreakPaid ?? false;

  const scheduledGrossDuration = calculateShiftDurationMinutes(shift.startTime, shift.endTime, isOvernight);
  const scheduledNetDuration = isBreakPaid ? scheduledGrossDuration : Math.max(0, scheduledGrossDuration - breakMinutes);

  // If employee did not clock in at all
  if (!clockIn) {
    return {
      workedMinutes: 0,
      workedHours: 0,
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      overtimeMinutes: 0,
      overtimeHours: 0,
      attendanceStatus: 'ABSENT',
      isComplete: false,
      scheduledMinutes: scheduledNetDuration,
    };
  }

  // Scheduled Start & End DateTime targets
  const scheduledStart = constructShiftDateTime(workDate, shift.startTime, false);
  const scheduledEnd = constructShiftDateTime(workDate, shift.endTime, isOvernight);

  // Calculate Late Arrival
  // Grace period: arrival up to scheduledStart + graceMinutes is ON TIME (0 late minutes)
  const diffStartMs = clockIn.getTime() - scheduledStart.getTime();
  const diffStartMinutes = Math.floor(diffStartMs / 60000);

  let lateMinutes = 0;
  if (diffStartMinutes > graceMinutes) {
    // Beyond grace period: late by the full elapsed minutes from scheduled start
    lateMinutes = diffStartMinutes;
  }

  // If clocked in but no clock out
  if (!clockOut) {
    return {
      workedMinutes: 0,
      workedHours: 0,
      lateMinutes,
      earlyDepartureMinutes: 0,
      overtimeMinutes: 0,
      overtimeHours: 0,
      attendanceStatus: lateMinutes > 0 ? 'LATE' : 'MISSING_CLOCK_OUT',
      isComplete: false,
      scheduledMinutes: scheduledNetDuration,
    };
  }

  // Both Clock In and Clock Out are recorded
  const elapsedMs = clockOut.getTime() - clockIn.getTime();
  const grossWorkedMinutes = Math.max(0, Math.floor(elapsedMs / 60000));

  // Deduct unpaid break
  const netWorkedMinutes = isBreakPaid ? grossWorkedMinutes : Math.max(0, grossWorkedMinutes - breakMinutes);

  // Calculate Early Departure
  // If clocked out before scheduledEnd
  const diffEndMs = scheduledEnd.getTime() - clockOut.getTime();
  const diffEndMinutes = Math.floor(diffEndMs / 60000);
  const earlyDepartureMinutes = diffEndMinutes > 0 ? diffEndMinutes : 0;

  // Calculate Overtime
  // If net worked time exceeds scheduled net duration by more than 15 minutes
  let overtimeMinutes = 0;
  if (netWorkedMinutes > scheduledNetDuration) {
    overtimeMinutes = netWorkedMinutes - scheduledNetDuration;
  }

  // Determine Primary Attendance Status
  let attendanceStatus = 'PRESENT';
  if (overtimeMinutes > 0) {
    attendanceStatus = 'PRESENT_WITH_OVERTIME';
  } else if (lateMinutes > 0 && earlyDepartureMinutes > 0) {
    attendanceStatus = 'LATE';
  } else if (lateMinutes > 0) {
    attendanceStatus = 'LATE';
  } else if (earlyDepartureMinutes > 0) {
    attendanceStatus = 'EARLY_DEPARTURE';
  }

  return {
    workedMinutes: netWorkedMinutes,
    workedHours: Math.round((netWorkedMinutes / 60) * 100) / 100,
    lateMinutes,
    earlyDepartureMinutes,
    overtimeMinutes,
    overtimeHours: Math.round((overtimeMinutes / 60) * 100) / 100,
    attendanceStatus,
    isComplete: true,
    scheduledMinutes: scheduledNetDuration,
  };
}

export interface ShiftConflictCheckInput {
  employeeId: string;
  date: Date;
  proposedShiftId?: string;
  existingLeaveRequests?: Array<{ startDate: Date; endDate: Date; status: string; leaveType?: { name: string } }>;
  existingAssignments?: Array<{ date: Date; shiftId: string; shiftName?: string }>;
  employmentDate?: Date | null;
  exitDate?: Date | null;
  consecutiveWorkDays?: number;
}

export interface ShiftConflictResult {
  hasConflict: boolean;
  isBlocked: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Validates roster assignment against leave, employment bounds, and consecutive work rules.
 */
export function validateShiftAssignment(input: ShiftConflictCheckInput): ShiftConflictResult {
  const { date, existingLeaveRequests = [], employmentDate, exitDate, consecutiveWorkDays = 0 } = input;
  const errors: string[] = [];
  const warnings: string[] = [];

  const targetDateStr = date.toISOString().split('T')[0];

  // 1. Employment boundaries check
  if (employmentDate) {
    const empDateStr = new Date(employmentDate).toISOString().split('T')[0];
    if (targetDateStr < empDateStr) {
      errors.push(`Assignment date (${targetDateStr}) is before employee hire date (${empDateStr})`);
    }
  }

  if (exitDate) {
    const exitDateStr = new Date(exitDate).toISOString().split('T')[0];
    if (targetDateStr > exitDateStr) {
      errors.push(`Assignment date (${targetDateStr}) is after employee exit date (${exitDateStr})`);
    }
  }

  // 2. Approved leave conflict check
  for (const l of existingLeaveRequests) {
    if (l.status === 'REJECTED' || l.status === 'CANCELLED') continue;
    const startStr = new Date(l.startDate).toISOString().split('T')[0];
    const endStr = new Date(l.endDate).toISOString().split('T')[0];

    if (targetDateStr >= startStr && targetDateStr <= endStr) {
      errors.push(`Employee has ${l.status.toLowerCase()} leave (${l.leaveType?.name || 'Leave'}) spanning ${startStr} to ${endStr}`);
    }
  }

  // 3. Consecutive working days warning
  if (consecutiveWorkDays >= 6) {
    warnings.push(`Employee has ${consecutiveWorkDays} consecutive working days assigned. Review labor rest-day policy.`);
  }

  return {
    hasConflict: errors.length > 0 || warnings.length > 0,
    isBlocked: errors.length > 0,
    warnings,
    errors,
  };
}

