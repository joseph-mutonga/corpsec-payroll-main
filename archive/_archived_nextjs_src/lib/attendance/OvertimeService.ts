import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export interface OvertimeRequestInput {
  employeeId: string;
  attendanceRecordId?: string;
  date: Date | string;
  scheduledHours?: number;
  actualHours?: number;
  overtimeHours: number;
  overtimeType?: 'NORMAL' | 'REST_DAY' | 'HOLIDAY' | 'NIGHT_SHIFT' | 'OTHER';
  overtimeRateMultiplier?: number;
  reason: string;
  requestedById?: string;
}

export class OvertimeService {
  /**
   * Submits an overtime request.
   */
  static async requestOvertime(input: OvertimeRequestInput) {
    const targetDate = new Date(input.date);
    targetDate.setHours(0, 0, 0, 0);

    const type = input.overtimeType || 'NORMAL';
    let multiplier = input.overtimeRateMultiplier;
    if (!multiplier) {
      switch (type) {
        case 'HOLIDAY':
        case 'REST_DAY':
          multiplier = 2.0;
          break;
        case 'NORMAL':
        case 'NIGHT_SHIFT':
        default:
          multiplier = 1.5;
          break;
      }
    }

    const ot = await db.overtimeRecord.create({
      data: {
        employeeId: input.employeeId,
        attendanceRecordId: input.attendanceRecordId || null,
        date: targetDate,
        scheduledHours: input.scheduledHours || 8,
        actualHours: input.actualHours || (input.scheduledHours || 8) + input.overtimeHours,
        overtimeMinutes: Math.round(input.overtimeHours * 60),
        overtimeHours: input.overtimeHours,
        overtimeType: type,
        overtimeRateMultiplier: multiplier,
        reason: input.reason.trim(),
        requestedById: input.requestedById || null,
        approvalStatus: 'PENDING',
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            employeeNumber: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (input.requestedById) {
      await AuditService.log({
        userId: input.requestedById,
        action: 'REQUEST_OVERTIME',
        resource: 'overtime_records',
        resourceId: ot.id,
        details: { employeeId: input.employeeId, overtimeHours: input.overtimeHours, type },
      });
    }

    return ot;
  }

  /**
   * Lists overtime records with filters.
   */
  static async listOvertime(filters: {
    employeeId?: string;
    departmentId?: string;
    approvalStatus?: string;
    startDate?: Date | string;
    endDate?: Date | string;
  } = {}) {
    const where: any = {};

    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.approvalStatus && filters.approvalStatus !== 'ALL') {
      where.approvalStatus = filters.approvalStatus;
    }
    if (filters.startDate && filters.endDate) {
      where.date = {
        gte: new Date(filters.startDate),
        lte: new Date(filters.endDate),
      };
    }
    if (filters.departmentId && filters.departmentId !== 'ALL') {
      where.employee = { departmentId: filters.departmentId };
    }

    return db.overtimeRecord.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            employeeNumber: true,
            department: { select: { id: true, name: true } },
            station: { select: { id: true, name: true } },
          },
        },
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        hrApprovedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /**
   * Reviews and approves or rejects overtime.
   */
  static async reviewOvertime(data: {
    overtimeId: string;
    decision: 'APPROVE' | 'REJECT';
    reviewerUserId: string;
    level?: 'MANAGER' | 'HR';
    comments?: string;
  }) {
    const ot = await db.overtimeRecord.findUnique({ where: { id: data.overtimeId } });
    if (!ot) throw new Error('Overtime record not found.');

    const isHr = data.level === 'HR';
    const status = data.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    const updated = await db.overtimeRecord.update({
      where: { id: data.overtimeId },
      data: {
        approvalStatus: status,
        approvedById: !isHr ? data.reviewerUserId : ot.approvedById,
        approvedAt: !isHr ? new Date() : ot.approvedAt,
        hrApprovedById: isHr ? data.reviewerUserId : ot.hrApprovedById,
        hrApprovedAt: isHr ? new Date() : ot.hrApprovedAt,
        hrComments: data.comments || ot.hrComments,
        comments: !isHr ? data.comments : ot.comments,
      },
    });

    await AuditService.log({
      userId: data.reviewerUserId,
      action: `${data.decision}_OVERTIME`,
      resource: 'overtime_records',
      resourceId: data.overtimeId,
      details: { decision: data.decision, level: data.level, comments: data.comments },
    });

    return updated;
  }
}
