import { db } from '@/lib/db';

export interface StationCoverageData {
  stationId: string;
  stationCode: string;
  stationName: string;
  clientLocationName?: string | null;
  branchName?: string;
  requiredPersonnel: number;
  scheduledPersonnel: number;
  presentPersonnel: number;
  missingPersonnel: number;
  onLeavePersonnel: number;
  latePersonnel: number;
  coveragePercentage: number;
  status: 'OPTIMAL' | 'ADEQUATE' | 'UNDERSTAFFED' | 'CRITICAL';
}

export class CoverageService {
  /**
   * Evaluates real-time guarding coverage across all stations on a given date.
   */
  static async getStationCoverage(targetDate: Date | string = new Date()): Promise<StationCoverageData[]> {
    const date = new Date(targetDate);
    date.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const [stations, shiftAssignments, attendanceRecords, leaveRequests] = await Promise.all([
      db.station.findMany({
        where: { isActive: true, deletedAt: null },
        include: { branch: true },
        orderBy: { name: 'asc' },
      }),
      db.employeeShiftAssignment.findMany({
        where: {
          startDate: { lte: dayEnd },
          OR: [{ endDate: null }, { endDate: { gte: date } }],
          status: 'ACTIVE',
        },
      }),
      db.attendanceRecord.findMany({
        where: { date },
        include: { employee: true },
      }),
      db.leaveRequest.findMany({
        where: {
          status: { in: ['APPROVED', 'ACTIVE'] },
          startDate: { lte: dayEnd },
          endDate: { gte: date },
        },
      }),
    ]);

    const results: StationCoverageData[] = [];

    for (const station of stations) {
      const required = station.requiredStaffing || 0;

      // Scheduled staff for this station
      const scheduledAssignments = shiftAssignments.filter((sa) => sa.stationId === station.id);
      const scheduledEmpIds = new Set(scheduledAssignments.map((sa) => sa.employeeId));

      // Records for this station's scheduled or assigned employees
      const stationAttendances = attendanceRecords.filter((a) => {
        return a.employee.stationId === station.id || scheduledEmpIds.has(a.employeeId);
      });

      const presentCount = stationAttendances.filter((a) =>
        ['PRESENT', 'PRESENT_WITH_OVERTIME', 'LATE', 'EARLY_DEPARTURE'].includes(a.attendanceStatus) &&
        !!a.actualClockIn
      ).length;

      const lateCount = stationAttendances.filter((a) => a.attendanceStatus === 'LATE').length;

      const onLeaveCount = leaveRequests.filter((l) => scheduledEmpIds.has(l.employeeId)).length;

      const scheduledCount = Math.max(scheduledEmpIds.size, required);
      const missingCount = Math.max(0, required > 0 ? required - presentCount : scheduledCount - presentCount);

      // Safe zero-division percentage formula
      let coveragePercentage = 100.0;
      if (required > 0) {
        coveragePercentage = Math.min(100.0, Number(((presentCount / required) * 100).toFixed(1)));
      } else if (scheduledCount > 0) {
        coveragePercentage = Math.min(100.0, Number(((presentCount / scheduledCount) * 100).toFixed(1)));
      }

      let status: 'OPTIMAL' | 'ADEQUATE' | 'UNDERSTAFFED' | 'CRITICAL' = 'OPTIMAL';
      if (coveragePercentage < 50) status = 'CRITICAL';
      else if (coveragePercentage < 80) status = 'UNDERSTAFFED';
      else if (coveragePercentage < 100) status = 'ADEQUATE';

      results.push({
        stationId: station.id,
        stationCode: station.code,
        stationName: station.name,
        clientLocationName: station.clientLocationName,
        branchName: station.branch?.name,
        requiredPersonnel: required,
        scheduledPersonnel: scheduledCount,
        presentPersonnel: presentCount,
        missingPersonnel: missingCount,
        onLeavePersonnel: onLeaveCount,
        latePersonnel: lateCount,
        coveragePercentage,
        status,
      });
    }

    return results;
  }
}
