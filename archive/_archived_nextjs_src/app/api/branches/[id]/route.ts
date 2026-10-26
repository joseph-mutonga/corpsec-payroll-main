import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { branchSchema } from '@/lib/validation';
import { apiError, apiNotFound, apiSuccess, apiValidationError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('branches.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const branch = await db.branch.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        branchManager: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            primaryPhone: true,
            email: true,
          },
        },
        departments: {
          where: { deletedAt: null },
          select: { id: true, code: true, name: true, isActive: true },
        },
        stations: {
          where: { deletedAt: null },
          select: {
            id: true,
            code: true,
            name: true,
            clientLocationName: true,
            requiredStaffing: true,
            isActive: true,
            _count: {
              select: {
                employees: { where: { deletedAt: null, isArchived: false, employmentStatus: 'ACTIVE' } },
              },
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
            department: { select: { name: true } },
          },
          take: 50,
        },
        _count: {
          select: {
            employees: { where: { deletedAt: null, isArchived: false } },
            stations: { where: { deletedAt: null } },
            departments: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!branch) return apiNotFound('Branch not found.');

    return apiSuccess(branch);
  } catch (error) {
    console.error('Fetch branch profile error:', error);
    return apiError('Failed to fetch branch profile.');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('branches.edit');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const validation = branchSchema.partial().safeParse(body);

    if (!validation.success) {
      return apiValidationError(validation.error.flatten().fieldErrors);
    }

    const data = validation.data;

    const existing = await db.branch.findFirst({
      where: { id: params.id, deletedAt: null },
    });

    if (!existing) return apiNotFound('Branch not found.');

    if (data.code && data.code !== existing.code) {
      const dup = await db.branch.findUnique({ where: { code: data.code } });
      if (dup && dup.id !== params.id) {
        return apiError(`A branch with code "${data.code}" already exists.`, 'DUPLICATE_CODE', 400);
      }
    }

    const updated = await db.branch.update({
      where: { id: params.id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        branchManager: {
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
      action: 'UPDATE_BRANCH',
      module: 'ORGANIZATION',
      entityType: 'BRANCH',
      entityId: updated.id,
      previousValue: { name: existing.name, code: existing.code, isActive: existing.isActive },
      newValue: { name: updated.name, code: updated.code, isActive: updated.isActive },
    });

    return apiSuccess(updated);
  } catch (error) {
    console.error('Update branch error:', error);
    return apiError('Failed to update branch.');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('branches.archive');
    if ('errorResponse' in auth) return auth.errorResponse;

    const branch = await db.branch.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        _count: { select: { employees: true } },
      },
    });

    if (!branch) return apiNotFound('Branch not found.');

    // Deactivate rather than hard delete to preserve historical integrity
    const updated = await db.branch.update({
      where: { id: params.id },
      data: { isActive: false, updatedAt: new Date() },
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'DEACTIVATE_BRANCH',
      module: 'ORGANIZATION',
      entityType: 'BRANCH',
      entityId: branch.id,
      previousValue: { isActive: true },
      newValue: { isActive: false },
    });

    return apiSuccess({ message: 'Branch deactivated successfully.', branch: updated });
  } catch (error) {
    console.error('Deactivate branch error:', error);
    return apiError('Failed to deactivate branch.');
  }
}
