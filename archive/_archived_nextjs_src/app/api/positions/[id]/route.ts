import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { positionSchema } from '@/lib/validation';
import { apiError, apiNotFound, apiSuccess, apiValidationError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('positions.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const position = await db.position.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        department: { select: { id: true, name: true, code: true } },
        employees: {
          where: { deletedAt: null, isArchived: false, employmentStatus: 'ACTIVE' },
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            primaryPhone: true,
            employmentStatus: true,
            branch: { select: { name: true } },
            station: { select: { name: true } },
          },
        },
        _count: {
          select: {
            employees: { where: { deletedAt: null, isArchived: false } },
          },
        },
      },
    });

    if (!position) return apiNotFound('Position not found.');

    return apiSuccess(position);
  } catch (error) {
    console.error('Fetch position error:', error);
    return apiError('Failed to fetch position details.');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('positions.edit');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const validation = positionSchema.partial().safeParse(body);

    if (!validation.success) {
      return apiValidationError(validation.error.flatten().fieldErrors);
    }

    const data = validation.data;

    const existing = await db.position.findFirst({
      where: { id: params.id, deletedAt: null },
    });

    if (!existing) return apiNotFound('Position not found.');

    if (data.code && data.code !== existing.code) {
      const dup = await db.position.findUnique({ where: { code: data.code } });
      if (dup && dup.id !== params.id) {
        return apiError(`A position with code "${data.code}" already exists.`, 'DUPLICATE_CODE', 400);
      }
    }

    const updated = await db.position.update({
      where: { id: params.id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
      },
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'UPDATE_POSITION',
      module: 'ORGANIZATION',
      entityType: 'POSITION',
      entityId: updated.id,
      previousValue: { code: existing.code, title: existing.title, isActive: existing.isActive },
      newValue: { code: updated.code, title: updated.title, isActive: updated.isActive },
    });

    return apiSuccess(updated);
  } catch (error) {
    console.error('Update position error:', error);
    return apiError('Failed to update position.');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('positions.archive');
    if ('errorResponse' in auth) return auth.errorResponse;

    const position = await db.position.findFirst({
      where: { id: params.id, deletedAt: null },
    });

    if (!position) return apiNotFound('Position not found.');

    const updated = await db.position.update({
      where: { id: params.id },
      data: { isActive: false, updatedAt: new Date() },
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'DEACTIVATE_POSITION',
      module: 'ORGANIZATION',
      entityType: 'POSITION',
      entityId: position.id,
      previousValue: { isActive: true },
      newValue: { isActive: false },
    });

    return apiSuccess({ message: 'Position deactivated successfully.', position: updated });
  } catch (error) {
    console.error('Deactivate position error:', error);
    return apiError('Failed to deactivate position.');
  }
}
