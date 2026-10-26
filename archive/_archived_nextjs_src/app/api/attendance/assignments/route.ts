import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/auth-helpers';
import { employeeShiftAssignmentSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(['attendance.view', 'schedule.view']);
    const { searchParams } = new URL(req.url);

    const employeeId = searchParams.get('employeeId');
    const stationId = searchParams.get('stationId');
    const shiftId = searchParams.get('shiftId');
    const status = searchParams.get('status') || 'ACTIVE';

    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (stationId) where.stationId = stationId;
    if (shiftId) where.shiftId = shiftId;
    if (status && status !== 'ALL') where.status = status;

    const assignments = await db.employeeShiftAssignment.findMany({
      where,
      orderBy: { startDate: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            branch: { select: { id: true, name: true, code: true } },
            station: { select: { id: true, name: true, code: true } },
            department: { select: { id: true, name: true, code: true } },
          },
        },
        shift: true,
        workSchedule: true,
        station: true,
      },
    });

    return successResponse(assignments);
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to fetch shift assignments', error.status || 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(['schedule.create', 'attendance.create']);
    const body = await req.json();

    const parsed = employeeShiftAssignmentSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message || 'Validation error', 400);
    }

    const data = parsed.data;

    // Verify employee exists and is active
    const employee = await db.employee.findUnique({
      where: { id: data.employeeId },
    });
    if (!employee || employee.deletedAt) {
      return errorResponse('Employee not found', 404);
    }

    // Verify shift or schedule exists
    if (data.shiftId) {
      const shift = await db.shift.findUnique({ where: { id: data.shiftId } });
      if (!shift || shift.status !== 'ACTIVE') {
        return errorResponse('Assigned shift is invalid or inactive', 400);
      }
    }

    if (data.workScheduleId) {
      const schedule = await db.workSchedule.findUnique({ where: { id: data.workScheduleId } });
      if (!schedule || !schedule.isActive) {
        return errorResponse('Assigned work schedule is invalid or inactive', 400);
      }
    }

    // Atomically close previous active assignment and open new one
    const newAssignment = await db.$transaction(async (tx) => {
      // 1. Close any currently active assignment
      await tx.employeeShiftAssignment.updateMany({
        where: { employeeId: data.employeeId, status: 'ACTIVE' },
        data: {
          endDate: new Date(data.startDate),
          status: 'ENDED',
        },
      });

      // 2. Create new active assignment
      return await tx.employeeShiftAssignment.create({
        data: {
          employeeId: data.employeeId,
          shiftId: data.shiftId || null,
          workScheduleId: data.workScheduleId || null,
          stationId: data.stationId || employee.stationId || null,
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : null,
          status: data.status || 'ACTIVE',
          notes: data.notes || null,
          createdById: session.user.id,
        },
        include: {
          employee: { select: { fullName: true, employeeNumber: true } },
          shift: true,
          workSchedule: true,
        },
      });
    });

    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'ASSIGN_SHIFT',
      module: 'SCHEDULES',
      entityType: 'EmployeeShiftAssignment',
      entityId: newAssignment.id,
      newValue: JSON.stringify(newAssignment),
    });

    return successResponse(newAssignment, 'Employee shift assigned successfully', 201);
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to assign shift', error.status || 500);
  }
}
