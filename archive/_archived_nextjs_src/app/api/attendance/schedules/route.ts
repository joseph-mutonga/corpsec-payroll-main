import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ScheduleService } from '@/lib/attendance/ScheduleService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const schedules = await ScheduleService.listSchedules();
    return NextResponse.json({ success: true, data: schedules });
  } catch (error: any) {
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

    // Check if assignment request or schedule creation
    if (body.action === 'ASSIGN') {
      const assignment = await ScheduleService.assignEmployeeSchedule({
        ...body,
        assignedById: user.id,
      });
      return NextResponse.json({ success: true, data: assignment }, { status: 201 });
    }

    const schedule = await ScheduleService.createSchedule({
      ...body,
      createdById: user.id,
    });

    return NextResponse.json({ success: true, data: schedule }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
