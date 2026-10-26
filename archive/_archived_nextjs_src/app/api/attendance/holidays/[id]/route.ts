import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/auth-helpers';
import { publicHolidaySchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(['holiday.edit', 'attendance.edit']);
    const body = await req.json();

    const existing = await db.publicHoliday.findUnique({
      where: { id: params.id },
    });
    if (!existing || existing.deletedAt) {
      return errorResponse('Public holiday not found', 404);
    }

    const partialSchema = publicHolidaySchema.partial();
    const parsed = partialSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message || 'Validation error', 400);
    }

    const data = parsed.data;

    const updated = await db.publicHoliday.update({
      where: { id: params.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.date && { date: new Date(data.date) }),
        ...(data.country && { country: data.country }),
        ...(data.description !== undefined && { description: data.description || null }),
        ...(typeof data.isActive === 'boolean' && { isActive: data.isActive }),
      },
    });

    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'UPDATE',
      module: 'HOLIDAYS',
      entityType: 'PublicHoliday',
      entityId: params.id,
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(updated),
    });

    return successResponse(updated, 'Public holiday updated successfully');
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to update public holiday', error.status || 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(['holiday.delete', 'attendance.delete']);

    const existing = await db.publicHoliday.findUnique({
      where: { id: params.id },
    });
    if (!existing || existing.deletedAt) {
      return errorResponse('Public holiday not found', 404);
    }

    const updated = await db.publicHoliday.update({
      where: { id: params.id },
      data: { isActive: false, deletedAt: new Date() },
    });

    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'DELETE',
      module: 'HOLIDAYS',
      entityType: 'PublicHoliday',
      entityId: params.id,
    });

    return successResponse(updated, 'Public holiday removed successfully');
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to delete public holiday', error.status || 500);
  }
}
