import { db } from './db';
import { calculateLeaveDuration } from './leave-calculator';

/**
 * Synchronizes an Approved Leave Request with Phase 4 Attendance Records.
 * Creates or updates AttendanceRecords for all eligible leave days with 'ON_LEAVE' or 'SICK_LEAVE'.
 */
export async function syncApprovedLeaveWithAttendance(leaveRequestId: string): Promise<number> {
  const leaveRequest = await db.leaveRequest.findUnique({
    where: { id: leaveRequestId },
    include: {
      leaveType: true,
      employee: {
        include: {
          shiftAssignments: {
            where: { status: 'ACTIVE' },
            include: { shift: true, workSchedule: true },
          },
        },
      },
    },
  });

  if (!leaveRequest || leaveRequest.status !== 'APPROVED') {
    return 0;
  }

  // Get gazetted public holidays for the year
  const holidays = await db.publicHoliday.findMany({
    where: {
      date: {
        gte: new Date(leaveRequest.startDate.getFullYear(), 0, 1),
        lte: new Date(leaveRequest.endDate.getFullYear(), 11, 31),
      },
      isActive: true,
    },
    select: { date: true },
  });

  const activeShift = leaveRequest.employee.shiftAssignments[0]?.shift;

  const isSickLeave = leaveRequest.leaveType.code.includes('SICK');
  const targetAttendanceStatus = isSickLeave ? 'SICK_LEAVE' : 'ON_LEAVE';

  const start = new Date(leaveRequest.startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(leaveRequest.endDate);
  end.setHours(0, 0, 0, 0);

  let recordsSynced = 0;
  const curr = new Date(start);

  while (curr <= end) {
    const dayDate = new Date(curr);
    const dayOfWeek = dayDate.getDay();

    // Check weekend exclusion (except for maternity/paternity continuous calendar days)
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isMaternityOrPaternity =
      leaveRequest.leaveType.code.includes('MATERNITY') || leaveRequest.leaveType.code.includes('PATERNITY');

    if (!isWeekend || isMaternityOrPaternity) {
      await db.attendanceRecord.upsert({
        where: {
          employeeId_date: {
            employeeId: leaveRequest.employeeId,
            date: dayDate,
          },
        },
        update: {
          attendanceStatus: targetAttendanceStatus,
          notes: `Approved Leave: ${leaveRequest.requestNumber} (${leaveRequest.leaveType.name})`,
          approvalStatus: 'APPROVED',
          approvedAt: leaveRequest.reviewedAt || new Date(),
        },
        create: {
          employeeId: leaveRequest.employeeId,
          date: dayDate,
          scheduledShiftId: activeShift?.id || null,
          scheduledStartTime: activeShift?.startTime || '06:00',
          scheduledEndTime: activeShift?.endTime || '18:00',
          workedMinutes: 0,
          lateMinutes: 0,
          earlyDepartureMinutes: 0,
          overtimeMinutes: 0,
          attendanceStatus: targetAttendanceStatus,
          source: 'PORTAL',
          approvalStatus: 'APPROVED',
          approvedAt: leaveRequest.reviewedAt || new Date(),
          notes: `Approved Leave: ${leaveRequest.requestNumber} (${leaveRequest.leaveType.name})`,
        },
      });
      recordsSynced++;
    }

    curr.setDate(curr.getDate() + 1);
  }

  return recordsSynced;
}

/**
 * Reverts Attendance Records when an approved leave request is cancelled.
 */
export async function revertCancelledLeaveAttendance(leaveRequestId: string): Promise<number> {
  const leaveRequest = await db.leaveRequest.findUnique({
    where: { id: leaveRequestId },
  });

  if (!leaveRequest) return 0;

  const start = new Date(leaveRequest.startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(leaveRequest.endDate);
  end.setHours(23, 59, 59, 999);

  // Find attendance records matching this leave note or date range
  const matchedRecords = await db.attendanceRecord.findMany({
    where: {
      employeeId: leaveRequest.employeeId,
      date: { gte: start, lte: end },
      OR: [
        { notes: { contains: leaveRequest.requestNumber } },
        { attendanceStatus: { in: ['ON_LEAVE', 'SICK_LEAVE'] } },
      ],
    },
  });

  let reverted = 0;
  for (const rec of matchedRecords) {
    // If no clock in/out occurred, mark as OFF_DAY or delete synthetic record
    if (!rec.actualClockIn && !rec.actualClockOut) {
      await db.attendanceRecord.delete({ where: { id: rec.id } });
    } else {
      await db.attendanceRecord.update({
        where: { id: rec.id },
        data: {
          attendanceStatus: 'PRESENT',
          notes: `Leave ${leaveRequest.requestNumber} cancelled on ${new Date().toISOString().split('T')[0]}`,
        },
      });
    }
    reverted++;
  }

  return reverted;
}
