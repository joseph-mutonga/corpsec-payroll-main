import { db } from '../db';
import { LeaveBalanceService } from './LeaveBalanceService';
import { LeaveLedgerService } from './LeaveLedgerService';
import { LeavePolicyService } from './LeavePolicyService';
import { LeaveNotificationService } from './LeaveNotificationService';
import { AuditService } from '../audit';

export interface ManagerApprovalInput {
  requestId: string;
  managerUserId: string;
  decision: 'APPROVE' | 'REJECT';
  comments?: string;
}

export interface HrApprovalInput {
  requestId: string;
  hrUserId: string;
  decision: 'APPROVE' | 'REJECT';
  comments?: string;
}

export interface CancellationInput {
  requestId: string;
  cancelledByUserId: string;
  reason: string;
}

export class LeaveApprovalService {
  /**
   * Manager Level Review / Approval
   */
  static async processManagerReview(data: ManagerApprovalInput) {
    const request = await db.leaveRequest.findUnique({
      where: { id: data.requestId },
      include: { leaveType: true, employee: true },
    });

    if (!request) throw new Error('Leave request not found.');

    if (!['SUBMITTED', 'MANAGER_REVIEW'].includes(request.status)) {
      throw new Error(`Cannot process manager review for request in '${request.status}' status.`);
    }

    if (data.decision === 'REJECT') {
      return this.rejectRequest(request.id, data.managerUserId, data.comments || 'Rejected by Manager');
    }

    // Resolve Policy for approval hierarchy check
    const policy = await LeavePolicyService.resolvePolicyForEmployee(request.employeeId, request.leaveTypeId);
    const hierarchy = policy?.approvalHierarchy || 'MANAGER_HR';

    const requiresHrReview = hierarchy === 'MANAGER_HR' || hierarchy === 'SUPERVISOR_MANAGER_HR' || hierarchy === 'HR_ONLY';

    if (requiresHrReview) {
      // Transition to HR_REVIEW
      const updated = await db.leaveRequest.update({
        where: { id: request.id },
        data: {
          status: 'HR_REVIEW',
          approvalStep: 'HR_REVIEW',
          managerApprovedById: data.managerUserId,
          managerApprovedAt: new Date(),
          managerComments: data.comments,
        },
        include: { employee: true, leaveType: true },
      });

      await AuditService.log({
        userId: data.managerUserId,
        action: 'MANAGER_APPROVE_LEAVE_REQUEST',
        module: 'LEAVE',
        entityId: request.id,
        newValue: { status: 'HR_REVIEW', managerApprovedById: data.managerUserId },
      });

      return updated;
    } else {
      // Directly approve at Manager level
      return this.finalizeApproval(request.id, data.managerUserId, 'MANAGER', data.comments);
    }
  }

  /**
   * HR Level Review / Final Approval
   */
  static async processHrReview(data: HrApprovalInput) {
    const request = await db.leaveRequest.findUnique({
      where: { id: data.requestId },
      include: { leaveType: true, employee: true },
    });

    if (!request) throw new Error('Leave request not found.');

    if (!['HR_REVIEW', 'SUBMITTED', 'MANAGER_REVIEW'].includes(request.status)) {
      throw new Error(`Cannot process HR review for request in '${request.status}' status.`);
    }

    if (data.decision === 'REJECT') {
      return this.rejectRequest(request.id, data.hrUserId, data.comments || 'Rejected by HR');
    }

    return this.finalizeApproval(request.id, data.hrUserId, 'HR', data.comments);
  }

  /**
   * Finalizes leave approval, decrements pending, increments used, and records USAGE in ledger.
   */
  private static async finalizeApproval(
    requestId: string,
    authorizerId: string,
    level: 'MANAGER' | 'HR',
    comments?: string
  ) {
    const request = await db.leaveRequest.findUnique({
      where: { id: requestId },
      include: { leaveType: true, employee: true },
    });
    if (!request) throw new Error('Leave request not found.');

    const year = request.leaveYear;

    const result = await db.$transaction(async (tx) => {
      const updateData: any = {
        status: 'APPROVED',
        approvalStep: 'COMPLETED',
        reviewedById: authorizerId,
        reviewedAt: new Date(),
        reviewerComments: comments,
      };

      if (level === 'MANAGER') {
        updateData.managerApprovedById = authorizerId;
        updateData.managerApprovedAt = new Date();
        updateData.managerComments = comments;
      } else {
        updateData.hrApprovedById = authorizerId;
        updateData.hrApprovedAt = new Date();
        updateData.hrComments = comments;
      }

      const approvedRequest = await tx.leaveRequest.update({
        where: { id: requestId },
        data: updateData,
        include: { employee: true, leaveType: true },
      });

      // Update LeaveEntitlement: pendingDays -= duration, usedDays += duration
      const entitlement = await tx.leaveEntitlement.findUnique({
        where: {
          employeeId_leaveTypeId_leaveYear: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            leaveYear: year,
          },
        },
      });

      if (entitlement) {
        const prevClosing = LeaveBalanceService.calculateClosingBalance(entitlement);
        const newUsed = entitlement.usedDays + request.durationDays;
        const newPending = Math.max(0, entitlement.pendingDays - request.durationDays);

        const newClosing = LeaveBalanceService.calculateClosingBalance({
          ...entitlement,
          usedDays: newUsed,
        });

        await tx.leaveEntitlement.update({
          where: { id: entitlement.id },
          data: {
            usedDays: newUsed,
            pendingDays: newPending,
            availableBalance: Math.max(0, newClosing - newPending),
          },
        });

        // Record USAGE in ledger
        await tx.leaveLedgerEntry.create({
          data: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            entitlementId: entitlement.id,
            transactionType: 'USAGE',
            days: -request.durationDays,
            reference: request.requestNumber,
            previousBalance: prevClosing,
            newBalance: newClosing,
            reason: `Leave approved (${new Date(request.startDate).toLocaleDateString()} to ${new Date(request.endDate).toLocaleDateString()})`,
            createdById: authorizerId,
          },
        });
      }

      return approvedRequest;
    });

    // Synchronize attendance records for approved period
    await this.syncAttendanceForLeave(result);

    // Notify employee of approval
    await LeaveNotificationService.notifyDecision(
      {
        requestNumber: result.requestNumber,
        employeeId: result.employeeId,
        leaveType: { name: result.leaveType.name },
        durationDays: result.durationDays,
        startDate: result.startDate,
        endDate: result.endDate,
      },
      'APPROVED'
    );

    await AuditService.log({
      userId: authorizerId,
      action: 'APPROVE_LEAVE_REQUEST',
      module: 'LEAVE',
      entityId: result.id,
      newValue: { status: 'APPROVED', authorizerId, level },
    });

    return result;
  }

  /**
   * Rejects a leave request and releases reserved pending days.
   */
  static async rejectRequest(requestId: string, reviewerId: string, reason: string) {
    const request = await db.leaveRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new Error('Leave request not found.');

    const result = await db.$transaction(async (tx) => {
      const rejected = await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          approvalStep: 'COMPLETED',
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          rejectionReason: reason,
        },
        include: { employee: true, leaveType: true },
      });

      // Release reserved pending days
      const entitlement = await tx.leaveEntitlement.findUnique({
        where: {
          employeeId_leaveTypeId_leaveYear: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            leaveYear: request.leaveYear,
          },
        },
      });

      if (entitlement) {
        const newPending = Math.max(0, entitlement.pendingDays - request.durationDays);
        const closing = LeaveBalanceService.calculateClosingBalance(entitlement);
        await tx.leaveEntitlement.update({
          where: { id: entitlement.id },
          data: {
            pendingDays: newPending,
            availableBalance: Math.max(0, closing - newPending),
          },
        });
      }

      return rejected;
    });

    await LeaveNotificationService.notifyDecision(
      {
        requestNumber: result.requestNumber,
        employeeId: result.employeeId,
        leaveType: { name: result.leaveType.name },
        durationDays: result.durationDays,
        startDate: result.startDate,
        endDate: result.endDate,
      },
      'REJECTED',
      reason
    );

    await AuditService.log({
      userId: reviewerId,
      action: 'REJECT_LEAVE_REQUEST',
      module: 'LEAVE',
      entityId: result.id,
      newValue: { status: 'REJECTED', reason },
    });

    return result;
  }

  /**
   * Cancels an approved leave request with automatic balance restoration and ledger logging.
   */
  static async cancelApprovedLeave(data: CancellationInput) {
    const request = await db.leaveRequest.findUnique({
      where: { id: data.requestId },
      include: { employee: true, leaveType: true },
    });
    if (!request) throw new Error('Leave request not found.');

    if (request.status !== 'APPROVED' && request.status !== 'ACTIVE') {
      throw new Error(`Only approved or active leave requests can be cancelled via cancellation desk (Current status: ${request.status}).`);
    }

    const result = await db.$transaction(async (tx) => {
      const cancelled = await tx.leaveRequest.update({
        where: { id: request.id },
        data: {
          status: 'CANCELLED',
          cancelledById: data.cancelledByUserId,
          cancelledAt: new Date(),
          cancellationReason: data.reason,
        },
        include: { employee: true, leaveType: true },
      });

      // Restore usedDays on LeaveEntitlement
      const entitlement = await tx.leaveEntitlement.findUnique({
        where: {
          employeeId_leaveTypeId_leaveYear: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            leaveYear: request.leaveYear,
          },
        },
      });

      if (entitlement) {
        const prevClosing = LeaveBalanceService.calculateClosingBalance(entitlement);
        const restoredUsed = Math.max(0, entitlement.usedDays - request.durationDays);
        const newClosing = LeaveBalanceService.calculateClosingBalance({
          ...entitlement,
          usedDays: restoredUsed,
        });

        await tx.leaveEntitlement.update({
          where: { id: entitlement.id },
          data: {
            usedDays: restoredUsed,
            availableBalance: Math.max(0, newClosing - entitlement.pendingDays),
          },
        });

        // Record RESTORATION in ledger
        await tx.leaveLedgerEntry.create({
          data: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            entitlementId: entitlement.id,
            transactionType: 'RESTORATION',
            days: request.durationDays,
            reference: request.requestNumber,
            previousBalance: prevClosing,
            newBalance: newClosing,
            reason: `Leave cancelled. Restored ${request.durationDays} days: ${data.reason}`,
            createdById: data.cancelledByUserId,
          },
        });
      }

      return cancelled;
    });

    await LeaveNotificationService.notifyDecision(
      {
        requestNumber: result.requestNumber,
        employeeId: result.employeeId,
        leaveType: { name: result.leaveType.name },
        durationDays: result.durationDays,
        startDate: result.startDate,
        endDate: result.endDate,
      },
      'CANCELLED',
      data.reason
    );

    await AuditService.log({
      userId: data.cancelledByUserId,
      action: 'CANCEL_APPROVED_LEAVE_REQUEST',
      module: 'LEAVE',
      entityId: result.id,
      newValue: { status: 'CANCELLED', reason: data.reason },
    });

    return result;
  }

  /**
   * Synchronizes Attendance records during approved leave so attendance recognizes 'LEAVE' rather than 'ABSENT'.
   */
  private static async syncAttendanceForLeave(request: {
    employeeId: string;
    startDate: Date;
    endDate: Date;
    leaveType: { name: string; isPaid: boolean };
    requestNumber: string;
  }) {
    try {
      const curr = new Date(request.startDate);
      curr.setHours(0, 0, 0, 0);

      const end = new Date(request.endDate);
      end.setHours(0, 0, 0, 0);

      while (curr <= end) {
        const dateKey = new Date(curr);
        const dayOfWeek = dateKey.getDay();

        // Skip weekend dates if standard Monday-Friday
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          const existing = await db.attendanceRecord.findUnique({
            where: {
              employeeId_date: {
                employeeId: request.employeeId,
                date: dateKey,
              },
            },
          });

          if (!existing) {
            await db.attendanceRecord.create({
              data: {
                employeeId: request.employeeId,
                date: dateKey,
                attendanceStatus: 'ON_LEAVE',
                approvalStatus: 'APPROVED',
                notes: `On Approved ${request.leaveType.name} (${request.requestNumber})`,
              },
            });
          }
        }
        curr.setDate(curr.getDate() + 1);
      }
    } catch (err) {
      console.error('Error syncing attendance for approved leave:', err);
    }
  }
}
