import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { TimesheetService } from '@/lib/attendance/TimesheetService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId') || undefined;
    const status = searchParams.get('status') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;

    const timesheets = await TimesheetService.listTimesheets({
      employeeId,
      status,
      departmentId,
    });

    return NextResponse.json({
      success: true,
      data: timesheets,
    });
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
    const timesheet = await TimesheetService.generateTimesheet(
      body.employeeId || user.employeeId,
      body.startDate,
      body.endDate,
      user.id
    );

    return NextResponse.json({
      success: true,
      data: timesheet,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
