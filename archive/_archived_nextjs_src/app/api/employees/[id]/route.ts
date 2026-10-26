import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { hasPermission, requirePermission } from '@/lib/permissions';
import { updateEmployeeSchema } from '@/lib/validation';
import { sanitizeEmployeeForView } from '@/lib/employee-utils';
import { apiError, apiNotFound, apiSuccess, apiValidationError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('employee.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const employee = await db.employee.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        department: true,
        branch: true,
        station: true,
        position: true,
        supervisor: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
          },
        },
        assignments: {
          orderBy: { startDate: 'desc' },
          include: {
            branch: { select: { id: true, code: true, name: true } },
            department: { select: { id: true, code: true, name: true } },
            station: { select: { id: true, code: true, name: true } },
            position: { select: { id: true, code: true, title: true } },
            supervisor: { select: { id: true, employeeNumber: true, fullName: true, jobTitle: true } },
          },
        },
        nextOfKin: true,
        emergencyContacts: true,
        onboardingCase: {
          include: { tasks: { orderBy: { order: 'asc' } } },
        },
        offboardingCase: {
          include: { tasks: { orderBy: { order: 'asc' } } },
        },
        salaryRecords: {
          orderBy: { effectiveFrom: 'desc' },
          include: {
            proposedBy: { select: { firstName: true, lastName: true } },
            approvedBy: { select: { firstName: true, lastName: true } },
          },
        },
        allowanceAssignments: {
          include: { allowanceType: true },
        },
        deductionAssignments: {
          include: { deductionType: true },
        },
        attendanceRecords: {
          take: 30,
          orderBy: { date: 'desc' },
          include: { scheduledShift: true },
        },
        leaveEntitlements: {
          include: { leaveType: true },
        },
        leaveRequests: {
          orderBy: { createdAt: 'desc' },
          include: { leaveType: true },
        },
        payrollEmployeeRecords: {
          orderBy: { createdAt: 'desc' },
          include: { payrollRun: { select: { runNumber: true, status: true, payrollPeriod: { select: { name: true } } } } },
        },
        paymentTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        hrRequests: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        documents: {
          include: {
            uploadedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        history: {
          include: {
            performedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!employee) {
      return apiNotFound('Employee record not found.');
    }

    const canViewSensitive = hasPermission(auth.session, 'employee.view_sensitive');
    const sanitized = sanitizeEmployeeForView(employee, canViewSensitive);

    return apiSuccess({
      ...sanitized,
      canViewSensitive,
    });
  } catch (error) {
    console.error('Get employee error:', error);
    return apiError('Failed to fetch employee profile.');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('employee.edit');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const validation = updateEmployeeSchema.safeParse(body);

    if (!validation.success) {
      return apiValidationError(validation.error.flatten().fieldErrors);
    }

    const data = validation.data;

    const existing = await db.employee.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        department: true,
        branch: true,
        station: true,
        position: true,
      },
    });

    if (!existing) {
      return apiNotFound('Employee not found.');
    }

    // Integrity Check: Prevent self-supervision
    if (data.supervisorId && data.supervisorId === params.id) {
      return apiError('An employee cannot supervise themselves.', 'INVALID_SUPERVISOR', 400);
    }

    // Check permissions if sensitive fields are being updated
    const isUpdatingSensitive =
      data.bankAccountNumber !== undefined ||
      data.bankName !== undefined ||
      data.mpesaPhoneNumber !== undefined ||
      data.kraPin !== undefined ||
      data.nssfNumber !== undefined ||
      data.shaNumber !== undefined;

    if (isUpdatingSensitive && !hasPermission(auth.session, 'employee.edit_sensitive')) {
      return apiError(
        'Access denied: Modifying payment or statutory records requires [employee.edit_sensitive] permission.',
        'FORBIDDEN',
        403
      );
    }

    // Check national ID uniqueness if changing
    if (data.nationalId && data.nationalId !== existing.nationalId) {
      const dup = await db.employee.findUnique({ where: { nationalId: data.nationalId } });
      if (dup && dup.id !== params.id) {
        return apiError(`National ID "${data.nationalId}" is already assigned to another employee.`, 'DUPLICATE_ID', 400);
      }
    }

    // Compute fullName if names are updated
    const firstName = data.firstName ?? existing.firstName;
    const middleName = data.middleName !== undefined ? data.middleName : existing.middleName;
    const lastName = data.lastName ?? existing.lastName;
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');

    const updatePayload: any = {
      ...data,
      fullName,
      updatedAt: new Date(),
    };

    if (data.dateOfBirth) updatePayload.dateOfBirth = new Date(data.dateOfBirth);
    if (data.employmentDate) updatePayload.employmentDate = new Date(data.employmentDate);
    if (data.contractStartDate) updatePayload.contractStartDate = new Date(data.contractStartDate);
    if (data.contractEndDate) updatePayload.contractEndDate = new Date(data.contractEndDate);

    delete updatePayload.nextOfKin;
    delete updatePayload.emergencyContacts;

    const previousValue = {
      jobTitle: existing.jobTitle,
      departmentId: existing.departmentId,
      branchId: existing.branchId,
      stationId: existing.stationId,
      positionId: existing.positionId,
      employmentStatus: existing.employmentStatus,
    };

    const updated = await db.$transaction(async (tx) => {
      const emp = await tx.employee.update({
        where: { id: params.id },
        data: updatePayload,
      });

      // Update Next of Kin if provided
      if (data.nextOfKin) {
        await tx.nextOfKin.deleteMany({ where: { employeeId: params.id } });
        for (const nok of data.nextOfKin) {
          await tx.nextOfKin.create({
            data: {
              employeeId: params.id,
              fullName: nok.fullName,
              relationship: nok.relationship,
              primaryPhone: nok.primaryPhone,
              alternativePhone: nok.alternativePhone || null,
              email: nok.email || null,
              physicalAddress: nok.physicalAddress || null,
              percentageShare: nok.percentageShare ?? 100,
              isPrimary: nok.isPrimary ?? true,
            },
          });
        }
      }

      // Update Emergency Contacts if provided
      if (data.emergencyContacts) {
        await tx.emergencyContact.deleteMany({ where: { employeeId: params.id } });
        for (const ec of data.emergencyContacts) {
          await tx.emergencyContact.create({
            data: {
              employeeId: params.id,
              fullName: ec.fullName,
              relationship: ec.relationship,
              primaryPhone: ec.primaryPhone,
              alternativePhone: ec.alternativePhone || null,
              physicalAddress: ec.physicalAddress || null,
            },
          });
        }
      }

      // Record Career Timeline change if title/department/station/position changed
      const changes: string[] = [];
      if (data.jobTitle && data.jobTitle !== existing.jobTitle) {
        changes.push(`Job title changed to "${data.jobTitle}"`);
      }
      if (data.departmentId && data.departmentId !== existing.departmentId) {
        changes.push(`Department updated`);
      }
      if (data.stationId && data.stationId !== existing.stationId) {
        changes.push(`Station assignment updated`);
      }
      if (data.positionId && data.positionId !== existing.positionId) {
        changes.push(`Job position updated`);
      }
      if (isUpdatingSensitive) {
        changes.push(`Payment or statutory details updated`);
      }

      if (changes.length > 0) {
        await tx.employeeHistory.create({
          data: {
            employeeId: params.id,
            changeType: isUpdatingSensitive ? 'PAYMENT_INFO_CHANGE' : 'CAREER_UPDATE',
            description: changes.join('; '),
            previousValue: JSON.stringify(previousValue),
            newValue: JSON.stringify({
              jobTitle: emp.jobTitle,
              departmentId: emp.departmentId,
              branchId: emp.branchId,
              stationId: emp.stationId,
              positionId: emp.positionId,
            }),
            performedById: auth.session.userId,
          },
        });
      }

      return emp;
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'UPDATE_EMPLOYEE',
      module: 'EMPLOYEES',
      entityType: 'EMPLOYEE',
      entityId: updated.id,
      previousValue,
      newValue: {
        fullName: updated.fullName,
        jobTitle: updated.jobTitle,
        departmentId: updated.departmentId,
        stationId: updated.stationId,
      },
    });

    return apiSuccess(updated);
  } catch (error) {
    console.error('Update employee error:', error);
    return apiError('Failed to update employee record.');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('employee.archive');
    if ('errorResponse' in auth) return auth.errorResponse;

    const employee = await db.employee.findFirst({
      where: { id: params.id, deletedAt: null },
    });

    if (!employee) return apiNotFound('Employee not found.');

    const archived = await db.employee.update({
      where: { id: params.id },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        archivedReason: 'Archived by Administrator',
        employmentStatus: 'INACTIVE',
      },
    });

    await db.employeeHistory.create({
      data: {
        employeeId: params.id,
        changeType: 'ARCHIVED',
        description: `Employee ${employee.fullName} (${employee.employeeNumber}) archived.`,
        performedById: auth.session.userId,
      },
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'ARCHIVE_EMPLOYEE',
      module: 'EMPLOYEES',
      entityType: 'EMPLOYEE',
      entityId: employee.id,
      previousValue: { status: employee.employmentStatus, isArchived: employee.isArchived },
      newValue: { status: 'INACTIVE', isArchived: true },
    });

    return apiSuccess({ message: 'Employee archived successfully.', employee: archived });
  } catch (error) {
    console.error('Archive employee error:', error);
    return apiError('Failed to archive employee.');
  }
}
