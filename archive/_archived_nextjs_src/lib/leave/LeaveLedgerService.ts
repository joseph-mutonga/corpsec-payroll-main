import { db } from '../db';
import { AuditService } from '../audit';

export type LeaveTransactionType =
  | 'OPENING'
  | 'ACCRUAL'
  | 'USAGE'
  | 'CARRY_FORWARD'
  | 'EXPIRY'
  | 'ADJUSTMENT'
  | 'RESTORATION';

export interface RecordLedgerInput {
  employeeId: string;
  leaveTypeId: string;
  entitlementId?: string;
  transactionType: LeaveTransactionType;
  days: number; // positive for additions/restorations, negative for usage/deductions/expiry
  reference?: string; // e.g. Request Number, Rollover Ref, Manual Adj
  date?: Date;
  previousBalance: number;
  newBalance: number;
  reason?: string;
  createdById?: string;
}

export class LeaveLedgerService {
  static async recordTransaction(data: RecordLedgerInput) {
    const entry = await db.leaveLedgerEntry.create({
      data: {
        employeeId: data.employeeId,
        leaveTypeId: data.leaveTypeId,
        entitlementId: data.entitlementId,
        transactionType: data.transactionType,
        days: data.days,
        reference: data.reference,
        date: data.date ? new Date(data.date) : new Date(),
        previousBalance: data.previousBalance,
        newBalance: data.newBalance,
        reason: data.reason,
        createdById: data.createdById,
      },
    });

    await AuditService.log({
      userId: data.createdById,
      action: `LEAVE_LEDGER_${data.transactionType}`,
      module: 'LEAVE',
      entityId: entry.id,
      newValue: {
        employeeId: data.employeeId,
        leaveTypeId: data.leaveTypeId,
        transactionType: data.transactionType,
        days: data.days,
        previousBalance: data.previousBalance,
        newBalance: data.newBalance,
        reference: data.reference,
      },
    });

    return entry;
  }

  static async listEmployeeLedger(employeeId: string, leaveTypeId?: string, year?: number) {
    const where: any = { employeeId };

    if (leaveTypeId && leaveTypeId !== 'ALL') {
      where.leaveTypeId = leaveTypeId;
    }

    if (year) {
      const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
      const endOfYear = new Date(`${year}-12-31T23:59:59.999Z`);
      where.date = { gte: startOfYear, lte: endOfYear };
    }

    return db.leaveLedgerEntry.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        leaveType: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }
}
