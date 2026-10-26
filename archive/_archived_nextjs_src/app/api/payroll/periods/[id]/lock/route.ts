import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['payroll_period.lock', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const period = await db.payrollPeriod.findUnique({
      where: { id: params.id },
    });

    if (!period) {
      return apiError('Payroll period not found', 404);
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || (period.status === 'LOCKED' ? 'UNLOCK' : 'LOCK');

    let newStatus = 'LOCKED';
    let lockedById: string | null = auth.user.id;
    let lockedAt: Date | null = new Date();

    if (action === 'UNLOCK') {
      newStatus = 'OPEN';
      lockedById = null;
      lockedAt = null;
    } else if (action === 'CLOSE') {
      newStatus = 'CLOSED';
    }

    const updated = await db.payrollPeriod.update({
      where: { id: params.id },
      data: {
        status: newStatus,
        lockedById,
        lockedAt,
      },
      include: {
        lockedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: action === 'UNLOCK' ? 'UNLOCK' : 'LOCK',
        module: 'PAYROLL',
        entityType: 'PAYROLL_PERIOD',
        entityId: updated.id,
        newValue: JSON.stringify({ status: newStatus, action }),
      },
    });

    return apiSuccess(
      updated,
      `Payroll period status updated to ${newStatus}`
    );
  } catch (error) {
    console.error('Lock/Unlock payroll period error:', error);
    return apiError('Failed to change period lock status');
  }
}
