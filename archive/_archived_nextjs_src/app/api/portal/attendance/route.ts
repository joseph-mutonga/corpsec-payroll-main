import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ClockService } from '@/lib/attendance/ClockService';
import { BreakService } from '@/lib/attendance/BreakService';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !user.employeeId) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Employee profile required.' }, { status: 401 });
    }

    const [todayStatus, history, timesheets, overtimes, corrections] = await Promise.all([
      ClockService.getTodayStatus(user.employeeId),
      db.attendanceRecord.findMany({
        where: { employeeId: user.employeeId },
        orderBy: { date: 'desc' },
        take: 30,
        include: { scheduledShift: true },
      }),
      db.timesheet.findMany({
        where: { employeeId: user.employeeId },
        orderBy: { periodStart: 'desc' },
        take: 12,
      }),
      db.overtimeRecord.findMany({
        where: { employeeId: user.employeeId },
        orderBy: { date: 'desc' },
        take: 20,
      }),
      db.attendanceAdjustment.findMany({
        where: { employeeId: user.employeeId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        todayStatus,
        history,
        timesheets,
        overtimes,
        corrections,
      },
    });
  } catch (error: any) {
    console.error('Error fetching portal attendance:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !user.employeeId) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Employee profile required.' }, { status: 401 });
    }

    const body = await req.json();
    const action = body.action || 'CLOCK_IN';

    let result;
    switch (action) {
      case 'CLOCK_IN':
        result = await ClockService.clockIn({
          employeeId: user.employeeId,
          timestamp: body.timestamp,
          source: 'PORTAL',
          notes: body.notes,
          isRemote: body.isRemote,
          remoteLocationDescription: body.remoteLocationDescription,
          createdById: user.id,
        });
        break;

      case 'CLOCK_OUT':
        result = await ClockService.clockOut({
          employeeId: user.employeeId,
          timestamp: body.timestamp,
          source: 'PORTAL',
          notes: body.notes,
          createdById: user.id,
        });
        break;

      case 'BREAK_START':
        result = await BreakService.startBreak(user.employeeId, {
          source: 'PORTAL',
          notes: body.notes,
          createdById: user.id,
        });
        break;

      case 'BREAK_END':
        result = await BreakService.endBreak(user.employeeId, {
          source: 'PORTAL',
          notes: body.notes,
          createdById: user.id,
        });
        break;

      default:
        return NextResponse.json({ success: false, error: `Unsupported action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: result,
    }, { status: 200 });
  } catch (error: any) {
    console.error('Error in portal clocking action:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
