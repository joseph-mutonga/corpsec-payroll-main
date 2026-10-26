import { db } from '../db';
import { AuditService } from '../audit';

export interface RecordReturnInput {
  requestId: string;
  actualReturnDate: Date | string;
  recordedByUserId: string;
  notes?: string;
}

export class LeaveReturnService {
  /**
   * Lists employees who are currently on leave or returning soon (next 7 days).
   */
  static async getReturningEmployees(daysWindow: number = 7) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const windowEnd = new Date(today.getTime() + daysWindow * 24 * 60 * 60 * 1000);

    const activeLeaves = await db.leaveRequest.findMany({
      where: {
        status: { in: ['APPROVED', 'ACTIVE'] },
        endDate: { gte: today, lte: windowEnd },
      },
      orderBy: { endDate: 'asc' },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            primaryPhone: true,
            department: { select: { id: true, name: true } },
            station: { select: { id: true, name: true } },
          },
        },
        leaveType: true,
      },
    });

    return activeLeaves.map((r) => {
      const expected = r.returnDateExpected || new Date(r.endDate.getTime() + 24 * 60 * 60 * 1000);
      const isOverdue = new Date() > expected && r.returnStatus !== 'RETURNED';

      return {
        requestId: r.id,
        requestNumber: r.requestNumber,
        employee: r.employee,
        leaveType: r.leaveType,
        startDate: r.startDate,
        endDate: r.endDate,
        expectedReturnDate: expected,
        actualReturnDate: r.returnDateActual,
        returnStatus: isOverdue ? 'LATE' : r.returnStatus || 'EXPECTED',
      };
    });
  }

  /**
   * Records actual return to work.
   */
  static async recordReturn(data: RecordReturnInput) {
    const request = await db.leaveRequest.findUnique({
      where: { id: data.requestId },
      include: { employee: true },
    });
    if (!request) throw new Error('Leave request not found.');

    const actual = new Date(data.actualReturnDate);
    const expected = request.returnDateExpected || new Date(request.endDate.getTime() + 24 * 60 * 60 * 1000);
    const returnStatus = actual > expected ? 'LATE' : 'RETURNED';

    const updated = await db.leaveRequest.update({
      where: { id: request.id },
      data: {
        returnDateActual: actual,
        returnStatus,
        returnRecordedById: data.recordedByUserId,
        returnRecordedAt: new Date(),
        status: 'COMPLETED',
      },
      include: { employee: true, leaveType: true },
    });

    await AuditService.log({
      userId: data.recordedByUserId,
      action: 'RECORD_RETURN_FROM_LEAVE',
      module: 'LEAVE',
      entityId: request.id,
      newValue: {
        requestNumber: request.requestNumber,
        actualReturnDate: actual,
        returnStatus,
        notes: data.notes,
      },
    });

    return updated;
  }
}
