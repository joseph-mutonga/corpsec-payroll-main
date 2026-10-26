// CorpSec HR Payroll — Leave Calculation Engine
// Handles duration arithmetic, working days vs calendar days, Kenya gazetted holidays,
// employee work schedule off-days, half-days, proration, accruals, balance verification, and overlap conflicts.

export interface LeaveCalculationOptions {
  excludeWeekends?: boolean;
  excludeHolidays?: boolean;
  holidays?: Array<Date | string>;
  isHalfDay?: boolean;
  scheduledWorkingDays?: number[]; // e.g. [1, 2, 3, 4, 5] for Mon-Fri, 0=Sun, 6=Sat
}

export interface LeaveDurationResult {
  durationDays: number;
  workingDaysCount: number;
  calendarDaysCount: number;
  holidayDates: string[];
  offDates: string[];
}

export interface ProrationResult {
  entitledDays: number;
  monthsEligible: number;
  formula: string;
}

export interface BalanceValidationResult {
  isValid: boolean;
  availableBalance: number;
  requestedDays: number;
  shortfall: number;
  message?: string;
}

export interface ConflictCheckItem {
  id: string;
  requestNumber?: string;
  startDate: Date | string;
  endDate: Date | string;
  status: string;
  leaveTypeName?: string;
}

/**
 * Normalizes date to UTC/local midnight (YYYY-MM-DD string key).
 */
export function toDateStringKey(d: Date | string): string {
  const date = new Date(d);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculates requested leave duration in days.
 */
export function calculateLeaveDuration(
  startDate: Date | string,
  endDate: Date | string,
  options: LeaveCalculationOptions = {}
): LeaveDurationResult {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  if (end < start) {
    throw new Error('Leave end date cannot be earlier than start date.');
  }

  // If half day is specified
  if (options.isHalfDay) {
    return {
      durationDays: 0.5,
      workingDaysCount: 1,
      calendarDaysCount: 1,
      holidayDates: [],
      offDates: [],
    };
  }

  const excludeWeekends = options.excludeWeekends ?? true;
  const excludeHolidays = options.excludeHolidays ?? true;
  const scheduledDays = options.scheduledWorkingDays ?? (excludeWeekends ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]);

  const holidaySet = new Set<string>();
  if (options.holidays) {
    for (const h of options.holidays) {
      holidaySet.add(toDateStringKey(h));
    }
  }

  let workingDays = 0;
  let calendarDays = 0;
  const holidayDates: string[] = [];
  const offDates: string[] = [];

  const curr = new Date(start);
  while (curr <= end) {
    calendarDays++;
    const dayOfWeek = curr.getDay(); // 0=Sun, 6=Sat
    const dateKey = toDateStringKey(curr);

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isScheduledOff = !scheduledDays.includes(dayOfWeek);
    const isHoliday = holidaySet.has(dateKey);

    if (excludeHolidays && isHoliday) {
      holidayDates.push(dateKey);
    } else if (excludeWeekends && isWeekend) {
      offDates.push(dateKey);
    } else if (isScheduledOff) {
      offDates.push(dateKey);
    } else {
      workingDays++;
    }

    curr.setDate(curr.getDate() + 1);
  }

  return {
    durationDays: workingDays,
    workingDaysCount: workingDays,
    calendarDaysCount: calendarDays,
    holidayDates,
    offDates,
  };
}

/**
 * Calculates prorated entitlement for employees joining during the leave year.
 */
export function calculateProratedEntitlement(
  annualEntitledDays: number,
  employmentDate: Date | string,
  leaveYearStart: Date | string = new Date(new Date().getFullYear(), 0, 1),
  leaveYearEnd: Date | string = new Date(new Date().getFullYear(), 11, 31),
  prorationRule: string = 'PRORATED_BY_MONTH'
): ProrationResult {
  const empDate = new Date(employmentDate);
  empDate.setHours(0, 0, 0, 0);

  const startYear = new Date(leaveYearStart);
  startYear.setHours(0, 0, 0, 0);

  const endYear = new Date(leaveYearEnd);
  endYear.setHours(0, 0, 0, 0);

  // If joined before or on the first day of the leave year, full entitlement
  if (empDate <= startYear || prorationRule === 'NONE') {
    return {
      entitledDays: annualEntitledDays,
      monthsEligible: 12,
      formula: `Full annual entitlement (${annualEntitledDays} days)`,
    };
  }

  // If joined after the leave year has ended
  if (empDate > endYear) {
    return {
      entitledDays: 0,
      monthsEligible: 0,
      formula: 'Employment commenced after the end of this leave year',
    };
  }

  if (prorationRule === 'PRORATED_BY_MONTH') {
    const joiningMonth = empDate.getMonth(); // 0 to 11
    // If joined on or before 15th of the month, count full month, else remaining months
    const eligibleMonths = 12 - joiningMonth;
    const prorated = Math.round(((annualEntitledDays * eligibleMonths) / 12) * 2) / 2; // round to nearest 0.5

    return {
      entitledDays: prorated,
      monthsEligible: eligibleMonths,
      formula: `(${annualEntitledDays} days × ${eligibleMonths}/12 months) = ${prorated} days`,
    };
  }

  if (prorationRule === 'PRORATED_BY_DAY') {
    const totalDaysInYear = Math.round((endYear.getTime() - startYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const remainingDays = Math.round((endYear.getTime() - empDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const prorated = Math.round(((annualEntitledDays * remainingDays) / totalDaysInYear) * 2) / 2;

    return {
      entitledDays: prorated,
      monthsEligible: Math.round((remainingDays / 30) * 10) / 10,
      formula: `(${annualEntitledDays} days × ${remainingDays}/${totalDaysInYear} days) = ${prorated} days`,
    };
  }

  return {
    entitledDays: annualEntitledDays,
    monthsEligible: 12,
    formula: `Default entitlement (${annualEntitledDays} days)`,
  };
}

/**
 * Calculates monthly accrual accumulated up to the specified month (1-12).
 */
export function calculateMonthlyAccrual(annualEntitledDays: number, currentMonthIndex: number): number {
  if (currentMonthIndex <= 0) return 0;
  const ratePerMonth = annualEntitledDays / 12;
  const accrued = Math.min(annualEntitledDays, ratePerMonth * currentMonthIndex);
  return Math.round(accrued * 2) / 2; // nearest 0.5
}

/**
 * Validates whether the employee has sufficient available leave balance.
 */
export function validateLeaveBalance(
  availableBalance: number,
  requestedDays: number,
  allowAdvance: boolean = false,
  maxAdvanceDays: number = 0
): BalanceValidationResult {
  const maxAllowable = availableBalance + (allowAdvance ? maxAdvanceDays : 0);

  if (requestedDays <= maxAllowable) {
    return {
      isValid: true,
      availableBalance,
      requestedDays,
      shortfall: 0,
    };
  }

  const shortfall = requestedDays - maxAllowable;
  return {
    isValid: false,
    availableBalance,
    requestedDays,
    shortfall,
    message: `Insufficient leave balance. Requested ${requestedDays} days, but only ${availableBalance} days are currently available${
      allowAdvance ? ` (including ${maxAdvanceDays} days advance allowance)` : ''
    }. Shortfall of ${shortfall} day(s).`,
  };
}

/**
 * Detects whether the requested dates overlap with any active leave requests.
 */
export function detectLeaveConflict(
  existingRequests: ConflictCheckItem[],
  requestedStart: Date | string,
  requestedEnd: Date | string,
  excludeRequestId?: string
): { hasConflict: boolean; conflictingRequest?: ConflictCheckItem } {
  const start = new Date(requestedStart);
  start.setHours(0, 0, 0, 0);

  const end = new Date(requestedEnd);
  end.setHours(0, 0, 0, 0);

  const activeStatuses = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'];

  for (const req of existingRequests) {
    if (excludeRequestId && req.id === excludeRequestId) continue;
    if (!activeStatuses.includes(req.status)) continue;

    const rStart = new Date(req.startDate);
    rStart.setHours(0, 0, 0, 0);

    const rEnd = new Date(req.endDate);
    rEnd.setHours(0, 0, 0, 0);

    // Overlap condition: rStart <= end && rEnd >= start
    if (rStart <= end && rEnd >= start) {
      return {
        hasConflict: true,
        conflictingRequest: req,
      };
    }
  }

  return { hasConflict: false };
}
