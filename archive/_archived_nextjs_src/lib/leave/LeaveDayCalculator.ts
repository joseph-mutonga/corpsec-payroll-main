import { db } from '../db';

export interface LeaveDayCalculationOptions {
  excludeWeekends?: boolean;
  excludeHolidays?: boolean;
  isHalfDay?: boolean;
  scheduledWorkingDays?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat (default [1,2,3,4,5])
  branchId?: string;
  stationId?: string;
  customHolidays?: string[]; // array of YYYY-MM-DD
}

export interface LeaveDayCalculationResult {
  durationDays: number;
  workingDaysCount: number;
  calendarDaysCount: number;
  holidayDates: string[];
  weekendDates: string[];
  scheduledWorkingDaysList: string[];
}

export function toDateStringKey(d: Date | string): string {
  const date = new Date(d);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class LeaveDayCalculator {
  /**
   * Fetches active public holidays for the specified date range and scope.
   */
  static async getActiveHolidays(startDate: Date, endDate: Date, branchId?: string, stationId?: string): Promise<string[]> {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const holidays = await db.publicHoliday.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        date: {
          gte: start,
          lte: end,
        },
        OR: [
          { branchId: null },
          { branchId: branchId || undefined },
        ],
      },
    });

    return holidays.map((h) => toDateStringKey(h.date));
  }

  /**
   * Synchronous pure calculation if holiday list is already provided.
   */
  static calculateWorkingDaysSync(
    startDate: Date | string,
    endDate: Date | string,
    options: LeaveDayCalculationOptions = {}
  ): LeaveDayCalculationResult {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    if (end < start) {
      throw new Error('Leave end date cannot be earlier than start date.');
    }

    if (options.isHalfDay) {
      return {
        durationDays: 0.5,
        workingDaysCount: 1,
        calendarDaysCount: 1,
        holidayDates: [],
        weekendDates: [],
        scheduledWorkingDaysList: [toDateStringKey(start)],
      };
    }

    const excludeWeekends = options.excludeWeekends ?? true;
    const excludeHolidays = options.excludeHolidays ?? true;
    const scheduledDays = options.scheduledWorkingDays ?? (excludeWeekends ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]);

    const holidaySet = new Set<string>(options.customHolidays || []);

    let workingDays = 0;
    let calendarDays = 0;
    const holidayDates: string[] = [];
    const weekendDates: string[] = [];
    const scheduledWorkingDaysList: string[] = [];

    const curr = new Date(start);
    while (curr <= end) {
      calendarDays++;
      const dayOfWeek = curr.getDay(); // 0 = Sun, 6 = Sat
      const dateKey = toDateStringKey(curr);

      const isScheduledWorkDay = scheduledDays.includes(dayOfWeek);
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = holidaySet.has(dateKey);

      if (isWeekend && excludeWeekends) {
        weekendDates.push(dateKey);
      } else if (isHoliday && excludeHolidays) {
        holidayDates.push(dateKey);
      } else if (isScheduledWorkDay || !excludeWeekends) {
        workingDays++;
        scheduledWorkingDaysList.push(dateKey);
      }

      curr.setDate(curr.getDate() + 1);
    }

    return {
      durationDays: workingDays,
      workingDaysCount: workingDays,
      calendarDaysCount: calendarDays,
      holidayDates,
      weekendDates,
      scheduledWorkingDaysList,
    };
  }

  /**
   * Asynchronous calculation that queries the database for gazetted public holidays.
   */
  static async calculateWorkingDays(
    startDate: Date | string,
    endDate: Date | string,
    options: LeaveDayCalculationOptions = {}
  ): Promise<LeaveDayCalculationResult> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    let holidays: string[] = options.customHolidays || [];
    if (options.excludeHolidays !== false && holidays.length === 0) {
      holidays = await this.getActiveHolidays(start, end, options.branchId, options.stationId);
    }

    return this.calculateWorkingDaysSync(start, end, {
      ...options,
      customHolidays: holidays,
    });
  }
}
