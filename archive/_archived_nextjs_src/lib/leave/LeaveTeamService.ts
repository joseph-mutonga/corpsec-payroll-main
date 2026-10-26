import { db } from '../db';

export class LeaveTeamService {
  /**
   * Evaluates real-time availability status for an employee's direct subordinates or department team.
   */
  static async getTeamAvailability(managerEmployeeId?: string, departmentId?: string, asOfDate: Date = new Date()) {
    const today = new Date(asOfDate);
    today.setHours(0, 0, 0, 0);

    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    const whereEmployee: any = {
      employmentStatus: 'ACTIVE',
      deletedAt: null,
    };

    if (managerEmployeeId) {
      whereEmployee.OR = [
        { supervisorId: managerEmployeeId },
        { department: { departmentHeadId: managerEmployeeId } },
      ];
    } else if (departmentId && departmentId !== 'ALL') {
      whereEmployee.departmentId = departmentId;
    }

    const employees = await db.employee.findMany({
      where: whereEmployee,
      orderBy: { fullName: 'asc' },
      include: {
        department: { select: { id: true, name: true } },
        station: { select: { id: true, name: true } },
        position: { select: { id: true, title: true } },
      },
    });

    const results = [];

    for (const emp of employees) {
      // Check active approved leave today
      const activeLeave = await db.leaveRequest.findFirst({
        where: {
          employeeId: emp.id,
          status: { in: ['APPROVED', 'ACTIVE'] },
          startDate: { lte: endOfToday },
          endDate: { gte: today },
        },
        include: { leaveType: true },
      });

      // Check pending leave request today or upcoming
      const pendingLeave = await db.leaveRequest.findFirst({
        where: {
          employeeId: emp.id,
          status: { in: ['SUBMITTED', 'MANAGER_REVIEW', 'HR_REVIEW'] },
          startDate: { lte: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000) }, // next 14 days
          endDate: { gte: today },
        },
        include: { leaveType: true },
        orderBy: { startDate: 'asc' },
      });

      // Check open absence incident
      const openAbsence = await db.leaveAbsence.findFirst({
        where: {
          employeeId: emp.id,
          date: { gte: today, lte: endOfToday },
          status: { in: ['OPEN', 'UNEXCUSED'] },
        },
      });

      let status: 'AVAILABLE' | 'ON_LEAVE' | 'PENDING_LEAVE' | 'ABSENT' = 'AVAILABLE';
      let currentLeaveDetails = null;

      if (activeLeave) {
        status = 'ON_LEAVE';
        currentLeaveDetails = {
          requestNumber: activeLeave.requestNumber,
          leaveTypeName: activeLeave.leaveType.name,
          startDate: activeLeave.startDate,
          endDate: activeLeave.endDate,
          returnDate: activeLeave.returnDateExpected || new Date(activeLeave.endDate.getTime() + 24 * 60 * 60 * 1000),
          durationDays: activeLeave.durationDays,
        };
      } else if (openAbsence) {
        status = 'ABSENT';
      } else if (pendingLeave) {
        status = 'PENDING_LEAVE';
        currentLeaveDetails = {
          requestNumber: pendingLeave.requestNumber,
          leaveTypeName: pendingLeave.leaveType.name,
          startDate: pendingLeave.startDate,
          endDate: pendingLeave.endDate,
          durationDays: pendingLeave.durationDays,
        };
      }

      results.push({
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        fullName: emp.fullName,
        jobTitle: emp.jobTitle || emp.position?.title || 'Staff',
        department: emp.department?.name || 'Operations',
        station: emp.station?.name || 'HQ',
        primaryPhone: emp.primaryPhone,
        status,
        currentLeaveDetails,
      });
    }

    return results;
  }
}
