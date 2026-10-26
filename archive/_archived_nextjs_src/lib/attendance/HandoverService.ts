import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export interface CreateHandoverInput {
  stationId: string;
  outgoingEmployeeId: string;
  incomingEmployeeId: string;
  shiftId?: string;
  handoverTime?: Date | string;
  notes?: string;
  equipmentChecklist?: string | object;
  securityIncidentsSummary?: string;
  supervisorEmployeeId?: string;
  status?: 'DRAFT' | 'CONFIRMED' | 'VERIFIED';
  createdById?: string;
}

export class HandoverService {
  /**
   * Generates sequential handover reference: HND-YYYY-XXXX
   */
  static async generateHandoverNumber(year: number = new Date().getFullYear()): Promise<string> {
    const prefix = `HND-${year}-`;
    const lastHnd = await db.shiftHandover.findFirst({
      where: { handoverNumber: { startsWith: prefix } },
      orderBy: { handoverNumber: 'desc' },
      select: { handoverNumber: true },
    });

    let nextNum = 1;
    if (lastHnd && lastHnd.handoverNumber) {
      const parts = lastHnd.handoverNumber.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        nextNum = lastSeq + 1;
      }
    }

    const seq = String(nextNum).padStart(4, '0');
    return `${prefix}${seq}`;
  }

  /**
   * Records a guard shift handover.
   */
  static async createHandover(input: CreateHandoverInput) {
    const handoverTime = input.handoverTime ? new Date(input.handoverTime) : new Date();
    const handoverNumber = await this.generateHandoverNumber(handoverTime.getFullYear());

    const checklistStr = typeof input.equipmentChecklist === 'object'
      ? JSON.stringify(input.equipmentChecklist)
      : input.equipmentChecklist || null;

    const handover = await db.shiftHandover.create({
      data: {
        handoverNumber,
        stationId: input.stationId,
        outgoingEmployeeId: input.outgoingEmployeeId,
        incomingEmployeeId: input.incomingEmployeeId,
        shiftId: input.shiftId || null,
        handoverTime,
        notes: input.notes || null,
        equipmentChecklist: checklistStr,
        securityIncidentsSummary: input.securityIncidentsSummary || null,
        supervisorEmployeeId: input.supervisorEmployeeId || null,
        status: input.status || 'CONFIRMED',
      },
      include: {
        station: true,
        outgoingEmployee: { select: { id: true, fullName: true, employeeNumber: true } },
        incomingEmployee: { select: { id: true, fullName: true, employeeNumber: true } },
        supervisorEmployee: { select: { id: true, fullName: true, employeeNumber: true } },
        shift: true,
      },
    });

    if (input.createdById) {
      await AuditService.log({
        userId: input.createdById,
        action: 'RECORD_SHIFT_HANDOVER',
        resource: 'shift_handovers',
        resourceId: handover.id,
        details: { handoverNumber, stationId: input.stationId },
      });
    }

    return handover;
  }

  /**
   * Lists shift handovers with filters.
   */
  static async listHandovers(filters: {
    stationId?: string;
    employeeId?: string;
    startDate?: Date | string;
    endDate?: Date | string;
  } = {}) {
    const where: any = {};

    if (filters.stationId && filters.stationId !== 'ALL') where.stationId = filters.stationId;
    if (filters.employeeId) {
      where.OR = [
        { outgoingEmployeeId: filters.employeeId },
        { incomingEmployeeId: filters.employeeId },
      ];
    }
    if (filters.startDate && filters.endDate) {
      where.handoverTime = {
        gte: new Date(filters.startDate),
        lte: new Date(filters.endDate),
      };
    }

    return db.shiftHandover.findMany({
      where,
      orderBy: { handoverTime: 'desc' },
      include: {
        station: true,
        outgoingEmployee: { select: { id: true, fullName: true, employeeNumber: true } },
        incomingEmployee: { select: { id: true, fullName: true, employeeNumber: true } },
        supervisorEmployee: { select: { id: true, fullName: true, employeeNumber: true } },
        shift: true,
      },
    });
  }
}
