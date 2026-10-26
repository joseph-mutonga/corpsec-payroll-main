import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : undefined;
    const branchId = searchParams.get('branchId') || undefined;

    const where: any = { deletedAt: null };
    if (year) {
      where.date = {
        gte: new Date(year, 0, 1),
        lte: new Date(year, 11, 31, 23, 59, 59, 999),
      };
    }
    if (branchId && branchId !== 'ALL') {
      where.OR = [{ branchId: null }, { branchId }];
    }

    const holidays = await db.publicHoliday.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    return NextResponse.json({ success: true, data: { holidays } });
  } catch (error: any) {
    console.error('Error listing public holidays:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient privileges.' }, { status: 403 });
    }

    const body = await req.json();
    if (!body.name || !body.date) {
      return NextResponse.json({ success: false, error: 'Holiday name and date are required.' }, { status: 400 });
    }

    const date = new Date(body.date);
    date.setHours(0, 0, 0, 0);

    // Prevent duplicate holiday on the exact same date and scope
    const existing = await db.publicHoliday.findFirst({
      where: {
        date,
        branchId: body.branchId || null,
        deletedAt: null,
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: `A public holiday (${existing.name}) is already configured on ${date.toISOString().split('T')[0]}.` },
        { status: 400 }
      );
    }

    const holiday = await db.publicHoliday.create({
      data: {
        name: body.name.trim(),
        date,
        year: date.getFullYear(),
        country: body.country || 'Kenya',
        branchId: body.branchId || null,
        stationId: body.stationId || null,
        description: body.description,
        isActive: body.isActive ?? true,
      },
    });

    await AuditService.log({
      userId: user.id,
      action: 'CREATE_PUBLIC_HOLIDAY',
      module: 'LEAVE',
      entityId: holiday.id,
      newValue: { name: holiday.name, date: holiday.date },
    });

    return NextResponse.json({ success: true, data: { holiday } }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating public holiday:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
