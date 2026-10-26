import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/auth-helpers';
import { logAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(['overtime.approve', 'attendance.edit']);
    const body = await req.json();

    const { action, comments } = body;
    if (!action || !['APPROVE', 'REJECT', 'CANCEL'].includes(action)) {
      return errorResponse('Action must be APPROVE, REJECT, or CANCEL', 400);
    }

    const existing = await db.overtimeRecord.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return errorResponse('Overtime record not found', 404);
    }

    if (existing.approvalStatus === 'APPROVED' && action === 'APPROVE') {
      return errorResponse('Overtime record is already approved', 400);
    }

    const targetStatus = action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'CANCELLED';
    const now = new Date();

    const updated = await db.overtimeRecord.update({
      where: { id: params.id },
      data: {
        approvalStatus: targetStatus,
        approvedById: targetStatus === 'APPROVED' ? session.user.id : null,
        approvedAt: targetStatus === 'APPROVED' ? now : null,
        ...(comments !== undefined && { comments }),
      },
      include: {
        employee: { select: { fullName: true, employeeNumber: true } },
      },
    });

    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email,
      action: `OVERTIME_${action}`,
      module: 'OVERTIME',
      entityType: 'OvertimeRecord',
      entityId: params.id,
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(updated),
    });

    return successResponse(updated, `Overtime record ${targetStatus.toLowerCase()} successfully`);
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to update overtime status', error.status || 500);
  }
}
