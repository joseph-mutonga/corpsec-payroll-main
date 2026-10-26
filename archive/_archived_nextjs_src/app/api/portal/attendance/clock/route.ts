import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiBadRequest, apiError, apiNotFound, apiSuccess } from '@/lib/response';
import { AttendanceService } from '@/lib/attendance/AttendanceService';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth('portal.attendance.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const { eventType, notes } = body;

    if (!eventType || (eventType !== 'CLOCK_IN' && eventType !== 'CLOCK_OUT')) {
      return apiBadRequest('Valid eventType (CLOCK_IN or CLOCK_OUT) is required');
    }

    // Resolve employee linked to current user
    const emp = await db.employee.findFirst({
      where: { userId: auth.session.userId, deletedAt: null },
    });
    if (!emp) {
      return apiNotFound('No employee profile linked to your user account.');
    }
    const employeeId = emp.id;

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    const deviceInfo = req.headers.get('user-agent') || 'Employee Self-Service Portal';

    const result = await AttendanceService.processClockEvent({
      employeeId,
      eventType,
      source: 'WEB',
      ipAddress,
      deviceInfo,
      notes,
      createdById: auth.session.userId,
    });

    return apiSuccess(result);
  } catch (error: any) {
    console.error('Error in portal self-service clock:', error);
    return apiError(error.message || 'Failed to process self-service clock');
  }
}
