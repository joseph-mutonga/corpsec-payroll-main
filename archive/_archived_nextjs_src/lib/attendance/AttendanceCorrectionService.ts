import { db } from '@/lib/db';
import { AttendanceCalculationService } from './AttendanceCalculationService';
import { AuditService } from '@/lib/audit';

export interface CorrectionRequestInput {
  attendanceRecordId: string;
  employeeId: string;
  fieldChanged: 'CLOCK_IN' | 'CLOCK_OUT' | 'STATUS' | 'WORKED_MINUTES' | 'OVERTIME';
  requestedValue: string;
  reason: string;
  requestedById?: string;
}

export class AttendanceCorrectionService {
  /**
   * Lists attendance corrections and adjustments.
   */
  static async listCorrections(filters: {
    employeeId?: string;
    status?: string;
    departmentId?: string;
  } = {}) {
    const where: any = {};
    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.status && filters.status !== 'ALL') where.status = filters.status;

    return db.attendanceAdjustment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        attendanceRecord: {
          include: { scheduledShift: true },
        },
        employee: {
          select: {
            id: true,
            fullName: true,
            employeeNumber: true,
            department: { select: { id: true, name: true } },
          },
        },
        correctedBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /**
   * Submits an attendance correction request.
   */
  static async submitCorrection(input: CorrectionRequestInput) {
    const record = await db.attendanceRecord.findUnique({
      where: { id: input.attendanceRecordId },
    });
    if (!record) throw new Error('Attendance record not found.');

    let originalValue: string | null = null;
    switch (input.fieldChanged) {
      case 'CLOCK_IN':
        originalValue = record.actualClockIn ? new Date(record.actualClockIn).toISOString() : null;
        break;
      case 'CLOCK_OUT':
        originalValue = record.actualClockOut ? new Date(record.actualClockOut).toISOString() : null;
        break;
      case 'STATUS':
        originalValue = record.attendanceStatus;
        break;
      case 'WORKED_MINUTES':
        originalValue = String(record.workedMinutes);
        break;
      case 'OVERTIME':
        originalValue = String(record.overtimeMinutes);
        break;
    }

    const adjustment = await db.attendanceAdjustment.create({
      data: {
        attendanceRecordId: input.attendanceRecordId,
        employeeId: input.employeeId,
        fieldChanged: input.fieldChanged,
        originalValue,
        newValue: input.requestedValue,
        reason: input.reason.trim(),
        correctedById: input.requestedById || null,
        status: 'PENDING_REVIEW',
      },
      include: {
        attendanceRecord: true,
        employee: { select: { id: true, fullName: true, employeeNumber: true } },
      },
    });

    if (input.requestedById) {
      await AuditService.log({
        userId: input.requestedById,
        action: 'SUBMIT_ATTENDANCE_CORRECTION',
        resource: 'attendance_adjustments',
        resourceId: adjustment.id,
        details: {
          fieldChanged: input.fieldChanged,
          original: originalValue,
          requested: input.requestedValue,
          reason: input.reason,
        },
      });
    }

    return adjustment;
  }

  /**
   * Reviews and applies or rejects an attendance correction request.
   */
  static async reviewCorrection(data: {
    adjustmentId: string;
    decision: 'APPROVE' | 'REJECT';
    reviewerUserId: string;
    comments?: string;
  }) {
    const adjustment = await db.attendanceAdjustment.findUnique({
      where: { id: data.adjustmentId },
      include: { attendanceRecord: { include: { scheduledShift: true } } },
    });
    if (!adjustment) throw new Error('Adjustment request not found.');

    if (adjustment.status !== 'PENDING_REVIEW') {
      throw new Error(`Adjustment has already been finalized as ${adjustment.status}.`);
    }

    if (data.decision === 'REJECT') {
      const rejected = await db.attendanceAdjustment.update({
        where: { id: data.adjustmentId },
        data: {
          status: 'REJECTED',
          approvedById: data.reviewerUserId,
        },
      });

      await AuditService.log({
        userId: data.reviewerUserId,
        action: 'REJECT_ATTENDANCE_CORRECTION',
        resource: 'attendance_adjustments',
        resourceId: adjustment.id,
        details: { comments: data.comments },
      });

      return rejected;
    }

    // Apply Correction to AttendanceRecord
    const record = adjustment.attendanceRecord;
    const updateData: any = {};

    if (adjustment.fieldChanged === 'CLOCK_IN') {
      updateData.actualClockIn = new Date(adjustment.newValue!);
    } else if (adjustment.fieldChanged === 'CLOCK_OUT') {
      updateData.actualClockOut = new Date(adjustment.newValue!);
    } else if (adjustment.fieldChanged === 'STATUS') {
      updateData.attendanceStatus = adjustment.newValue!;
    } else if (adjustment.fieldChanged === 'WORKED_MINUTES') {
      updateData.workedMinutes = parseInt(adjustment.newValue!, 10);
    } else if (adjustment.fieldChanged === 'OVERTIME') {
      updateData.overtimeMinutes = parseInt(adjustment.newValue!, 10);
    }

    // Re-calculate metrics if clock times were modified
    if (updateData.actualClockIn || updateData.actualClockOut) {
      const clockIn = updateData.actualClockIn || record.actualClockIn;
      const clockOut = updateData.actualClockOut || record.actualClockOut;
      const calc = AttendanceCalculationService.calculateAttendance(
        record.scheduledStartTime,
        record.scheduledEndTime,
        clockIn,
        clockOut,
        {
          breakDurationMinutes: record.breakDurationMinutes,
          isBreakPaid: record.scheduledShift?.isBreakPaid ?? false,
          isCrossMidnight: record.isCrossMidnight,
        }
      );
      updateData.workedMinutes = calc.workedMinutes;
      updateData.lateMinutes = calc.lateMinutes;
      updateData.earlyDepartureMinutes = calc.earlyDepartureMinutes;
      updateData.overtimeMinutes = calc.overtimeMinutes;
      if (calc.isLate) updateData.attendanceStatus = 'LATE';
      if (calc.overtimeMinutes > 0) updateData.attendanceStatus = 'PRESENT_WITH_OVERTIME';
    }

    await db.attendanceRecord.update({
      where: { id: record.id },
      data: updateData,
    });

    const approvedAdjustment = await db.attendanceAdjustment.update({
      where: { id: data.adjustmentId },
      data: {
        status: 'APPLIED',
        approvedById: data.reviewerUserId,
      },
    });

    await AuditService.log({
      userId: data.reviewerUserId,
      action: 'APPROVE_ATTENDANCE_CORRECTION',
      resource: 'attendance_adjustments',
      resourceId: adjustment.id,
      details: {
        fieldChanged: adjustment.fieldChanged,
        appliedValue: adjustment.newValue,
        recordUpdates: updateData,
      },
    });

    return approvedAdjustment;
  }
}
