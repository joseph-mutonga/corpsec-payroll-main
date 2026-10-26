import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export interface CreateScheduleInput {
  code: string;
  name: string;
  description?: string;
  patternType?: string; // STANDARD_WEEKLY, ROTATION_6_1, ROTATION_7_7, CUSTOM_ROTATION
  cycleDays?: number;
  scheduleConfig?: string | object; // JSON day index mapping
  isActive?: boolean;
  createdById?: string;
}

export class ScheduleService {
  /**
   * Lists all work schedules.
   */
  static async listSchedules() {
    return db.workSchedule.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Retrieves single schedule by ID.
   */
  static async getScheduleById(id: string) {
    return db.workSchedule.findUnique({
      where: { id },
    });
  }

  /**
   * Creates a new work schedule.
   */
  static async createSchedule(input: CreateScheduleInput) {
    const existing = await db.workSchedule.findUnique({
      where: { code: input.code.toUpperCase().trim() },
    });
    if (existing) {
      throw new Error(`Schedule with code ${input.code} already exists.`);
    }

    const configStr = typeof input.scheduleConfig === 'object'
      ? JSON.stringify(input.scheduleConfig)
      : input.scheduleConfig || null;

    const schedule = await db.workSchedule.create({
      data: {
        code: input.code.toUpperCase().trim(),
        name: input.name.trim(),
        description: input.description || null,
        patternType: input.patternType || 'STANDARD_WEEKLY',
        cycleDays: input.cycleDays ?? 7,
        scheduleConfig: configStr,
        isActive: input.isActive ?? true,
      },
    });

    if (input.createdById) {
      await AuditService.log({
        userId: input.createdById,
        action: 'CREATE_WORK_SCHEDULE',
        resource: 'work_schedules',
        resourceId: schedule.id,
        details: { code: schedule.code, name: schedule.name, pattern: schedule.patternType },
      });
    }

    return schedule;
  }

  /**
   * Assigns a schedule/shift to an employee, preserving historical assignments.
   */
  static async assignEmployeeSchedule(data: {
    employeeId: string;
    shiftId?: string;
    workScheduleId?: string;
    stationId?: string;
    startDate?: Date | string;
    endDate?: Date | string;
    notes?: string;
    assignedById?: string;
  }) {
    const start = data.startDate ? new Date(data.startDate) : new Date();
    start.setHours(0, 0, 0, 0);

    // End previous active assignment if exists
    await db.employeeShiftAssignment.updateMany({
      where: {
        employeeId: data.employeeId,
        status: 'ACTIVE',
        endDate: null,
      },
      data: {
        endDate: new Date(start.getTime() - 24 * 60 * 60 * 1000),
        status: 'ENDED',
      },
    });

    const assignment = await db.employeeShiftAssignment.create({
      data: {
        employeeId: data.employeeId,
        shiftId: data.shiftId || null,
        workScheduleId: data.workScheduleId || null,
        stationId: data.stationId || null,
        startDate: start,
        endDate: data.endDate ? new Date(data.endDate) : null,
        status: 'ACTIVE',
        notes: data.notes || null,
        createdById: data.assignedById || null,
      },
      include: {
        shift: true,
        workSchedule: true,
        station: true,
        employee: { select: { id: true, fullName: true, employeeNumber: true } },
      },
    });

    if (data.assignedById) {
      await AuditService.log({
        userId: data.assignedById,
        action: 'ASSIGN_EMPLOYEE_SCHEDULE',
        resource: 'employee_shift_assignments',
        resourceId: assignment.id,
        details: {
          employeeId: data.employeeId,
          shiftId: data.shiftId,
          scheduleId: data.workScheduleId,
          stationId: data.stationId,
        },
      });
    }

    return assignment;
  }

  /**
   * Retrieves active shift assignment for an employee on a given date.
   */
  static async getActiveAssignment(employeeId: string, date: Date = new Date()) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    return db.employeeShiftAssignment.findFirst({
      where: {
        employeeId,
        startDate: { lte: targetDate },
        OR: [
          { endDate: null },
          { endDate: { gte: targetDate } },
        ],
      },
      orderBy: { startDate: 'desc' },
      include: {
        shift: true,
        workSchedule: true,
        station: true,
      },
    });
  }
}
