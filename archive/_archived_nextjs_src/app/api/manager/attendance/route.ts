import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth('attendance.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const user = await db.user.findUnique({
      where: { id: auth.session.userId },
      include: {
        employee: {
          include: {
            station: true,
            department: true,
          },
        },
      },
    });

    const isHrOrAdmin = auth.session.roles.some((r: string) =>
      ['super_admin', 'hr_admin', 'hr_manager'].includes(r)
    );
    const managerStationId = user?.employee?.stationId;
    const managerDeptId = user?.employee?.departmentId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    const empFilter: any = {
      deletedAt: null,
      isArchived: false,
      employmentStatus: 'ACTIVE',
    };

    if (!isHrOrAdmin) {
      if (managerStationId) {
        empFilter.stationId = managerStationId;
      } else if (managerDeptId) {
        empFilter.departmentId = managerDeptId;
      } else {
        // Fallback: managed subordinates
        empFilter.supervisorId = user?.employee?.id || 'none';
      }
    }

    const subordinates = await db.employee.findMany({
      where: empFilter,
      include: {
        department: true,
        station: true,
        shiftAssignments: {
          where: { status: 'ACTIVE' },
          include: { shift: true },
          take: 1,
        },
        attendanceRecords: {
          where: { date: { gte: today, lte: endOfToday } },
          take: 1,
        },
      },
      orderBy: { employeeNumber: 'asc' },
    });

    // Pending overtime claims for manager's subordinates
    const pendingOvertime = await db.overtimeRecord.findMany({
      where: {
        approvalStatus: 'PENDING',
        employee: empFilter,
      },
      include: {
        employee: {
          select: { employeeNumber: true, fullName: true, jobTitle: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    // Summary counts
    let present = 0;
    let absent = 0;
    let late = 0;
    let onLeave = 0;

    const list = subordinates.map((emp) => {
      const att = emp.attendanceRecords[0];
      const status = att ? att.attendanceStatus : 'ABSENT';

      if (status === 'PRESENT' || status === 'PRESENT_WITH_OVERTIME') present++;
      else if (status === 'LATE') {
        present++;
        late++;
      } else if (status === 'ON_LEAVE') onLeave++;
      else absent++;

      return {
        id: emp.id,
        employeeNumber: emp.employeeNumber,
        fullName: emp.fullName,
        jobTitle: emp.jobTitle,
        station: emp.station?.name || 'Unassigned',
        department: emp.department?.name || 'Unassigned',
        currentShift: emp.shiftAssignments[0]?.shift?.name || 'Standard Shift',
        scheduledStart: emp.shiftAssignments[0]?.shift?.startTime || '08:00',
        scheduledEnd: emp.shiftAssignments[0]?.shift?.endTime || '17:00',
        clockIn: att?.actualClockIn ? att.actualClockIn.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null,
        clockOut: att?.actualClockOut ? att.actualClockOut.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null,
        todayStatus: status,
        workedHours: att ? Math.round((att.workedMinutes / 60) * 100) / 100 : 0,
        lateMinutes: att?.lateMinutes || 0,
        overtimeMinutes: att?.overtimeMinutes || 0,
      };
    });

    return apiSuccess({
      managerScope: isHrOrAdmin ? 'ALL_ORGANIZATION' : user?.employee?.station?.name || user?.employee?.department?.name || 'Subordinates',
      metrics: {
        totalStaff: subordinates.length,
        present,
        absent,
        late,
        onLeave,
        pendingOvertimeCount: pendingOvertime.length,
      },
      subordinates: list,
      pendingOvertime,
    });
  } catch (error: any) {
    console.error('Error in manager attendance view:', error);
    return apiError(error.message || 'Failed to fetch manager attendance');
  }
}
