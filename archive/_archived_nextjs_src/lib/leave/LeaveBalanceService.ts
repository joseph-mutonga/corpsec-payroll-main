import { db } from '../db';
import { LeaveLedgerService } from './LeaveLedgerService';
import { LeavePolicyService } from './LeavePolicyService';
import { AuditService } from '../audit';

export interface LeaveBalanceSummary {
  leaveTypeId: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  isPaid: boolean;
  color: string;
  entitlementId: string;
  leaveYear: number;
  openingBalance: number;
  entitledDays: number;
  accruedDays: number;
  carriedForwardDays: number;
  adjustmentDays: number;
  usedDays: number;
  pendingDays: number;
  expiredDays: number;
  closingBalance: number; // Opening + Accrued + Adjustments + CarryForward - Used - Expired
  availableBalance: number; // Closing Balance - Pending
}

export interface ManualBalanceAdjustmentInput {
  employeeId: string;
  leaveTypeId: string;
  leaveYear?: number;
  direction: 'ADD' | 'DEDUCT';
  days: number;
  reason: string;
  supportingReference?: string;
  authorizedById?: string;
}

export class LeaveBalanceService {
  /**
   * Calculates closing balance using the strict deterministic formula:
   * Closing Balance = Opening + Accrued + Adjustments + Carry Forward - Used - Expired
   */
  static calculateClosingBalance(entitlement: {
    openingBalance: number;
    accruedDays: number;
    adjustmentDays: number;
    carriedForwardDays: number;
    usedDays: number;
    expiredDays: number;
  }): number {
    const raw =
      entitlement.openingBalance +
      entitlement.accruedDays +
      entitlement.adjustmentDays +
      entitlement.carriedForwardDays -
      entitlement.usedDays -
      entitlement.expiredDays;
    return Math.round(raw * 100) / 100;
  }

  /**
   * Ensures an employee has active LeaveEntitlement records for all active leave types for a given year.
   */
  static async getOrCreateEntitlements(employeeId: string, year: number = new Date().getFullYear()) {
    const leaveTypes = await db.leaveType.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
    });

    const results = [];
    for (const lt of leaveTypes) {
      let ent = await db.leaveEntitlement.findUnique({
        where: {
          employeeId_leaveTypeId_leaveYear: {
            employeeId,
            leaveTypeId: lt.id,
            leaveYear: year,
          },
        },
        include: { leaveType: true, policy: true },
      });

      if (!ent) {
        const policy = await LeavePolicyService.resolvePolicyForEmployee(employeeId, lt.id);
        const entitledDays = policy ? policy.entitledDays : lt.defaultDays;
        const openingBalance = policy && policy.accrualMethod === 'ANNUAL_ALLOCATION' ? entitledDays : 0;
        const availableBalance = openingBalance;

        ent = await db.leaveEntitlement.create({
          data: {
            employeeId,
            leaveTypeId: lt.id,
            policyId: policy?.id,
            leaveYear: year,
            openingBalance,
            entitledDays,
            accruedDays: 0,
            carriedForwardDays: 0,
            usedDays: 0,
            pendingDays: 0,
            adjustmentDays: 0,
            expiredDays: 0,
            availableBalance,
            status: 'ACTIVE',
          },
          include: { leaveType: true, policy: true },
        });

        // Record opening transaction in ledger if opening balance > 0
        if (openingBalance > 0) {
          await LeaveLedgerService.recordTransaction({
            employeeId,
            leaveTypeId: lt.id,
            entitlementId: ent.id,
            transactionType: 'OPENING',
            days: openingBalance,
            reference: `YEAR-${year}-INITIAL`,
            previousBalance: 0,
            newBalance: openingBalance,
            reason: 'Annual leave allocation at start of period',
          });
        }
      }

      results.push(ent);
    }

    return results;
  }

  /**
   * Gets complete leave balance summary matrix for an employee.
   */
  static async getEmployeeBalances(employeeId: string, year: number = new Date().getFullYear()): Promise<LeaveBalanceSummary[]> {
    const entitlements = await this.getOrCreateEntitlements(employeeId, year);

    return entitlements.map((ent) => {
      const closingBalance = this.calculateClosingBalance(ent);
      const availableBalance = Math.max(0, Math.round((closingBalance - ent.pendingDays) * 100) / 100);

      return {
        leaveTypeId: ent.leaveTypeId,
        leaveTypeCode: ent.leaveType.code,
        leaveTypeName: ent.leaveType.name,
        isPaid: ent.leaveType.isPaid,
        color: ent.leaveType.color || '#2563eb',
        entitlementId: ent.id,
        leaveYear: ent.leaveYear,
        openingBalance: ent.openingBalance,
        entitledDays: ent.entitledDays,
        accruedDays: ent.accruedDays,
        carriedForwardDays: ent.carriedForwardDays,
        adjustmentDays: ent.adjustmentDays,
        usedDays: ent.usedDays,
        pendingDays: ent.pendingDays,
        expiredDays: ent.expiredDays,
        closingBalance,
        availableBalance,
      };
    });
  }

  /**
   * Validates if employee has sufficient available balance for a requested duration.
   */
  static async validateBalanceForRequest(
    employeeId: string,
    leaveTypeId: string,
    requestedDays: number,
    year: number = new Date().getFullYear()
  ): Promise<{ isValid: boolean; availableBalance: number; shortfall: number; message?: string }> {
    const leaveType = await db.leaveType.findUnique({ where: { id: leaveTypeId } });
    if (!leaveType) throw new Error('Leave type not found.');

    // Unpaid leave generally has no upper balance ceiling unless configured
    if (!leaveType.isPaid && !leaveType.maxDays) {
      return { isValid: true, availableBalance: 999, shortfall: 0 };
    }

    const entitlements = await this.getEmployeeBalances(employeeId, year);
    const balance = entitlements.find((b) => b.leaveTypeId === leaveTypeId);

    const available = balance ? balance.availableBalance : 0;
    if (available >= requestedDays) {
      return { isValid: true, availableBalance: available, shortfall: 0 };
    }

    const shortfall = Math.round((requestedDays - available) * 100) / 100;
    return {
      isValid: false,
      availableBalance: available,
      shortfall,
      message: `Insufficient leave balance. You have ${available} days available, but requested ${requestedDays} days (Shortfall: ${shortfall} days).`,
    };
  }

  /**
   * Performs an audited manual balance adjustment by an authorized HR administrator.
   */
  static async performManualAdjustment(data: ManualBalanceAdjustmentInput) {
    const year = data.leaveYear || new Date().getFullYear();
    if (!data.reason || data.reason.trim().length < 5) {
      throw new Error('A detailed reason (minimum 5 characters) is required for manual balance adjustments.');
    }
    if (data.days <= 0) {
      throw new Error('Adjustment days must be greater than 0.');
    }

    await this.getOrCreateEntitlements(data.employeeId, year);

    const entitlement = await db.leaveEntitlement.findUnique({
      where: {
        employeeId_leaveTypeId_leaveYear: {
          employeeId: data.employeeId,
          leaveTypeId: data.leaveTypeId,
          leaveYear: year,
        },
      },
    });

    if (!entitlement) throw new Error('Leave entitlement record not found.');

    const previousClosing = this.calculateClosingBalance(entitlement);
    const delta = data.direction === 'ADD' ? data.days : -data.days;
    const newAdjustmentTotal = entitlement.adjustmentDays + delta;

    const newClosing = this.calculateClosingBalance({
      ...entitlement,
      adjustmentDays: newAdjustmentTotal,
    });

    const updatedEntitlement = await db.leaveEntitlement.update({
      where: { id: entitlement.id },
      data: {
        adjustmentDays: newAdjustmentTotal,
        availableBalance: Math.max(0, newClosing - entitlement.pendingDays),
      },
    });

    // Record immutable movement in ledger
    const ledgerEntry = await LeaveLedgerService.recordTransaction({
      employeeId: data.employeeId,
      leaveTypeId: data.leaveTypeId,
      entitlementId: entitlement.id,
      transactionType: 'ADJUSTMENT',
      days: delta,
      reference: data.supportingReference || `MAN-ADJ-${Date.now()}`,
      previousBalance: previousClosing,
      newBalance: newClosing,
      reason: data.reason.trim(),
      createdById: data.authorizedById,
    });

    // Also record in legacy LeaveAdjustment table for backward compatibility
    await db.leaveAdjustment.create({
      data: {
        employeeId: data.employeeId,
        leaveTypeId: data.leaveTypeId,
        entitlementId: entitlement.id,
        leaveYear: year,
        adjustmentType: data.direction === 'ADD' ? 'ADDITION' : 'DEDUCTION',
        adjustmentDays: delta,
        previousBalance: previousClosing,
        newBalance: newClosing,
        reason: data.reason.trim(),
        approvedById: data.authorizedById,
      },
    });

    return {
      entitlement: updatedEntitlement,
      ledgerEntry,
      previousBalance: previousClosing,
      newBalance: newClosing,
    };
  }
}
