import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/auth-helpers';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(['attendance.view']);
    const { searchParams } = new URL(req.url);

    const branchId = searchParams.get('branchId');
    const stationId = searchParams.get('stationId');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0);
    const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    const empWhere: any = { deletedAt: null, isArchived: false };
    if (branchId) empWhere.branchId = branchId;
    if (stationId) empWhere.stationId = stationId;

    const [
      totalActiveEmployees,
      todayRecords,
      periodRecords,
      pendingOvertimeCount,
      pendingApprovalsCount,
      lockedRecordsCount,
    ] = await Promise.all([
      db.employee.count({ where: { ...empWhere, employmentStatus: 'ACTIVE' } }),
      db.attendanceRecord.findMany({
        where: {
          date: { gte: today, lte: endOfToday },
          ...(branchId || stationId
            ? { employee: { ...empWhere } }
            : {}),
        },
        select: {
          attendanceStatus: true,
          approvalStatus: true,
          lateMinutes: true,
          overtimeMinutes: true,
        },
      }),
      db.attendanceRecord.findMany({
        where: {
          date: { gte: firstOfMonth, lte: lastOfMonth },
          ...(branchId || stationId
            ? { employee: { ...empWhere } }
            : {}),
        },
        select: {
          attendanceStatus: true,
          approvalStatus: true,
          lateMinutes: true,
          overtimeMinutes: true,
          workedMinutes: true,
        },
      }),
      db.overtimeRecord.count({
        where: {
          approvalStatus: 'PENDING',
          ...(branchId || stationId
            ? { employee: { ...empWhere } }
            : {}),
        },
      }),
      db.attendanceRecord.count({
        where: {
          approvalStatus: 'SUBMITTED',
          date: { gte: firstOfMonth, lte: lastOfMonth },
          ...(branchId || stationId
            ? { employee: { ...empWhere } }
            : {}),
        },
      }),
      db.attendanceRecord.count({
        where: {
          approvalStatus: 'LOCKED',
          date: { gte: firstOfMonth, lte: lastOfMonth },
          ...(branchId || stationId
            ? { employee: { ...empWhere } }
            : {}),
        },
      }),
    ]);

    // Today's breakdowns
    let todayPresent = 0;
    let todayLate = 0;
    let todayAbsent = 0;
    let todayOnLeave = 0;
    let todayOff = 0;
    let todayMissing = 0;

    for (const r of todayRecords) {
      if (r.attendanceStatus === 'PRESENT' || r.attendanceStatus === 'PRESENT_WITH_OVERTIME') todayPresent++;
      else if (r.attendanceStatus === 'LATE') todayLate++;
      else if (r.attendanceStatus === 'ABSENT') todayAbsent++;
      else if (r.attendanceStatus === 'ON_LEAVE' || r.attendanceStatus === 'SICK_LEAVE') todayOnLeave++;
      else if (r.attendanceStatus === 'OFF_DAY' || r.attendanceStatus === 'REST_DAY' || r.attendanceStatus === 'PUBLIC_HOLIDAY') todayOff++;
      else if (r.attendanceStatus === 'MISSING_CLOCK_OUT') todayMissing++;
    }

    // Period Totals
    let periodLateCount = 0;
    let periodTotalWorkedMinutes = 0;
    let periodTotalOvertimeMinutes = 0;
    let periodPresentCount = 0;

    for (const r of periodRecords) {
      if (r.lateMinutes > 0) periodLateCount++;
      periodTotalWorkedMinutes += r.workedMinutes;
      periodTotalOvertimeMinutes += r.overtimeMinutes;
      if (['PRESENT', 'PRESENT_WITH_OVERTIME', 'LATE', 'EARLY_DEPARTURE'].includes(r.attendanceStatus)) {
        periodPresentCount++;
      }
    }

    const attendanceRate =
      periodRecords.length > 0
        ? Math.round((periodPresentCount / periodRecords.length) * 100)
        : 0;

    return successResponse({
      today: {
        totalActiveEmployees,
        present: todayPresent,
        late: todayLate,
        absent: todayAbsent,
        onLeave: todayOnLeave,
        offDay: todayOff,
        missingClockOut: todayMissing,
        recordedTodayCount: todayRecords.length,
      },
      period: {
        monthName: today.toLocaleString('default', { month: 'long', year: 'numeric' }),
        attendanceRate,
        totalRecords: periodRecords.length,
        totalPresent: periodPresentCount,
        totalLateArrivals: periodLateCount,
        totalWorkedHours: Math.round((periodTotalWorkedMinutes / 60) * 10) / 10,
        totalOvertimeHours: Math.round((periodTotalOvertimeMinutes / 60) * 10) / 10,
        pendingApprovals: pendingApprovalsCount,
        pendingOvertime: pendingOvertimeCount,
        lockedRecords: lockedRecordsCount,
      },
    });
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to fetch attendance metrics', error.status || 500);
  }
}
