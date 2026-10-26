import { db } from '../db';
import { LeaveBalanceService } from './LeaveBalanceService';
import { LeaveLedgerService } from './LeaveLedgerService';
import { AuditService } from '../audit';

export class LeaveExpiryService {
  /**
   * Identifies unutilized carried-forward leave days that have reached their configured expiration cutoff date.
   */
  static async processExpiredLeave(
    year: number = new Date().getFullYear(),
    asOfDate: Date = new Date(),
    executedById?: string
  ) {
    const entitlements = await db.leaveEntitlement.findMany({
      where: {
        leaveYear: year,
        carriedForwardDays: { gt: 0 },
        expiredDays: 0, // Not yet expired
        status: 'ACTIVE',
      },
      include: {
        policy: true,
        employee: true,
      },
    });

    let expiredCount = 0;
    const records = [];

    for (const ent of entitlements) {
      if (!ent.policy || !ent.policy.allowCarryForward) continue;

      const expiryMonths = ent.policy.carryForwardExpiryMonths ?? 3;
      // Cutoff is end of month X in the current year (e.g., March 31 for 3 months)
      const cutoffDate = new Date(year, expiryMonths, 0, 23, 59, 59, 999);

      if (asOfDate > cutoffDate) {
        // If employee has unused carried forward balance, expire it
        // The remaining carried forward portion is min(carriedForwardDays, max(0, closingBalance))
        const currentClosing = LeaveBalanceService.calculateClosingBalance(ent);
        const remainingCarried = Math.min(ent.carriedForwardDays, Math.max(0, currentClosing));

        if (remainingCarried > 0) {
          const prevClosing = currentClosing;
          const newExpiredTotal = ent.expiredDays + remainingCarried;
          const newClosing = LeaveBalanceService.calculateClosingBalance({
            ...ent,
            expiredDays: newExpiredTotal,
          });

          await db.leaveEntitlement.update({
            where: { id: ent.id },
            data: {
              expiredDays: newExpiredTotal,
              availableBalance: Math.max(0, newClosing - ent.pendingDays),
            },
          });

          await LeaveLedgerService.recordTransaction({
            employeeId: ent.employeeId,
            leaveTypeId: ent.leaveTypeId,
            entitlementId: ent.id,
            transactionType: 'EXPIRY',
            days: -remainingCarried,
            reference: `EXPIRY-${year}-CUTOFF`,
            previousBalance: prevClosing,
            newBalance: newClosing,
            reason: `Carried-forward leave expired on ${cutoffDate.toISOString().split('T')[0]} (${expiryMonths} months cutoff reached)`,
            createdById: executedById,
          });

          expiredCount++;
          records.push({
            employeeId: ent.employeeId,
            employeeName: ent.employee.fullName,
            leaveTypeId: ent.leaveTypeId,
            expiredDays: remainingCarried,
            cutoffDate,
          });
        }
      }
    }

    await AuditService.log({
      userId: executedById,
      action: 'RUN_LEAVE_EXPIRY',
      module: 'LEAVE',
      entityId: `EXPIRY-${year}`,
      newValue: { year, asOfDate, expiredCount },
    });

    return {
      year,
      asOfDate,
      expiredCount,
      records,
    };
  }
}
