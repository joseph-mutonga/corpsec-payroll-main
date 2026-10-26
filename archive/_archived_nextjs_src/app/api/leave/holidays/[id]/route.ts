import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const holiday = await db.publicHoliday.findUnique({ where: { id: params.id } });
    if (!holiday || holiday.deletedAt) {
      return NextResponse.json({ success: false, error: 'Public holiday not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { holiday } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient privileges.' }, { status: 403 });
    }

    const body = await req.json();
    const updated = await db.publicHoliday.update({
      where: { id: params.id },
      data: {
        name: body.name !== undefined ? body.name.trim() : undefined,
        date: body.date ? new Date(body.date) : undefined,
        year: body.date ? new Date(body.date).getFullYear() : undefined,
        description: body.description !== undefined ? body.description : undefined,
        isActive: body.isActive !== undefined ? body.isActive : undefined,
      },
    });

    await AuditService.log({
      userId: user.id,
      action: 'UPDATE_PUBLIC_HOLIDAY',
      module: 'LEAVE',
      entityId: params.id,
      newValue: { name: updated.name, date: updated.date },
    });

    return NextResponse.json({ success: true, data: { holiday: updated } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient privileges.' }, { status: 403 });
    }

    await db.publicHoliday.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await AuditService.log({
      userId: user.id,
      action: 'DELETE_PUBLIC_HOLIDAY',
      module: 'LEAVE',
      entityId: params.id,
    });

    return NextResponse.json({ success: true, message: 'Public holiday deleted successfully.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
