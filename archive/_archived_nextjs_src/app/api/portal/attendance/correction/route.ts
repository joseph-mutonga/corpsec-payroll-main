import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { resolveSessionEmployee } from '@/lib/portal/PortalAuth';
import { HRRequestService } from '@/lib/portal/HRRequestService';
import { apiSuccess, apiError, apiBadRequest } from '@/lib/response';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authContext = await resolveSessionEmployee();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { employee } = authContext;
    const body = await request.json();
    const { date, requestedClockIn, requestedClockOut, requestedStatus, reason } = body;

    if (!date || !reason) {
      return apiBadRequest('Date and correction justification reason are required.');
    }

    const shiftDate = new Date(date);
    shiftDate.setHours(0, 0, 0, 0);

    // Find existing attendance record if any
    const existing = await db.attendanceRecord.findFirst({
      where: {
        employeeId: employee.id,
        date: shiftDate,
      },
    });

    const previousData = existing
      ? {
          attendanceRecordId: existing.id,
          date: existing.date,
          status: existing.attendanceStatus,
          clockInTime: existing.actualClockIn,
          clockOutTime: existing.actualClockOut,
          workedMinutes: existing.workedMinutes,
        }
      : null;

    const proposedData = {
      date: shiftDate.toISOString(),
      requestedClockIn,
      requestedClockOut,
      requestedStatus: requestedStatus || 'PRESENT',
      reason,
    };

    const hrRequest = await HRRequestService.createRequest({
      employeeId: employee.id,
      requestType: 'ATTENDANCE_CORRECTION',
      subject: `Attendance Correction for ${shiftDate.toLocaleDateString()}`,
      description: `Reason: ${reason}. Requested Times: ${requestedClockIn || 'N/A'} - ${requestedClockOut || 'N/A'}.`,
      priority: 'MEDIUM',
      previousData,
      proposedData,
    });

    return apiSuccess(
      hrRequest,
      'Attendance correction request submitted to HR Operations for review.'
    );
  } catch (error: any) {
    console.error('Error submitting attendance correction request:', error);
    return apiError(error.message || 'Failed to submit attendance correction request');
  }
}
