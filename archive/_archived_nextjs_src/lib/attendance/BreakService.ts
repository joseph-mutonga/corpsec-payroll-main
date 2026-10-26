import { db } from '@/lib/db';
import { ClockService } from './ClockService';
import { AuditService } from '@/lib/audit';

export class BreakService {
  /**
   * Starts a break session for an active clocked-in employee.
   */
  static async startBreak(employeeId: string, options: { source?: string; notes?: string; createdById?: string } = {}) {
    const { activeRecord, isClockedIn } = await ClockService.getTodayStatus(employeeId);

    if (!isClockedIn || !activeRecord) {
      throw new Error('Cannot start a break: Employee is not currently clocked in.');
    }

    if (activeRecord.isBreakActive) {
      throw new Error('Employee is already on an active break. Please end the current break first.');
    }

    const now = new Date();

    const updated = await db.attendanceRecord.update({
      where: { id: activeRecord.id },
      data: {
        isBreakActive: true,
        breakStartTime: now,
        breakCount: { increment: 1 },
      },
    });

    await db.attendanceEvent.create({
      data: {
        attendanceRecordId: activeRecord.id,
        employeeId,
        eventType: 'BREAK_START',
        timestamp: now,
        source: options.source || 'PORTAL',
        notes: options.notes || null,
        createdById: options.createdById || null,
      },
    });

    if (options.createdById) {
      await AuditService.log({
        userId: options.createdById,
        action: 'ATTENDANCE_BREAK_START',
        resource: 'attendance_records',
        resourceId: activeRecord.id,
        details: { employeeId, timestamp: now },
      });
    }

    return updated;
  }

  /**
   * Ends the current active break session.
   */
  static async endBreak(employeeId: string, options: { source?: string; notes?: string; createdById?: string } = {}) {
    const { activeRecord } = await ClockService.getTodayStatus(employeeId);

    if (!activeRecord || !activeRecord.isBreakActive || !activeRecord.breakStartTime) {
      throw new Error('Cannot end break: No active break session in progress.');
    }

    const now = new Date();
    const breakDurationMs = now.getTime() - new Date(activeRecord.breakStartTime).getTime();
    const sessionBreakMinutes = Math.max(0, Math.round(breakDurationMs / (1000 * 60)));
    const totalBreakMinutes = activeRecord.breakDurationMinutes + sessionBreakMinutes;

    const updated = await db.attendanceRecord.update({
      where: { id: activeRecord.id },
      data: {
        isBreakActive: false,
        breakEndTime: now,
        breakDurationMinutes: totalBreakMinutes,
      },
    });

    await db.attendanceEvent.create({
      data: {
        attendanceRecordId: activeRecord.id,
        employeeId,
        eventType: 'BREAK_END',
        timestamp: now,
        source: options.source || 'PORTAL',
        notes: options.notes || null,
        createdById: options.createdById || null,
      },
    });

    if (options.createdById) {
      await AuditService.log({
        userId: options.createdById,
        action: 'ATTENDANCE_BREAK_END',
        resource: 'attendance_records',
        resourceId: activeRecord.id,
        details: {
          employeeId,
          sessionMinutes: sessionBreakMinutes,
          totalBreakMinutes,
        },
      });
    }

    return updated;
  }
}
