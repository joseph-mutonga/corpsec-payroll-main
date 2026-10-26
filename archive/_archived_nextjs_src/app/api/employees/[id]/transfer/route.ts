import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { employeeTransferSchema } from '@/lib/validation';
import { apiError, apiNotFound, apiSuccess, apiValidationError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('assignment.transfer');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const validation = employeeTransferSchema.safeParse(body);

    if (!validation.success) {
      return apiValidationError(validation.error.flatten().fieldErrors);
    }

    const {
      branchId,
      departmentId,
      stationId,
      positionId,
      jobTitle: overrideJobTitle,
      supervisorId,
      effectiveDate,
      reason,
    } = validation.data;

    // Verify employee exists and is not archived
    const employee = await db.employee.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        branch: true,
        department: true,
        station: true,
        position: true,
        supervisor: true,
      },
    });

    if (!employee) return apiNotFound('Employee record not found.');

    // Integrity Check: Prevent self-supervision
    if (supervisorId && supervisorId === employee.id) {
      return apiError('Validation error: An employee cannot be assigned to supervise themselves.', 'INVALID_SUPERVISOR', 400);
    }

    // Verify Target Branch is active
    const targetBranch = await db.branch.findFirst({
      where: { id: branchId, deletedAt: null, isActive: true },
    });
    if (!targetBranch) {
      return apiError('Target branch does not exist or is currently inactive.', 'INVALID_BRANCH', 400);
    }

    // Verify Target Department is active
    const targetDept = await db.department.findFirst({
      where: { id: departmentId, deletedAt: null, isActive: true },
    });
    if (!targetDept) {
      return apiError('Target department does not exist or is currently inactive.', 'INVALID_DEPARTMENT', 400);
    }

    // Verify Station if provided
    let targetStation: any = null;
    if (stationId) {
      targetStation = await db.station.findFirst({
        where: { id: stationId, deletedAt: null, isActive: true },
      });
      if (!targetStation) {
        return apiError('Target guarding station does not exist or is currently inactive.', 'INVALID_STATION', 400);
      }
      if (targetStation.branchId !== branchId) {
        return apiError(`Guarding station "${targetStation.name}" does not belong to the selected branch.`, 'STATION_BRANCH_MISMATCH', 400);
      }
    }

    // Verify Position if provided
    let targetPosition: any = null;
    let computedJobTitle = employee.jobTitle;

    if (positionId) {
      targetPosition = await db.position.findFirst({
        where: { id: positionId, deletedAt: null, isActive: true },
      });
      if (!targetPosition) {
        return apiError('Target position does not exist or is currently inactive.', 'INVALID_POSITION', 400);
      }
      computedJobTitle = targetPosition.title;
    }

    if (overrideJobTitle) {
      computedJobTitle = overrideJobTitle;
    }

    const transferDate = new Date(effectiveDate);

    const previousAssignmentSummary = {
      branch: employee.branch?.name || 'Unassigned',
      department: employee.department?.name || 'Unassigned',
      station: employee.station?.name || 'No Station',
      position: employee.position?.title || employee.jobTitle,
      supervisor: employee.supervisor?.fullName || 'None',
    };

    const newAssignmentSummary = {
      branch: targetBranch.name,
      department: targetDept.name,
      station: targetStation?.name || 'No Station',
      position: computedJobTitle,
      supervisorId: supervisorId || null,
      effectiveDate,
      reason,
    };

    const result = await db.$transaction(async (tx) => {
      // 1. Close current active assignment
      await tx.employeeAssignment.updateMany({
        where: {
          employeeId: params.id,
          status: 'ACTIVE',
        },
        data: {
          endDate: transferDate,
          status: 'TRANSFERRED',
        },
      });

      // 2. Create new active assignment
      const newAssignment = await tx.employeeAssignment.create({
        data: {
          employeeId: params.id,
          branchId,
          departmentId,
          stationId: stationId || null,
          positionId: positionId || null,
          jobTitle: computedJobTitle,
          supervisorId: supervisorId || null,
          startDate: transferDate,
          status: 'ACTIVE',
          reason,
          createdById: auth.session.userId,
        },
        include: {
          branch: true,
          department: true,
          station: true,
          position: true,
          supervisor: {
            select: { id: true, employeeNumber: true, fullName: true, jobTitle: true },
          },
        },
      });

      // 3. Update employee record pointers
      const updatedEmployee = await tx.employee.update({
        where: { id: params.id },
        data: {
          branchId,
          departmentId,
          stationId: stationId || null,
          positionId: positionId || null,
          jobTitle: computedJobTitle,
          supervisorId: supervisorId || null,
          updatedAt: new Date(),
        },
        include: {
          branch: true,
          department: true,
          station: true,
          position: true,
          supervisor: true,
        },
      });

      // 4. Record career timeline history
      await tx.employeeHistory.create({
        data: {
          employeeId: params.id,
          changeType: 'ASSIGNMENT_TRANSFER',
          description: `Transferred to ${targetBranch.name} / ${targetStation?.name || 'HQ Deployment'} (${computedJobTitle}). Reason: ${reason}`,
          previousValue: JSON.stringify(previousAssignmentSummary),
          newValue: JSON.stringify(newAssignmentSummary),
          performedById: auth.session.userId,
        },
      });

      return { newAssignment, updatedEmployee };
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'TRANSFER_EMPLOYEE',
      module: 'ASSIGNMENTS',
      entityType: 'EMPLOYEE_ASSIGNMENT',
      entityId: result.newAssignment.id,
      previousValue: previousAssignmentSummary,
      newValue: newAssignmentSummary,
    });

    return apiSuccess({
      message: `Employee successfully transferred to ${targetBranch.name}.`,
      assignment: result.newAssignment,
      employee: result.updatedEmployee,
    });
  } catch (error) {
    console.error('Employee transfer error:', error);
    return apiError('Failed to execute employee transfer workflow.');
  }
}
