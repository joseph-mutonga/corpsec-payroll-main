import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';
import { AttendanceService } from '@/lib/attendance/AttendanceService';
import { createAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth('attendance.daily.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const departmentId = searchParams.get('departmentId') || undefined;
    const stationId = searchParams.get('stationId') || undefined;
    const shiftId = searchParams.get('shiftId') || undefined;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

    const result = await AttendanceService.getDailyAttendance({
      date,
      departmentId,
      stationId,
      shiftId,
      status,
      search,
      page,
      pageSize,
    });

    return apiSuccess(result);
  } catch (error: any) {
    console.error('Error fetching daily attendance:', error);
    return apiError(error.message || 'Failed to fetch daily attendance');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth('attendance.correct');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const { attendanceRecordId, attendanceStatus, notes } = body;

    if (!attendanceRecordId || !attendanceStatus) {
      return apiBadRequest('attendanceRecordId and attendanceStatus are required');
    }

    const current = await db.attendanceRecord.findUnique({
      where: { id: attendanceRecordId },
    });

    if (!current) return apiBadRequest('Attendance record not found');
    if (current.approvalStatus === 'LOCKED') {
      return apiBadRequest('Cannot override locked attendance record');
    }

    const updated = await db.attendanceRecord.update({
      where: { id: attendanceRecordId },
      data: {
        attendanceStatus,
        notes: notes || current.notes,
      },
    });

    await createAuditLog({
      userId: auth.session.userId,
      action: 'MANUAL_ATTENDANCE_OVERRIDE',
      module: 'ATTENDANCE',
      entityType: 'AttendanceRecord',
      entityId: attendanceRecordId,
      previousValue: { status: current.attendanceStatus },
      newValue: { status: attendanceStatus, notes },
    });

    return apiSuccess(updated);
  } catch (error: any) {
    console.error('Error in manual attendance override:', error);
    return apiError(error.message || 'Failed to override attendance');
  }
}
