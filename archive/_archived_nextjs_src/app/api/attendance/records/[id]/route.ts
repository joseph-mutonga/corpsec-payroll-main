import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/auth-helpers';
import { attendanceRecordCreateSchema } from '@/lib/validation';
import { evaluateAttendance, ShiftInfo } from '@/lib/attendance-calculator';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(['attendance.view']);
    const record = await db.attendanceRecord.findUnique({
      where: { id: params.id },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            branch: { select: { id: true, name: true, code: true } },
            department: { select: { id: true, name: true, code: true } },
            station: { select: { id: true, name: true, code: true } },
          },
        },
        scheduledShift: true,
        approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        lockedBy: { select: { id: true, firstName: true, lastName: true } },
        events: { orderBy: { timestamp: 'asc' } },
        overtimeRecords: true,
        adjustments: {
          include: {
            correctedBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!record) {
      return errorResponse('Attendance record not found', 404);
    }

    return successResponse(record);
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to fetch attendance record', error.status || 500);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(['attendance.edit']);
    const body = await req.json();

    const existing = await db.attendanceRecord.findUnique({
      where: { id: params.id },
      include: { scheduledShift: true },
    });

    if (!existing) {
      return errorResponse('Attendance record not found', 404);
    }

    if (existing.approvalStatus === 'LOCKED') {
      return errorResponse('Attendance record is LOCKED and cannot be edited directly. Use the correction adjustment workflow.', 403);
    }

    const partialSchema = attendanceRecordCreateSchema.partial();
    const parsed = partialSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message || 'Validation error', 400);
    }

    const data = parsed.data;

    // Recalculate metrics if times changed
    const actualClockIn = data.actualClockIn !== undefined
      ? (data.actualClockIn ? new Date(data.actualClockIn) : null)
      : existing.actualClockIn;
    const actualClockOut = data.actualClockOut !== undefined
      ? (data.actualClockOut ? new Date(data.actualClockOut) : null)
      : existing.actualClockOut;

    const shift = existing.scheduledShift;
    const shiftInfo: ShiftInfo | null = shift
      ? {
          startTime: data.scheduledStartTime || shift.startTime,
          endTime: data.scheduledEndTime || shift.endTime,
          isOvernight: shift.isOvernight,
          gracePeriodMinutes: shift.gracePeriodMinutes,
          breakDurationMinutes: data.breakDurationMinutes ?? shift.breakDurationMinutes,
          isBreakPaid: shift.isBreakPaid,
        }
      : null;

    const evalResult = evaluateAttendance({
      workDate: existing.date,
      shift: shiftInfo,
      actualClockIn,
      actualClockOut,
      customBreakMinutes: data.breakDurationMinutes ?? existing.breakDurationMinutes,
      existingStatus: data.attendanceStatus || existing.attendanceStatus,
    });

    const updated = await db.attendanceRecord.update({
      where: { id: params.id },
      data: {
        ...(data.actualClockIn !== undefined && { actualClockIn }),
        ...(data.actualClockOut !== undefined && { actualClockOut }),
        ...(data.breakDurationMinutes !== undefined && { breakDurationMinutes: data.breakDurationMinutes }),
        workedMinutes: evalResult.workedMinutes,
        lateMinutes: evalResult.lateMinutes,
        earlyDepartureMinutes: evalResult.earlyDepartureMinutes,
        overtimeMinutes: evalResult.overtimeMinutes,
        attendanceStatus: data.attendanceStatus || evalResult.attendanceStatus,
        ...(data.notes !== undefined && { notes: data.notes || null }),
        ...(data.approvalStatus && { approvalStatus: data.approvalStatus }),
      },
      include: {
        employee: { select: { fullName: true, employeeNumber: true } },
        scheduledShift: true,
      },
    });

    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'UPDATE_ATTENDANCE',
      module: 'ATTENDANCE',
      entityType: 'AttendanceRecord',
      entityId: params.id,
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(updated),
    });

    return successResponse(updated, 'Attendance record updated successfully');
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to update attendance record', error.status || 500);
  }
}
