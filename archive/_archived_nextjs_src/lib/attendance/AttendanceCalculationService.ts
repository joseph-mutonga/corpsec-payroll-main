export interface CalculationOptions {
  gracePeriodMinutes?: number;
  earlyDepartureThresholdMinutes?: number;
  breakDurationMinutes?: number;
  isBreakPaid?: boolean;
  roundingIntervalMinutes?: number;
  isCrossMidnight?: boolean;
}

export interface AttendanceCalculationResult {
  workedMinutes: number;
  workedHours: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  overtimeMinutes: number;
  overtimeHours: number;
  isLate: boolean;
  isEarlyDeparture: boolean;
  isMissingClockIn: boolean;
  isMissingClockOut: boolean;
}

export class AttendanceCalculationService {
  /**
   * Parses time string "HH:mm" into minutes from midnight.
   */
  static parseTimeToMinutes(timeStr?: string | null): number | null {
    if (!timeStr) return null;
    const parts = timeStr.trim().split(':');
    if (parts.length < 2) return null;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return null;
    return hours * 60 + minutes;
  }

  /**
   * Extracts minutes from midnight from a Date or time string.
   */
  static extractMinutes(val: Date | string): number {
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.includes('T')) {
        const timePart = trimmed.split('T')[1].substring(0, 5);
        const [h, m] = timePart.split(':').map((x) => parseInt(x, 10));
        if (!isNaN(h) && !isNaN(m)) return h * 60 + m;
      } else if (trimmed.includes(' ') && trimmed.includes(':')) {
        const timePart = trimmed.split(' ')[1].substring(0, 5);
        const [h, m] = timePart.split(':').map((x) => parseInt(x, 10));
        if (!isNaN(h) && !isNaN(m)) return h * 60 + m;
      } else if (trimmed.includes(':')) {
        const parts = trimmed.split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!isNaN(h) && !isNaN(m)) return h * 60 + m;
      }
    }
    const d = new Date(val);
    return d.getHours() * 60 + d.getMinutes();
  }

  /**
   * Calculates worked time, lateness, early departure, and overtime.
   */
  static calculateAttendance(
    scheduledStartStr: string | null | undefined,
    scheduledEndStr: string | null | undefined,
    actualClockIn: Date | string | null | undefined,
    actualClockOut: Date | string | null | undefined,
    options: CalculationOptions = {}
  ): AttendanceCalculationResult {
    const gracePeriod = options.gracePeriodMinutes ?? 15;
    const earlyThreshold = options.earlyDepartureThresholdMinutes ?? 15;
    const breakMinutes = options.breakDurationMinutes ?? 0;
    const isBreakPaid = options.isBreakPaid ?? false;
    const roundingInterval = options.roundingIntervalMinutes ?? 1;
    const isCrossMidnight = options.isCrossMidnight ?? false;

    const clockInDate = actualClockIn ? new Date(actualClockIn) : null;
    const clockOutDate = actualClockOut ? new Date(actualClockOut) : null;

    const isMissingClockIn = !clockInDate && !!clockOutDate;
    const isMissingClockOut = !!clockInDate && !clockOutDate;

    let workedMinutes = 0;
    if (clockInDate && clockOutDate) {
      const rawDiffMinutes = Math.max(0, Math.floor((clockOutDate.getTime() - clockInDate.getTime()) / (1000 * 60)));
      const unpaidBreak = isBreakPaid ? 0 : breakMinutes;
      workedMinutes = Math.max(0, rawDiffMinutes - unpaidBreak);

      // Apply rounding
      if (roundingInterval > 1) {
        workedMinutes = Math.round(workedMinutes / roundingInterval) * roundingInterval;
      }
    }

    const workedHours = Number((workedMinutes / 60).toFixed(2));

    // Lateness Calculation
    let lateMinutes = 0;
    let isLate = false;
    if (actualClockIn && scheduledStartStr) {
      const scheduledMinutes = this.parseTimeToMinutes(scheduledStartStr);
      if (scheduledMinutes !== null) {
        const actualMinutes = this.extractMinutes(actualClockIn);
        const diff = actualMinutes - scheduledMinutes;
        if (diff > gracePeriod) {
          lateMinutes = diff - gracePeriod;
          isLate = true;
        }
      }
    }

    // Early Departure Calculation
    let earlyDepartureMinutes = 0;
    let isEarlyDeparture = false;
    if (actualClockOut && scheduledEndStr) {
      const scheduledEndMinutes = this.parseTimeToMinutes(scheduledEndStr);
      if (scheduledEndMinutes !== null) {
        let actualOutMinutes = this.extractMinutes(actualClockOut);
        let targetEndMinutes = scheduledEndMinutes;

        if (isCrossMidnight && actualOutMinutes < 720) {
          actualOutMinutes += 1440;
          targetEndMinutes += 1440;
        }

        const earlyDiff = targetEndMinutes - actualOutMinutes;
        if (earlyDiff > earlyThreshold) {
          earlyDepartureMinutes = earlyDiff - earlyThreshold;
          isEarlyDeparture = true;
        }
      }
    }

    // Overtime Calculation
    let overtimeMinutes = 0;
    if (clockInDate && clockOutDate && scheduledStartStr && scheduledEndStr) {
      const schedStart = this.parseTimeToMinutes(scheduledStartStr) ?? 0;
      let schedEnd = this.parseTimeToMinutes(scheduledEndStr) ?? 0;
      if (isCrossMidnight || schedEnd < schedStart) {
        schedEnd += 1440;
      }
      const scheduledShiftMinutes = Math.max(0, schedEnd - schedStart - (isBreakPaid ? 0 : breakMinutes));
      if (workedMinutes > scheduledShiftMinutes) {
        overtimeMinutes = workedMinutes - scheduledShiftMinutes;
      }
    }

    const overtimeHours = Number((overtimeMinutes / 60).toFixed(2));

    return {
      workedMinutes,
      workedHours,
      lateMinutes,
      earlyDepartureMinutes,
      overtimeMinutes,
      overtimeHours,
      isLate,
      isEarlyDeparture,
      isMissingClockIn,
      isMissingClockOut,
    };
  }

  /**
   * Computes scheduled shift hours duration.
   */
  static calculateScheduledHours(
    startTimeStr: string,
    endTimeStr: string,
    breakMinutes: number = 0,
    isBreakPaid: boolean = false
  ): number {
    const start = this.parseTimeToMinutes(startTimeStr) ?? 0;
    let end = this.parseTimeToMinutes(endTimeStr) ?? 0;
    if (end <= start) {
      end += 1440; // overnight
    }
    const totalMinutes = Math.max(0, end - start - (isBreakPaid ? 0 : breakMinutes));
    return Number((totalMinutes / 60).toFixed(2));
  }
}
