import { db } from '../db';
import { LeaveDayCalculator, toDateStringKey } from './LeaveDayCalculator';
import { LeaveBalanceService } from './LeaveBalanceService';
import { LeavePolicyService } from './LeavePolicyService';
import { LeaveNotificationService } from './LeaveNotificationService';
import { AuditService } from '../audit';

export interface CreateLeaveRequestInput {
  employeeId: string;
  leaveTypeId: string;
  startDate: Date | string;
  endDate: Date | string;
  isHalfDay?: boolean;
  halfDaySession?: 'MORNING' | 'AFTERNOON';
  reason: string;
  contactPhone?: string;
  contactAddress?: string;
  emergencyContact?: string;
  relieverEmployeeId?: string;
  documentIds?: string[];
  isExtension?: boolean;
  parentRequestId?: string;
  createdById?: string;
}

export class LeaveRequestService {
  /**
   * Generates formatted request reference: CORPSEC-LV-YYYY-XXXXXX
   */
  static async generateRequestNumber(year: number = new Date().getFullYear()): Promise<string> {
    const prefix = `CORPSEC-LV-${year}-`;
    const lastRequest = await db.leaveRequest.findFirst({
      where: {
        requestNumber: { startsWith: prefix },
      },
      orderBy: { requestNumber: 'desc' },
      select: { requestNumber: true },
    });

    let nextNum = 1;
    if (lastRequest && lastRequest.requestNumber) {
      const parts = lastRequest.requestNumber.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        nextNum = lastSeq + 1;
      }
    }

    const seq = String(nextNum).padStart(6, '0');
    return `${prefix}${seq}`;
  }

  /**
   * Checks for overlapping leave or absence conflicts.
   */
  static async detectOverlapConflicts(
    employeeId: string,
    startDate: Date,
    endDate: Date,
    excludeRequestId?: string
  ): Promise<{ hasConflict: boolean; conflicts: any[] }> {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const overlapping = await db.leaveRequest.findMany({
      where: {
        employeeId,
        id: excludeRequestId ? { not: excludeRequestId } : undefined,
        status: { in: ['SUBMITTED', 'MANAGER_REVIEW', 'HR_REVIEW', 'APPROVED', 'ACTIVE'] },
        AND: [
          { startDate: { lte: end } },
          { endDate: { gte: start } },
        ],
      },
      include: { leaveType: true },
    });

    return {
      hasConflict: overlapping.length > 0,
      conflicts: overlapping,
    };
  }

  /**
   * Submits a new leave application with validation.
   */
  static async submitRequest(data: CreateLeaveRequestInput) {
    if (!data.employeeId || !data.leaveTypeId || !data.startDate || !data.endDate || !data.reason) {
      throw new Error('Employee, leave type, start date, end date, and reason are required.');
    }

    const employee = await db.employee.findUnique({
      where: { id: data.employeeId },
      include: { department: true, branch: true, station: true },
    });
    if (!employee) throw new Error('Employee record not found.');

    const leaveType = await db.leaveType.findUnique({ where: { id: data.leaveTypeId } });
    if (!leaveType || leaveType.status !== 'ACTIVE' || leaveType.deletedAt) {
      throw new Error('Selected leave type is not active or available.');
    }

    const start = new Date(data.startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(data.endDate);
    end.setHours(0, 0, 0, 0);

    if (end < start) {
      throw new Error('Leave end date cannot be earlier than start date.');
    }

    const year = start.getFullYear();

    // 1. Resolve Policy
    const policy = await LeavePolicyService.resolvePolicyForEmployee(data.employeeId, data.leaveTypeId);

    // 2. Probation Eligibility Validation
    if (policy && !policy.probationEligible && employee.employmentStatus === 'ON_PROBATION') {
      throw new Error(`Employees on probation are not eligible for ${leaveType.name} under current policy rules.`);
    }

    // 3. Minimum Notice Period Validation
    const requiredNotice = policy?.noticePeriodDays || leaveType.minNoticeDays || 0;
    if (requiredNotice > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysUntilStart = Math.ceil((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilStart < requiredNotice) {
        throw new Error(
          `Minimum notice of ${requiredNotice} day(s) is required for ${leaveType.name}. Request submitted with only ${Math.max(0, daysUntilStart)} day(s) notice.`
        );
      }
    }

    // 4. Overlap & Double-booking Check
    const { hasConflict, conflicts } = await this.detectOverlapConflicts(data.employeeId, start, end, data.parentRequestId);
    if (hasConflict) {
      const conflictList = conflicts
        .map(
          (c) =>
            `${c.requestNumber} (${c.leaveType.name}: ${new Date(c.startDate).toLocaleDateString()} to ${new Date(c.endDate).toLocaleDateString()} [${c.status}])`
        )
        .join(', ');
      throw new Error(`Overlapping leave detected! You already have conflicting request(s): ${conflictList}`);
    }

    // 5. Working Day & Duration Calculation
    const excludeWeekends = policy?.excludeWeekends ?? true;
    const excludeHolidays = policy?.excludeHolidays ?? true;

    const dayCalc = await LeaveDayCalculator.calculateWorkingDays(start, end, {
      excludeWeekends,
      excludeHolidays,
      isHalfDay: data.isHalfDay,
      branchId: employee.branchId || undefined,
      stationId: employee.stationId || undefined,
    });

    const durationDays = dayCalc.durationDays;
    if (durationDays <= 0) {
      throw new Error('The selected date range contains 0 working days (falls entirely on weekends or gazetted public holidays).');
    }

    // 6. Max Consecutive Days Validation
    if (policy?.maxConsecutiveDays && durationDays > policy.maxConsecutiveDays) {
      throw new Error(
        `Requested duration of ${durationDays} days exceeds the policy maximum limit of ${policy.maxConsecutiveDays} consecutive days.`
      );
    }

    // 7. Balance & Entitlement Validation
    if (leaveType.isPaid) {
      const balCheck = await LeaveBalanceService.validateBalanceForRequest(data.employeeId, data.leaveTypeId, durationDays, year);
      if (!balCheck.isValid) {
        throw new Error(balCheck.message || 'Insufficient leave balance available.');
      }
    }

    // 8. Generate Request Number
    const requestNumber = await this.generateRequestNumber(year);

    // 9. Create Request Record inside a Transaction (and update pendingDays)
    const paidDays = leaveType.isPaid ? durationDays : 0;
    const unpaidDays = leaveType.isPaid ? 0 : durationDays;
    const initialApprovalStep = policy?.approvalHierarchy === 'HR_ONLY' ? 'HR_REVIEW' : 'MANAGER_REVIEW';

    const result = await db.$transaction(async (tx) => {
      const leaveRequest = await tx.leaveRequest.create({
        data: {
          requestNumber,
          employeeId: data.employeeId,
          leaveTypeId: data.leaveTypeId,
          leaveYear: year,
          startDate: start,
          endDate: end,
          durationDays,
          workingDays: dayCalc.workingDaysCount,
          calendarDays: dayCalc.calendarDaysCount,
          paidDays,
          unpaidDays,
          isHalfDay: data.isHalfDay ?? false,
          halfDaySession: data.halfDaySession,
          reason: data.reason.trim(),
          contactPhone: data.contactPhone || employee.primaryPhone,
          contactAddress: data.contactAddress,
          emergencyContact: data.emergencyContact,
          relieverEmployeeId: data.relieverEmployeeId,
          status: 'SUBMITTED',
          approvalStep: initialApprovalStep,
          isExtended: data.isExtension ?? false,
          parentRequestId: data.parentRequestId,
          returnDateExpected: new Date(end.getTime() + 24 * 60 * 60 * 1000), // Next calendar day
          returnStatus: 'EXPECTED',
        },
        include: {
          employee: {
            include: { department: true, position: true, branch: true, station: true },
          },
          leaveType: true,
          reliever: true,
        },
      });

      // Update pending days on LeaveEntitlement
      const entitlement = await tx.leaveEntitlement.findUnique({
        where: {
          employeeId_leaveTypeId_leaveYear: {
            employeeId: data.employeeId,
            leaveTypeId: data.leaveTypeId,
            leaveYear: year,
          },
        },
      });

      if (entitlement) {
        const newPending = entitlement.pendingDays + durationDays;
        const closing = LeaveBalanceService.calculateClosingBalance(entitlement);
        await tx.leaveEntitlement.update({
          where: { id: entitlement.id },
          data: {
            pendingDays: newPending,
            availableBalance: Math.max(0, closing - newPending),
          },
        });
      }

      return leaveRequest;
    });

    // 10. Trigger Notifications & Audit Log
    await LeaveNotificationService.notifyLeaveSubmitted({
      id: result.id,
      requestNumber: result.requestNumber,
      employee: {
        fullName: employee.fullName,
        supervisorId: employee.supervisorId,
        department: employee.department,
      },
      leaveType: { name: leaveType.name },
      durationDays,
      startDate: start,
      endDate: end,
    });

    await AuditService.log({
      userId: data.createdById,
      action: 'SUBMIT_LEAVE_REQUEST',
      module: 'LEAVE',
      entityId: result.id,
      newValue: {
        requestNumber: result.requestNumber,
        employeeId: result.employeeId,
        durationDays,
        startDate: start,
        endDate: end,
      },
    });

    return result;
  }

  /**
   * Withdraws a pending leave request by the employee before it is reviewed.
   */
  static async withdrawRequest(requestId: string, employeeId: string, reason?: string) {
    const existing = await db.leaveRequest.findUnique({ where: { id: requestId } });
    if (!existing) throw new Error('Leave request not found.');

    if (existing.employeeId !== employeeId) {
      throw new Error('Unauthorized: You can only withdraw your own leave requests.');
    }

    if (!['SUBMITTED', 'MANAGER_REVIEW', 'HR_REVIEW'].includes(existing.status)) {
      throw new Error(`Cannot withdraw leave request in '${existing.status}' status.`);
    }

    const updated = await db.$transaction(async (tx) => {
      const res = await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: 'WITHDRAWN',
          cancellationReason: reason || 'Withdrawn by applicant',
        },
      });

      // Release pending days reservation
      const entitlement = await tx.leaveEntitlement.findUnique({
        where: {
          employeeId_leaveTypeId_leaveYear: {
            employeeId: existing.employeeId,
            leaveTypeId: existing.leaveTypeId,
            leaveYear: existing.leaveYear,
          },
        },
      });

      if (entitlement) {
        const newPending = Math.max(0, entitlement.pendingDays - existing.durationDays);
        const closing = LeaveBalanceService.calculateClosingBalance(entitlement);
        await tx.leaveEntitlement.update({
          where: { id: entitlement.id },
          data: {
            pendingDays: newPending,
            availableBalance: Math.max(0, closing - newPending),
          },
        });
      }

      return res;
    });

    await AuditService.log({
      action: 'WITHDRAW_LEAVE_REQUEST',
      module: 'LEAVE',
      entityId: requestId,
      previousValue: { status: existing.status },
      newValue: { status: 'WITHDRAWN', reason },
    });

    return updated;
  }
}
