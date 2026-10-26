import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/auth-helpers';
import { attendanceRecordCreateSchema } from '@/lib/validation';
import { evaluateAttendance, ShiftInfo } from '@/lib/attendance-calculator';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(['attendance.view']);
    const { searchParams } = new URL(req.url);

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    const date = searchParams.get('date');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const employeeId = searchParams.get('employeeId');
    const departmentId = searchParams.get('departmentId');
    const branchId = searchParams.get('branchId');
    const stationId = searchParams.get('stationId');
    const shiftId = searchParams.get('shiftId');
    const attendanceStatus = searchParams.get('status');
    const approvalStatus = searchParams.get('approvalStatus');
    const search = searchParams.get('search');

    const where: any = {};

    if (date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      where.date = d;
    } else if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        const sd = new Date(startDate);
        sd.setHours(0, 0, 0, 0);
        where.date.gte = sd;
      }
      if (endDate) {
        const ed = new Date(endDate);
        ed.setHours(23, 59, 59, 999);
        where.date.lte = ed;
      }
    }

    if (employeeId) where.employeeId = employeeId;
    if (shiftId) where.scheduledShiftId = shiftId;
    if (attendanceStatus && attendanceStatus !== 'ALL') where.attendanceStatus = attendanceStatus;
    if (approvalStatus && approvalStatus !== 'ALL') where.approvalStatus = approvalStatus;

    if (departmentId || branchId || stationId || search) {
      where.employee = { deletedAt: null };
      if (departmentId) where.employee.departmentId = departmentId;
      if (branchId) where.employee.branchId = branchId;
      if (stationId) where.employee.stationId = stationId;
      if (search) {
        where.employee.OR = [
          { fullName: { contains: search } },
          { employeeNumber: { contains: search } },
          { nationalId: { contains: search } },
        ];
      }
    }

    const [total, records] = await Promise.all([
      db.attendanceRecord.count({ where }),
      db.attendanceRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
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
          overtimeRecords: true,
          adjustments: {
            include: {
              correctedBy: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
    ]);

    return successResponse({
      records,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to fetch attendance records', error.status || 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(['attendance.create', 'attendance.edit']);
    const body = await req.json();

    const parsed = attendanceRecordCreateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message || 'Validation error', 400);
    }

    const data = parsed.data;

    const employee = await db.employee.findUnique({
      where: { id: data.employeeId },
      include: {
        shiftAssignments: {
          where: { status: 'ACTIVE' },
          include: { shift: true },
          take: 1,
        },
      },
    });

    if (!employee || employee.deletedAt) {
      return errorResponse('Employee not found', 404);
    }

    const workDate = new Date(data.date);
    workDate.setHours(0, 0, 0, 0);

    // Resolve shift
    let shift: any = null;
    if (data.scheduledShiftId) {
      shift = await db.shift.findUnique({ where: { id: data.scheduledShiftId } });
    } else if (employee.shiftAssignments[0]?.shift) {
      shift = employee.shiftAssignments[0].shift;
    }

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
      workDate,
      shift: shiftInfo,
      actualClockIn: data.actualClockIn ? new Date(data.actualClockIn) : null,
      actualClockOut: data.actualClockOut ? new Date(data.actualClockOut) : null,
      customBreakMinutes: data.breakDurationMinutes,
      existingStatus: data.attendanceStatus !== 'PRESENT' ? data.attendanceStatus : undefined,
    });

    const record = await db.attendanceRecord.upsert({
      where: {
        employeeId_date: {
          employeeId: data.employeeId,
          date: workDate,
        },
      },
      update: {
        scheduledShiftId: shift?.id || null,
        scheduledStartTime: shiftInfo?.startTime || null,
        scheduledEndTime: shiftInfo?.endTime || null,
        actualClockIn: data.actualClockIn ? new Date(data.actualClockIn) : null,
        actualClockOut: data.actualClockOut ? new Date(data.actualClockOut) : null,
        breakDurationMinutes: data.breakDurationMinutes || 0,
        workedMinutes: evalResult.workedMinutes,
        lateMinutes: evalResult.lateMinutes,
        earlyDepartureMinutes: evalResult.earlyDepartureMinutes,
        overtimeMinutes: evalResult.overtimeMinutes,
        attendanceStatus: data.attendanceStatus || evalResult.attendanceStatus,
        source: data.source || 'HR_MANUAL',
        notes: data.notes || null,
        approvalStatus: data.approvalStatus || 'SUBMITTED',
      },
      create: {
        employeeId: data.employeeId,
        date: workDate,
        scheduledShiftId: shift?.id || null,
        scheduledStartTime: shiftInfo?.startTime || null,
        scheduledEndTime: shiftInfo?.endTime || null,
        actualClockIn: data.actualClockIn ? new Date(data.actualClockIn) : null,
        actualClockOut: data.actualClockOut ? new Date(data.actualClockOut) : null,
        breakDurationMinutes: data.breakDurationMinutes || 0,
        workedMinutes: evalResult.workedMinutes,
        lateMinutes: evalResult.lateMinutes,
        earlyDepartureMinutes: evalResult.earlyDepartureMinutes,
        overtimeMinutes: evalResult.overtimeMinutes,
        attendanceStatus: data.attendanceStatus || evalResult.attendanceStatus,
        source: data.source || 'HR_MANUAL',
        notes: data.notes || null,
        approvalStatus: data.approvalStatus || 'SUBMITTED',
      },
      include: {
        employee: { select: { fullName: true, employeeNumber: true } },
        scheduledShift: true,
      },
    });

    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'MANUAL_ATTENDANCE_ENTRY',
      module: 'ATTENDANCE',
      entityType: 'AttendanceRecord',
      entityId: record.id,
      newValue: JSON.stringify(record),
    });

    return successResponse(record, 'Attendance record saved successfully', 201);
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to save attendance record', error.status || 500);
  }
}
