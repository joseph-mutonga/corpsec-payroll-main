import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/auth-helpers';
import { workScheduleSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(['attendance.view', 'schedule.view']);
    const schedule = await db.workSchedule.findUnique({
      where: { id: params.id },
      include: {
        employeeShiftAssignments: {
          where: { status: 'ACTIVE' },
          include: {
            employee: {
              select: {
                id: true,
                employeeNumber: true,
                fullName: true,
                jobTitle: true,
                station: { select: { name: true } },
                branch: { select: { name: true } },
              },
            },
            shift: true,
          },
        },
      },
    });

    if (!schedule || schedule.deletedAt) {
      return errorResponse('Work schedule not found', 404);
    }

    return successResponse(schedule);
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to fetch schedule', error.status || 500);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(['schedule.edit', 'attendance.edit']);
    const body = await req.json();

    const existing = await db.workSchedule.findUnique({
      where: { id: params.id },
    });
    if (!existing || existing.deletedAt) {
      return errorResponse('Work schedule not found', 404);
    }

    const partialSchema = workScheduleSchema.partial();
    const parsed = partialSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message || 'Validation error', 400);
    }

    const data = parsed.data;

    if (data.code && data.code !== existing.code) {
      const codeTaken = await db.workSchedule.findUnique({ where: { code: data.code } });
      if (codeTaken) {
        return errorResponse(`Schedule code ${data.code} is already in use`, 400);
      }
    }

    const updated = await db.workSchedule.update({
      where: { id: params.id },
      data: {
        ...(data.code && { code: data.code }),
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description || null }),
        ...(data.patternType && { patternType: data.patternType }),
        ...(typeof data.cycleDays === 'number' && { cycleDays: data.cycleDays }),
        ...(data.scheduleConfig !== undefined && { scheduleConfig: data.scheduleConfig || null }),
        ...(typeof data.isActive === 'boolean' && { isActive: data.isActive }),
      },
    });

    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'UPDATE',
      module: 'SCHEDULES',
      entityType: 'WorkSchedule',
      entityId: params.id,
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(updated),
    });

    return successResponse(updated, 'Work schedule updated successfully');
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to update schedule', error.status || 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(['schedule.edit', 'attendance.delete']);

    const existing = await db.workSchedule.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: {
            employeeShiftAssignments: { where: { status: 'ACTIVE' } },
          },
        },
      },
    });

    if (!existing || existing.deletedAt) {
      return errorResponse('Work schedule not found', 404);
    }

    if (existing._count.employeeShiftAssignments > 0) {
      return errorResponse(
        `Cannot deactivate schedule because ${existing._count.employeeShiftAssignments} active employees are assigned to it. Reassign employees first.`,
        400
      );
    }

    const updated = await db.workSchedule.update({
      where: { id: params.id },
      data: { isActive: false, deletedAt: new Date() },
    });

    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'ARCHIVE',
      module: 'SCHEDULES',
      entityType: 'WorkSchedule',
      entityId: params.id,
    });

    return successResponse(updated, 'Work schedule deactivated successfully');
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to deactivate schedule', error.status || 500);
  }
}
