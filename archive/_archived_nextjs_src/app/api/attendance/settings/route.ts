import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth('attendance.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    let settings = await db.attendanceSetting.findFirst();
    if (!settings) {
      settings = await db.attendanceSetting.create({
        data: {
          id: 'corpsec_attendance_setting_default',
          gracePeriodMinutes: 15,
          overtimeThresholdMinutes: 0,
          maxDailyOvertimeMinutes: 360,
          workingDaysPerWeek: 6,
          breakDurationMinutes: 60,
          roundingIntervalMinutes: 1,
          earlyDepartureThresholdMins: 15,
          autoAbsenceCheckHour: 23,
          requireSupervisorOvertimeApproval: true,
          requireAttendanceLockForPayroll: true,
        },
      });
    }

    return apiSuccess(settings);
  } catch (error: any) {
    console.error('Error fetching attendance settings:', error);
    return apiError(error.message || 'Failed to fetch attendance settings');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth('attendance.settings.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const {
      gracePeriodMinutes,
      overtimeThresholdMinutes,
      maxDailyOvertimeMinutes,
      workingDaysPerWeek,
      breakDurationMinutes,
      roundingIntervalMinutes,
      earlyDepartureThresholdMins,
      autoAbsenceCheckHour,
      requireSupervisorOvertimeApproval,
      requireAttendanceLockForPayroll,
    } = body;

    let current = await db.attendanceSetting.findFirst();
    const updateData: any = {};

    if (gracePeriodMinutes !== undefined) updateData.gracePeriodMinutes = Number(gracePeriodMinutes);
    if (overtimeThresholdMinutes !== undefined) updateData.overtimeThresholdMinutes = Number(overtimeThresholdMinutes);
    if (maxDailyOvertimeMinutes !== undefined) updateData.maxDailyOvertimeMinutes = Number(maxDailyOvertimeMinutes);
    if (workingDaysPerWeek !== undefined) updateData.workingDaysPerWeek = Number(workingDaysPerWeek);
    if (breakDurationMinutes !== undefined) updateData.breakDurationMinutes = Number(breakDurationMinutes);
    if (roundingIntervalMinutes !== undefined) updateData.roundingIntervalMinutes = Number(roundingIntervalMinutes);
    if (earlyDepartureThresholdMins !== undefined) updateData.earlyDepartureThresholdMins = Number(earlyDepartureThresholdMins);
    if (autoAbsenceCheckHour !== undefined) updateData.autoAbsenceCheckHour = Number(autoAbsenceCheckHour);
    if (requireSupervisorOvertimeApproval !== undefined) updateData.requireSupervisorOvertimeApproval = Boolean(requireSupervisorOvertimeApproval);
    if (requireAttendanceLockForPayroll !== undefined) updateData.requireAttendanceLockForPayroll = Boolean(requireAttendanceLockForPayroll);

    const updated = await db.attendanceSetting.upsert({
      where: { id: current?.id || 'corpsec_attendance_setting_default' },
      update: updateData,
      create: {
        id: 'corpsec_attendance_setting_default',
        ...updateData,
      },
    });

    await createAuditLog({
      userId: auth.session.userId,
      action: 'UPDATE_ATTENDANCE_SETTINGS',
      module: 'ATTENDANCE',
      newValue: updateData,
    });

    return apiSuccess(updated);
  } catch (error: any) {
    console.error('Error updating attendance settings:', error);
    return apiError(error.message || 'Failed to update attendance settings');
  }
}
