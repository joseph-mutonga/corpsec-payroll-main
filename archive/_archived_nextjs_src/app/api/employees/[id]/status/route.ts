import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { changeEmployeeStatusSchema } from '@/lib/validation';
import { apiError, apiNotFound, apiSuccess, apiValidationError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('employee.edit');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const validation = changeEmployeeStatusSchema.safeParse(body);

    if (!validation.success) {
      return apiValidationError(validation.error.flatten().fieldErrors);
    }

    const { status, reason } = validation.data;

    const employee = await db.employee.findFirst({
      where: { id: params.id, deletedAt: null },
    });

    if (!employee) return apiNotFound('Employee not found.');

    const oldStatus = employee.employmentStatus;

    const updated = await db.$transaction(async (tx) => {
      const emp = await tx.employee.update({
        where: { id: params.id },
        data: {
          employmentStatus: status,
          updatedAt: new Date(),
        },
      });

      await tx.employeeHistory.create({
        data: {
          employeeId: params.id,
          changeType: 'STATUS_CHANGE',
          description: `Employment status changed from ${oldStatus} to ${status}. Reason: ${reason}`,
          previousValue: JSON.stringify({ status: oldStatus }),
          newValue: JSON.stringify({ status, reason }),
          performedById: auth.session.userId,
        },
      });

      return emp;
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'CHANGE_EMPLOYEE_STATUS',
      module: 'EMPLOYEES',
      entityType: 'EMPLOYEE',
      entityId: employee.id,
      previousValue: { status: oldStatus },
      newValue: { status, reason },
    });

    return apiSuccess({
      message: `Employee status changed to ${status}.`,
      employee: updated,
    });
  } catch (error) {
    console.error('Change status error:', error);
    return apiError('Failed to change employee status.');
  }
}
