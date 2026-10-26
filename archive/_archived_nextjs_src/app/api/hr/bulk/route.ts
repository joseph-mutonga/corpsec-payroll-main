import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth('hr.bulk.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const { employeeIds, action, targetId, targetStatus, reason } = body;

    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return apiBadRequest('employeeIds array is required and must not be empty');
    }

    let updatedCount = 0;

    await db.$transaction(async (tx) => {
      for (const empId of employeeIds) {
        const current = await tx.employee.findUnique({ where: { id: empId } });
        if (!current) continue;

        const updateData: Record<string, any> = {};
        let changeType = 'BULK_UPDATE';

        if (action === 'ASSIGN_DEPARTMENT' && targetId) {
          updateData.departmentId = targetId;
          changeType = 'DEPARTMENT_TRANSFER';
        } else if (action === 'ASSIGN_STATION' && targetId) {
          updateData.stationId = targetId;
          changeType = 'STATION_TRANSFER';
        } else if (action === 'ASSIGN_SUPERVISOR' && targetId) {
          updateData.supervisorId = targetId;
          changeType = 'SUPERVISOR_CHANGE';
        } else if (action === 'CHANGE_STATUS' && targetStatus) {
          updateData.employmentStatus = targetStatus;
          changeType = 'STATUS_CHANGE';
        }

        if (Object.keys(updateData).length > 0) {
          await tx.employee.update({
            where: { id: empId },
            data: updateData,
          });

          await tx.employeeHistory.create({
            data: {
              employeeId: empId,
              changeType,
              description: `Bulk action: ${action}. Reason: ${reason || 'Administrative bulk update'}`,
              previousValue: JSON.stringify({ current: (current as any)[Object.keys(updateData)[0]] }),
              newValue: JSON.stringify(updateData),
              performedById: auth.session.userId,
            },
          });

          updatedCount++;
        }
      }
    });

    await createAuditLog({
      userId: auth.session.userId,
      action: 'BULK_HR_ACTION',
      module: 'EMPLOYEES',
      newValue: { action, updatedCount },
    });

    return apiSuccess({ success: true, updatedCount });
  } catch (error: any) {
    console.error('Error executing bulk HR action:', error);
    return apiError(error.message || 'Failed to execute bulk HR action');
  }
}
