import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { departmentSchema } from '@/lib/validation';
import { apiError, apiNotFound, apiSuccess, apiValidationError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('departments.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const department = await db.department.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        departmentHead: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            primaryPhone: true,
            email: true,
          },
        },
        positions: {
          where: { deletedAt: null },
          include: {
            _count: {
              select: { employees: { where: { deletedAt: null, isArchived: false, employmentStatus: 'ACTIVE' } } },
            },
          },
        },
        employees: {
          where: { deletedAt: null, isArchived: false },
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            primaryPhone: true,
            employmentStatus: true,
            station: { select: { name: true } },
            branch: { select: { name: true } },
          },
          take: 50,
        },
        _count: {
          select: {
            employees: { where: { deletedAt: null, isArchived: false } },
            positions: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!department) return apiNotFound('Department not found.');

    return apiSuccess(department);
  } catch (error) {
    console.error('Fetch department profile error:', error);
    return apiError('Failed to fetch department details.');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('departments.edit');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const validation = departmentSchema.partial().safeParse(body);

    if (!validation.success) {
      return apiValidationError(validation.error.flatten().fieldErrors);
    }

    const data = validation.data;

    const existing = await db.department.findFirst({
      where: { id: params.id, deletedAt: null },
    });

    if (!existing) return apiNotFound('Department not found.');

    if (data.code && data.code !== existing.code) {
      const dup = await db.department.findUnique({ where: { code: data.code } });
      if (dup && dup.id !== params.id) {
        return apiError(`A department with code "${data.code}" already exists.`, 'DUPLICATE_CODE', 400);
      }
    }

    const updated = await db.department.update({
      where: { id: params.id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        departmentHead: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
          },
        },
      },
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'UPDATE_DEPARTMENT',
      module: 'ORGANIZATION',
      entityType: 'DEPARTMENT',
      entityId: updated.id,
      previousValue: { name: existing.name, code: existing.code, isActive: existing.isActive },
      newValue: { name: updated.name, code: updated.code, isActive: updated.isActive },
    });

    return apiSuccess(updated);
  } catch (error) {
    console.error('Update department error:', error);
    return apiError('Failed to update department.');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('departments.archive');
    if ('errorResponse' in auth) return auth.errorResponse;

    const department = await db.department.findFirst({
      where: { id: params.id, deletedAt: null },
    });

    if (!department) return apiNotFound('Department not found.');

    const updated = await db.department.update({
      where: { id: params.id },
      data: { isActive: false, updatedAt: new Date() },
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'DEACTIVATE_DEPARTMENT',
      module: 'ORGANIZATION',
      entityType: 'DEPARTMENT',
      entityId: department.id,
      previousValue: { isActive: true },
      newValue: { isActive: false },
    });

    return apiSuccess({ message: 'Department deactivated successfully.', department: updated });
  } catch (error) {
    console.error('Deactivate department error:', error);
    return apiError('Failed to deactivate department.');
  }
}
