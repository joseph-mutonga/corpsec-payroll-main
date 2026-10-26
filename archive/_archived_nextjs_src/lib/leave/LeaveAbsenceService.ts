import { db } from '../db';
import { AuditService } from '../audit';

export interface CreateAbsenceInput {
  employeeId: string;
  date: Date | string;
  absenceType: 'SICK' | 'EMERGENCY' | 'UNEXCUSED' | 'BEREAVEMENT' | 'TRAINING' | 'OTHER';
  reason: string;
  leaveRequestId?: string;
  documentUrl?: string;
  recordedById?: string;
  status?: 'OPEN' | 'EXCUSED' | 'UNEXCUSED' | 'RESOLVED';
}

export interface ResolveAbsenceInput {
  absenceId: string;
  status: 'EXCUSED' | 'UNEXCUSED' | 'RESOLVED';
  resolutionNotes: string;
  resolvedById?: string;
}

export class LeaveAbsenceService {
  static async generateAbsenceNumber(year: number = new Date().getFullYear()): Promise<string> {
    const prefix = `ABS-${year}-`;
    const lastAbsence = await db.leaveAbsence.findFirst({
      where: {
        absenceNumber: { startsWith: prefix },
      },
      orderBy: { absenceNumber: 'desc' },
      select: { absenceNumber: true },
    });

    let nextNum = 1;
    if (lastAbsence && lastAbsence.absenceNumber) {
      const parts = lastAbsence.absenceNumber.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        nextNum = lastSeq + 1;
      }
    }

    const seq = String(nextNum).padStart(4, '0');
    return `${prefix}${seq}`;
  }

  static async listAbsences(filters: {
    employeeId?: string;
    departmentId?: string;
    status?: string;
    startDate?: Date | string;
    endDate?: Date | string;
  } = {}) {
    const where: any = {};

    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.status && filters.status !== 'ALL') where.status = filters.status;

    if (filters.startDate && filters.endDate) {
      where.date = {
        gte: new Date(filters.startDate),
        lte: new Date(filters.endDate),
      };
    }

    if (filters.departmentId && filters.departmentId !== 'ALL') {
      where.employee = { departmentId: filters.departmentId };
    }

    return db.leaveAbsence.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            department: { select: { id: true, name: true } },
            station: { select: { id: true, name: true } },
          },
        },
        leaveRequest: {
          select: { id: true, requestNumber: true, leaveType: true },
        },
        recordedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  static async recordAbsence(data: CreateAbsenceInput) {
    if (!data.employeeId || !data.date || !data.reason) {
      throw new Error('Employee, date, and reason are required to log an absence.');
    }

    const employee = await db.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee) throw new Error('Employee record not found.');

    const date = new Date(data.date);
    date.setHours(0, 0, 0, 0);

    const absenceNumber = await this.generateAbsenceNumber(date.getFullYear());

    const absence = await db.leaveAbsence.create({
      data: {
        absenceNumber,
        employeeId: data.employeeId,
        date,
        absenceType: data.absenceType || 'UNEXCUSED',
        reason: data.reason.trim(),
        leaveRequestId: data.leaveRequestId,
        documentUrl: data.documentUrl,
        recordedById: data.recordedById,
        status: data.status || 'OPEN',
      },
      include: { employee: true },
    });

    // Synchronize with attendance system as an authorized/open absence note
    try {
      const existingAtt = await db.attendanceRecord.findUnique({
        where: {
          employeeId_date: {
            employeeId: data.employeeId,
            date,
          },
        },
      });

      if (!existingAtt) {
        await db.attendanceRecord.create({
          data: {
            employeeId: data.employeeId,
            date,
            attendanceStatus: data.absenceType === 'SICK' ? 'SICK_LEAVE' : 'ABSENT',
            notes: `Absence Logged: ${absence.absenceType} (${absence.absenceNumber})`,
          },
        });
      }
    } catch (attErr) {
      console.warn('Attendance sync for absence notice skipped:', attErr);
    }

    await AuditService.log({
      userId: data.recordedById,
      action: 'RECORD_ABSENCE',
      module: 'LEAVE',
      entityId: absence.id,
      newValue: {
        absenceNumber: absence.absenceNumber,
        employeeId: data.employeeId,
        date,
        absenceType: absence.absenceType,
      },
    });

    return absence;
  }

  static async resolveAbsence(data: ResolveAbsenceInput) {
    const existing = await db.leaveAbsence.findUnique({ where: { id: data.absenceId } });
    if (!existing) throw new Error('Absence record not found.');

    const updated = await db.leaveAbsence.update({
      where: { id: data.absenceId },
      data: {
        status: data.status,
        resolutionNotes: data.resolutionNotes.trim(),
        resolvedAt: new Date(),
      },
      include: { employee: true },
    });

    await AuditService.log({
      userId: data.resolvedById,
      action: 'RESOLVE_ABSENCE',
      module: 'LEAVE',
      entityId: data.absenceId,
      previousValue: { status: existing.status },
      newValue: { status: data.status, notes: data.resolutionNotes },
    });

    return updated;
  }
}
