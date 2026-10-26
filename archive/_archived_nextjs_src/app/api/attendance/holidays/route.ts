import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/auth-helpers';
import { publicHolidaySchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(['attendance.view', 'holiday.view']);
    const { searchParams } = new URL(req.url);

    const year = searchParams.get('year');
    const where: any = { deletedAt: null };

    if (year) {
      const y = parseInt(year, 10);
      where.date = {
        gte: new Date(y, 0, 1),
        lte: new Date(y, 11, 31, 23, 59, 59, 999),
      };
    }

    const holidays = await db.publicHoliday.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    return successResponse(holidays);
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to fetch public holidays', error.status || 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(['holiday.create', 'attendance.edit']);
    const body = await req.json();

    const parsed = publicHolidaySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message || 'Validation error', 400);
    }

    const data = parsed.data;
    const holidayDate = new Date(data.date);
    holidayDate.setHours(0, 0, 0, 0);

    const newHoliday = await db.publicHoliday.create({
      data: {
        name: data.name,
        date: holidayDate,
        country: data.country || 'Kenya',
        description: data.description || null,
        isActive: data.isActive,
      },
    });

    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'CREATE',
      module: 'HOLIDAYS',
      entityType: 'PublicHoliday',
      entityId: newHoliday.id,
      newValue: JSON.stringify(newHoliday),
    });

    return successResponse(newHoliday, 'Public holiday added successfully', 201);
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to add public holiday', error.status || 500);
  }
}
