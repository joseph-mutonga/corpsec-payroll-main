import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export class AttendancePolicyService {
  /**
   * Retrieves active attendance settings or creates default.
   */
  static async getSettings() {
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
    return settings;
  }

  /**
   * Updates attendance policy settings.
   */
  static async updateSettings(
    data: {
      defaultScheduleId?: string;
      defaultShiftId?: string;
      gracePeriodMinutes?: number;
      overtimeThresholdMinutes?: number;
      maxDailyOvertimeMinutes?: number;
      workingDaysPerWeek?: number;
      breakDurationMinutes?: number;
      roundingIntervalMinutes?: number;
      earlyDepartureThresholdMins?: number;
      autoAbsenceCheckHour?: number;
      requireSupervisorOvertimeApproval?: boolean;
      requireAttendanceLockForPayroll?: boolean;
    },
    updatedById?: string
  ) {
    const current = await this.getSettings();

    const updated = await db.attendanceSetting.update({
      where: { id: current.id },
      data: {
        ...data,
      },
    });

    if (updatedById) {
      await AuditService.log({
        userId: updatedById,
        action: 'UPDATE_ATTENDANCE_SETTINGS',
        resource: 'attendance_settings',
        resourceId: current.id,
        details: { previous: current, updated: data },
      });
    }

    return updated;
  }
}
