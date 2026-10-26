import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { archiveEmployeeSchema } from '@/lib/validation';
import { apiError, apiNotFound, apiSuccess, apiValidationError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('employee.archive');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const validation = archiveEmployeeSchema.safeParse(body);

    if (!validation.success) {
      return apiValidationError(validation.error.flatten().fieldErrors);
    }

    const { reason } = validation.data;

    const employee = await db.employee.findFirst({
      where: { id: params.id, deletedAt: null },
    });

    if (!employee) return apiNotFound('Employee not found.');

    const updated = await db.$transaction(async (tx) => {
      const emp = await tx.employee.update({
        where: { id: params.id },
        data: {
          isArchived: true,
          archivedAt: new Date(),
          archivedReason: reason,
          employmentStatus: 'INACTIVE',
        },
      });

      await tx.employeeHistory.create({
        data: {
          employeeId: params.id,
          changeType: 'ARCHIVED',
          description: `Employee archived. Reason: ${reason}`,
          previousValue: JSON.stringify({ isArchived: false, status: employee.employmentStatus }),
          newValue: JSON.stringify({ isArchived: true, reason }),
          performedById: auth.session.userId,
        },
      });

      return emp;
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'ARCHIVE_EMPLOYEE',
      module: 'EMPLOYEES',
      entityType: 'EMPLOYEE',
      entityId: employee.id,
      previousValue: { isArchived: false, status: employee.employmentStatus },
      newValue: { isArchived: true, reason },
    });

    return apiSuccess({
      message: 'Employee archived successfully.',
      employee: updated,
    });
  } catch (error) {
    console.error('Archive error:', error);
    return apiError('Failed to archive employee.');
  }
}
