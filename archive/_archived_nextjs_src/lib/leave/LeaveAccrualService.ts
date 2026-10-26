import { db } from '../db';
import { LeaveBalanceService } from './LeaveBalanceService';
import { LeaveLedgerService } from './LeaveLedgerService';
import { AuditService } from '../audit';

export class LeaveAccrualService {
  /**
   * Calculates monthly accrued days for a given annual entitlement and month index (1 to 12).
   */
  static calculateMonthlyAccrual(annualEntitlement: number, currentMonth: number): number {
    if (currentMonth <= 0) return 0;
    const months = Math.min(12, Math.max(1, currentMonth));
    const accrued = (annualEntitlement * months) / 12;
    return Math.round(accrued * 100) / 100;
  }

  /**
   * Runs periodic accrual processing for all active employees for a given leave year and month.
   */
  static async processPeriodicAccrual(
    year: number = new Date().getFullYear(),
    month: number = new Date().getMonth() + 1,
    executedById?: string
  ) {
    const activeEmployees = await db.employee.findMany({
      where: { employmentStatus: 'ACTIVE', deletedAt: null },
    });

    let processedCount = 0;
    const details = [];

    for (const emp of activeEmployees) {
      const entitlements = await LeaveBalanceService.getOrCreateEntitlements(emp.id, year);

      for (const ent of entitlements) {
        if (!ent.policy || ent.policy.accrualMethod !== 'MONTHLY_ACCRUAL') {
          continue; // Skip annual allocation or custom policies
        }

        const targetAccrued = this.calculateMonthlyAccrual(ent.entitledDays, month);
        const delta = Math.round((targetAccrued - ent.accruedDays) * 100) / 100;

        if (delta > 0) {
          const prevClosing = LeaveBalanceService.calculateClosingBalance(ent);
          const newClosing = LeaveBalanceService.calculateClosingBalance({
            ...ent,
            accruedDays: targetAccrued,
          });

          await db.leaveEntitlement.update({
            where: { id: ent.id },
            data: {
              accruedDays: targetAccrued,
              availableBalance: Math.max(0, newClosing - ent.pendingDays),
            },
          });

          await LeaveLedgerService.recordTransaction({
            employeeId: emp.id,
            leaveTypeId: ent.leaveTypeId,
            entitlementId: ent.id,
            transactionType: 'ACCRUAL',
            days: delta,
            reference: `ACCRUAL-${year}-M${String(month).padStart(2, '0')}`,
            previousBalance: prevClosing,
            newBalance: newClosing,
            reason: `Monthly leave accrual for Month ${month}/${year}`,
            createdById: executedById,
          });

          processedCount++;
          details.push({
            employeeId: emp.id,
            leaveTypeId: ent.leaveTypeId,
            delta,
            targetAccrued,
          });
        }
      }
    }

    await AuditService.log({
      userId: executedById,
      action: 'RUN_LEAVE_ACCRUAL',
      module: 'LEAVE',
      entityId: `ACCRUAL-${year}-M${month}`,
      newValue: { year, month, processedCount },
    });

    return {
      year,
      month,
      processedCount,
      details,
    };
  }
}
