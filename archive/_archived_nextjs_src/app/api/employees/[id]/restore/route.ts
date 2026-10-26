import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiNotFound, apiSuccess } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('employee.restore');
    if ('errorResponse' in auth) return auth.errorResponse;

    const employee = await db.employee.findFirst({
      where: { id: params.id, deletedAt: null },
    });

    if (!employee) return apiNotFound('Employee not found.');

    const updated = await db.$transaction(async (tx) => {
      const emp = await tx.employee.update({
        where: { id: params.id },
        data: {
          isArchived: false,
          archivedAt: null,
          archivedReason: null,
          employmentStatus: 'ACTIVE',
        },
      });

      await tx.employeeHistory.create({
        data: {
          employeeId: params.id,
          changeType: 'RESTORED',
          description: `Employee ${employee.fullName} restored from archive.`,
          previousValue: JSON.stringify({ isArchived: true }),
          newValue: JSON.stringify({ isArchived: false, status: 'ACTIVE' }),
          performedById: auth.session.userId,
        },
      });

      return emp;
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'RESTORE_EMPLOYEE',
      module: 'EMPLOYEES',
      entityType: 'EMPLOYEE',
      entityId: employee.id,
      previousValue: { isArchived: true },
      newValue: { isArchived: false, status: 'ACTIVE' },
    });

    return apiSuccess({
      message: 'Employee restored from archive successfully.',
      employee: updated,
    });
  } catch (error) {
    console.error('Restore error:', error);
    return apiError('Failed to restore employee.');
  }
}
