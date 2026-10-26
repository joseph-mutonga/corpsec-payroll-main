import { db } from '../db';
import { LeaveBalanceService } from './LeaveBalanceService';
import { LeaveLedgerService } from './LeaveLedgerService';
import { AuditService } from '../audit';

export class LeaveCarryForwardService {
  /**
   * Executes Year-End Rollover:
   * Carried Forward = min(Eligible Unused Balance, Carry Forward Limit)
   * Initializes new year entitlement and transfers carried forward days.
   */
  static async processYearRollover(
    fromYear: number,
    toYear: number,
    executedById?: string
  ) {
    if (toYear !== fromYear + 1) {
      throw new Error(`Target year (${toYear}) must immediately follow source year (${fromYear}).`);
    }

    const employees = await db.employee.findMany({
      where: { employmentStatus: 'ACTIVE', deletedAt: null },
    });

    let rolloverCount = 0;
    const summaries = [];

    for (const emp of employees) {
      const fromEntitlements = await db.leaveEntitlement.findMany({
        where: { employeeId: emp.id, leaveYear: fromYear },
        include: { leaveType: true, policy: true },
      });

      for (const fromEnt of fromEntitlements) {
        if (!fromEnt.policy || !fromEnt.policy.allowCarryForward || !fromEnt.leaveType.carryForwardEnabled) {
          continue; // Leave type or policy does not allow carry-forward
        }

        const closingBalance = LeaveBalanceService.calculateClosingBalance(fromEnt);
        const unusedBalance = Math.max(0, closingBalance);

        if (unusedBalance <= 0) continue;

        const maxLimit = fromEnt.policy.maxCarryForwardDays ?? 5;
        const carriedDays = Math.min(unusedBalance, maxLimit);

        if (carriedDays > 0) {
          // Initialize target year entitlement
          const toEntitlements = await LeaveBalanceService.getOrCreateEntitlements(emp.id, toYear);
          const toEnt = toEntitlements.find((e) => e.leaveTypeId === fromEnt.leaveTypeId);

          if (toEnt) {
            const prevClosing = LeaveBalanceService.calculateClosingBalance(toEnt);
            const newClosing = LeaveBalanceService.calculateClosingBalance({
              ...toEnt,
              carriedForwardDays: carriedDays,
            });

            await db.leaveEntitlement.update({
              where: { id: toEnt.id },
              data: {
                carriedForwardDays: carriedDays,
                availableBalance: Math.max(0, newClosing - toEnt.pendingDays),
              },
            });

            await LeaveLedgerService.recordTransaction({
              employeeId: emp.id,
              leaveTypeId: fromEnt.leaveTypeId,
              entitlementId: toEnt.id,
              transactionType: 'CARRY_FORWARD',
              days: carriedDays,
              reference: `ROLLOVER-${fromYear}-TO-${toYear}`,
              previousBalance: prevClosing,
              newBalance: newClosing,
              reason: `Carried forward ${carriedDays} days from ${fromYear} (Unused: ${unusedBalance}, Limit: ${maxLimit})`,
              createdById: executedById,
            });

            rolloverCount++;
            summaries.push({
              employeeId: emp.id,
              leaveTypeId: fromEnt.leaveTypeId,
              unusedBalance,
              carriedDays,
            });
          }
        }
      }
    }

    await AuditService.log({
      userId: executedById,
      action: 'RUN_LEAVE_ROLLOVER',
      module: 'LEAVE',
      entityId: `ROLLOVER-${fromYear}-${toYear}`,
      newValue: { fromYear, toYear, rolloverCount },
    });

    return {
      fromYear,
      toYear,
      rolloverCount,
      summaries,
    };
  }
}
