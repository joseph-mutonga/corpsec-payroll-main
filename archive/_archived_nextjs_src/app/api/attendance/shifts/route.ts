import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ShiftService } from '@/lib/attendance/ShiftService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const shiftType = searchParams.get('shiftType') || undefined;

    const shifts = await ShiftService.listShifts({ status, shiftType });

    return NextResponse.json({
      success: true,
      data: shifts,
    });
  } catch (error: any) {
    console.error('Error listing shifts:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const shift = await ShiftService.createShift({
      ...body,
      createdById: user.id,
    });

    return NextResponse.json({
      success: true,
      data: shift,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating shift:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
