import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { LeaveCalendarService } from '@/lib/leave/LeaveCalendarService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;
    const branchId = searchParams.get('branchId') || undefined;
    const stationId = searchParams.get('stationId') || undefined;
    const leaveTypeId = searchParams.get('leaveTypeId') || undefined;
    const employeeId = searchParams.get('employeeId') || undefined;
    const status = searchParams.get('status') || undefined;

    const events = await LeaveCalendarService.getCalendarEvents({
      startDate,
      endDate,
      departmentId,
      branchId,
      stationId,
      leaveTypeId,
      employeeId,
      status,
    });

    return NextResponse.json({ success: true, data: { events } });
  } catch (error: any) {
    console.error('Error fetching calendar events:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
