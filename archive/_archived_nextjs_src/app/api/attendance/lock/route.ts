import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/auth-helpers';
import { attendanceLockSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(['attendance.lock']);
    const body = await req.json();

    const parsed = attendanceLockSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message || 'Validation error', 400);
    }

    const { year, month, stationId, branchId, reason } = parsed.data;

    // Calculate month boundary
    const startDate = new Date(year, month - 1, 1, 0, 0, 0);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const where: any = {
      date: {
        gte: startDate,
        lte: endDate,
      },
      approvalStatus: 'APPROVED', // Only approved records are locked
    };

    if (stationId || branchId) {
      where.employee = { deletedAt: null };
      if (stationId) where.employee.stationId = stationId;
      if (branchId) where.employee.branchId = branchId;
    }

    const now = new Date();
    const result = await db.attendanceRecord.updateMany({
      where,
      data: {
        approvalStatus: 'LOCKED',
        lockedById: session.user.id,
        lockedAt: now,
      },
    });

    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'LOCK_ATTENDANCE_PERIOD',
      module: 'ATTENDANCE',
      entityType: 'AttendanceRecord',
      newValue: JSON.stringify({
        period: `${year}-${String(month).padStart(2, '0')}`,
        lockedCount: result.count,
        reason,
        stationId: stationId || 'ALL',
        branchId: branchId || 'ALL',
      }),
    });

    return successResponse(
      {
        lockedCount: result.count,
        period: `${year}-${String(month).padStart(2, '0')}`,
      },
      `Successfully locked ${result.count} approved attendance records for ${year}-${String(month).padStart(2, '0')}.`
    );
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to lock attendance period', error.status || 500);
  }
}
