import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { AttendanceService } from '@/lib/training/AttendanceService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    const employeeId = searchParams.get('employeeId');
    const dateStr = searchParams.get('date');
    const date = dateStr ? new Date(dateStr) : undefined;

    if (sessionId) {
      const roster = await AttendanceService.getSessionRoster(sessionId, date);
      return NextResponse.json({ success: true, data: roster });
    }

    const isHrOrAdmin = hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager']);
    const targetEmployeeId = (!isHrOrAdmin && user.employeeId) ? user.employeeId : employeeId;

    if (targetEmployeeId) {
      const history = await AttendanceService.getEmployeeAttendanceHistory(targetEmployeeId);
      return NextResponse.json({ success: true, data: { attendances: history } });
    }

    return NextResponse.json({ success: false, error: 'Please specify sessionId or employeeId.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();

    if (body.bulk && Array.isArray(body.records)) {
      if (!body.sessionId || !body.date) {
        return NextResponse.json({ success: false, error: 'Session ID and Date are required for bulk attendance.' }, { status: 400 });
      }
      const records = await AttendanceService.bulkRecordAttendance(
        body.sessionId,
        new Date(body.date),
        body.records,
        user.id
      );
      return NextResponse.json({ success: true, data: { records } }, { status: 201 });
    }

    if (!body.sessionId || !body.employeeId || !body.date || !body.status) {
      return NextResponse.json(
        { success: false, error: 'Session ID, Employee ID, Date, and Status are required.' },
        { status: 400 }
      );
    }

    const attendance = await AttendanceService.recordAttendance({
      ...body,
      date: new Date(body.date),
      checkInTime: body.checkInTime ? new Date(body.checkInTime) : undefined,
      checkOutTime: body.checkOutTime ? new Date(body.checkOutTime) : undefined,
      markedById: user.id,
    });

    return NextResponse.json({ success: true, data: { attendance } }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    if (!body.sessionId || !body.date) {
      return NextResponse.json({ success: false, error: 'Session ID and Date are required.' }, { status: 400 });
    }

    const result = await AttendanceService.finalizeSessionAttendance(body.sessionId, new Date(body.date), user.id);
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
