import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export interface CreateShiftInput {
  code: string;
  name: string;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  shiftType?: string; // DAY, NIGHT, MORNING, EVENING, CUSTOM
  isOvernight?: boolean;
  gracePeriodMinutes?: number;
  breakDurationMinutes?: number;
  isBreakPaid?: boolean;
  breakStartTime?: string;
  breakEndTime?: string;
  status?: string;
  createdById?: string;
}

export class ShiftService {
  /**
   * Lists all shifts.
   */
  static async listShifts(filters: { status?: string; shiftType?: string } = {}) {
    const where: any = { deletedAt: null };
    if (filters.status && filters.status !== 'ALL') where.status = filters.status;
    if (filters.shiftType && filters.shiftType !== 'ALL') where.shiftType = filters.shiftType;

    return db.shift.findMany({
      where,
      orderBy: { startTime: 'asc' },
    });
  }

  /**
   * Retrieves single shift by ID.
   */
  static async getShiftById(id: string) {
    return db.shift.findUnique({
      where: { id },
    });
  }

  /**
   * Creates a new shift. Automatically detects cross-midnight if endTime < startTime.
   */
  static async createShift(input: CreateShiftInput) {
    const isCrossMidnight =
      input.isOvernight ??
      (input.endTime < input.startTime || (input.startTime >= '18:00' && input.endTime <= '09:00'));

    const existing = await db.shift.findUnique({
      where: { code: input.code.toUpperCase().trim() },
    });
    if (existing) {
      throw new Error(`Shift with code ${input.code} already exists.`);
    }

    const shift = await db.shift.create({
      data: {
        code: input.code.toUpperCase().trim(),
        name: input.name.trim(),
        startTime: input.startTime.trim(),
        endTime: input.endTime.trim(),
        shiftType: input.shiftType || (isCrossMidnight ? 'NIGHT' : 'DAY'),
        isOvernight: isCrossMidnight,
        gracePeriodMinutes: input.gracePeriodMinutes ?? 15,
        breakDurationMinutes: input.breakDurationMinutes ?? 60,
        isBreakPaid: input.isBreakPaid ?? false,
        breakStartTime: input.breakStartTime || null,
        breakEndTime: input.breakEndTime || null,
        status: input.status || 'ACTIVE',
      },
    });

    if (input.createdById) {
      await AuditService.log({
        userId: input.createdById,
        action: 'CREATE_SHIFT',
        resource: 'shifts',
        resourceId: shift.id,
        details: { code: shift.code, name: shift.name, startTime: shift.startTime, endTime: shift.endTime },
      });
    }

    return shift;
  }

  /**
   * Updates an existing shift.
   */
  static async updateShift(
    id: string,
    input: Partial<CreateShiftInput>,
    updatedById?: string
  ) {
    const shift = await db.shift.findUnique({ where: { id } });
    if (!shift) throw new Error('Shift not found.');

    let isOvernight = input.isOvernight;
    if (isOvernight === undefined && input.startTime && input.endTime) {
      isOvernight = input.endTime < input.startTime || (input.startTime >= '18:00' && input.endTime <= '09:00');
    }

    const updated = await db.shift.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.startTime ? { startTime: input.startTime.trim() } : {}),
        ...(input.endTime ? { endTime: input.endTime.trim() } : {}),
        ...(input.shiftType ? { shiftType: input.shiftType } : {}),
        ...(isOvernight !== undefined ? { isOvernight } : {}),
        ...(input.gracePeriodMinutes !== undefined ? { gracePeriodMinutes: input.gracePeriodMinutes } : {}),
        ...(input.breakDurationMinutes !== undefined ? { breakDurationMinutes: input.breakDurationMinutes } : {}),
        ...(input.isBreakPaid !== undefined ? { isBreakPaid: input.isBreakPaid } : {}),
        ...(input.breakStartTime !== undefined ? { breakStartTime: input.breakStartTime } : {}),
        ...(input.breakEndTime !== undefined ? { breakEndTime: input.breakEndTime } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
    });

    if (updatedById) {
      await AuditService.log({
        userId: updatedById,
        action: 'UPDATE_SHIFT',
        resource: 'shifts',
        resourceId: id,
        details: { changes: input },
      });
    }

    return updated;
  }

  /**
   * Soft-deletes a shift.
   */
  static async deleteShift(id: string, deletedById?: string) {
    const shift = await db.shift.findUnique({ where: { id } });
    if (!shift) throw new Error('Shift not found.');

    const deleted = await db.shift.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });

    if (deletedById) {
      await AuditService.log({
        userId: deletedById,
        action: 'DELETE_SHIFT',
        resource: 'shifts',
        resourceId: id,
        details: { code: shift.code },
      });
    }

    return deleted;
  }
}
