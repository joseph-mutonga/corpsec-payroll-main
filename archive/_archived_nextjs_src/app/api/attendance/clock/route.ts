import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ClockService } from '@/lib/attendance/ClockService';
import { BreakService } from '@/lib/attendance/BreakService';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const action = body.action || 'CLOCK_IN';
    const employeeId = body.employeeId || user.employeeId;

    if (!employeeId) {
      return NextResponse.json({ success: false, error: 'Target Employee ID is required.' }, { status: 400 });
    }

    let result;
    switch (action) {
      case 'CLOCK_IN':
        result = await ClockService.clockIn({
          employeeId,
          timestamp: body.timestamp,
          source: body.source || 'WEB',
          deviceInfo: body.deviceInfo,
          ipAddress: body.ipAddress,
          notes: body.notes,
          isRemote: body.isRemote,
          remoteLocationDescription: body.remoteLocationDescription,
          createdById: user.id,
        });
        break;

      case 'CLOCK_OUT':
        result = await ClockService.clockOut({
          employeeId,
          timestamp: body.timestamp,
          source: body.source || 'WEB',
          deviceInfo: body.deviceInfo,
          ipAddress: body.ipAddress,
          notes: body.notes,
          createdById: user.id,
        });
        break;

      case 'BREAK_START':
        result = await BreakService.startBreak(employeeId, {
          source: body.source || 'WEB',
          notes: body.notes,
          createdById: user.id,
        });
        break;

      case 'BREAK_END':
        result = await BreakService.endBreak(employeeId, {
          source: body.source || 'WEB',
          notes: body.notes,
          createdById: user.id,
        });
        break;

      default:
        return NextResponse.json({ success: false, error: `Unsupported clock action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error processing attendance clock action:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
