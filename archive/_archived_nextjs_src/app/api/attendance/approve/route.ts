import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/auth-helpers';
import { attendanceApprovalSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(['attendance.approve']);
    const body = await req.json();

    const parsed = attendanceApprovalSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message || 'Validation error', 400);
    }

    const { recordIds, action, notes } = parsed.data;

    const targetStatus = action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'UNDER_REVIEW';

    const records = await db.attendanceRecord.findMany({
      where: { id: { in: recordIds } },
    });

    const lockedCount = records.filter((r) => r.approvalStatus === 'LOCKED').length;
    if (lockedCount > 0) {
      return errorResponse(`Cannot modify ${lockedCount} record(s) because they are already LOCKED for payroll.`, 400);
    }

    const now = new Date();
    const updateResult = await db.attendanceRecord.updateMany({
      where: {
        id: { in: recordIds },
        approvalStatus: { not: 'LOCKED' },
      },
      data: {
        approvalStatus: targetStatus,
        approvedById: targetStatus === 'APPROVED' ? session.user.id : null,
        approvedAt: targetStatus === 'APPROVED' ? now : null,
        ...(notes && { notes }),
      },
    });

    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email,
      action: `ATTENDANCE_${action}`,
      module: 'ATTENDANCE',
      entityType: 'AttendanceRecord',
      newValue: JSON.stringify({
        recordIds,
        action,
        updatedCount: updateResult.count,
        timestamp: now,
      }),
    });

    return successResponse(
      { updatedCount: updateResult.count, status: targetStatus },
      `Successfully ${action.toLowerCase()}d ${updateResult.count} attendance record(s)`
    );
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to process attendance approval', error.status || 500);
  }
}
