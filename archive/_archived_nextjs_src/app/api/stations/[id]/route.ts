import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { stationSchema } from '@/lib/validation';
import { apiError, apiNotFound, apiSuccess, apiValidationError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('stations.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const station = await db.station.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        branch: { select: { id: true, name: true, code: true, location: true } },
        supervisor: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            primaryPhone: true,
            email: true,
          },
        },
        employees: {
          where: { deletedAt: null, isArchived: false, employmentStatus: 'ACTIVE' },
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            primaryPhone: true,
            employmentType: true,
            employmentStatus: true,
            position: { select: { title: true } },
          },
        },
      },
    });

    if (!station) return apiNotFound('Station not found.');

    const currentStaffing = station.employees.length;
    const staffingDifference = station.requiredStaffing - currentStaffing;

    return apiSuccess({
      ...station,
      currentStaffing,
      staffingDifference,
    });
  } catch (error) {
    console.error('Fetch station profile error:', error);
    return apiError('Failed to fetch station profile.');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('stations.edit');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const validation = stationSchema.partial().safeParse(body);

    if (!validation.success) {
      return apiValidationError(validation.error.flatten().fieldErrors);
    }

    const data = validation.data;

    const existing = await db.station.findFirst({
      where: { id: params.id, deletedAt: null },
    });

    if (!existing) return apiNotFound('Station not found.');

    if (data.code && data.code !== existing.code) {
      const dup = await db.station.findUnique({ where: { code: data.code } });
      if (dup && dup.id !== params.id) {
        return apiError(`A station with code "${data.code}" already exists.`, 'DUPLICATE_CODE', 400);
      }
    }

    const updated = await db.station.update({
      where: { id: params.id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        supervisor: {
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
      action: 'UPDATE_STATION',
      module: 'ORGANIZATION',
      entityType: 'STATION',
      entityId: updated.id,
      previousValue: {
        name: existing.name,
        code: existing.code,
        requiredStaffing: existing.requiredStaffing,
      },
      newValue: {
        name: updated.name,
        code: updated.code,
        requiredStaffing: updated.requiredStaffing,
      },
    });

    return apiSuccess(updated);
  } catch (error) {
    console.error('Update station error:', error);
    return apiError('Failed to update station.');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('stations.archive');
    if ('errorResponse' in auth) return auth.errorResponse;

    const station = await db.station.findFirst({
      where: { id: params.id, deletedAt: null },
    });

    if (!station) return apiNotFound('Station not found.');

    const updated = await db.station.update({
      where: { id: params.id },
      data: { isActive: false, updatedAt: new Date() },
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'DEACTIVATE_STATION',
      module: 'ORGANIZATION',
      entityType: 'STATION',
      entityId: station.id,
      previousValue: { isActive: true },
      newValue: { isActive: false },
    });

    return apiSuccess({ message: 'Station deactivated successfully.', station: updated });
  } catch (error) {
    console.error('Deactivate station error:', error);
    return apiError('Failed to deactivate station.');
  }
}
