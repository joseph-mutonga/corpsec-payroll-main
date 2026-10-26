import { db } from '../db';

export interface LeaveCalendarFilters {
  startDate?: Date | string;
  endDate?: Date | string;
  departmentId?: string;
  branchId?: string;
  stationId?: string;
  leaveTypeId?: string;
  employeeId?: string;
  status?: string;
}

export class LeaveCalendarService {
  static async getCalendarEvents(filters: LeaveCalendarFilters) {
    const where: any = {};

    if (filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate);
      const end = new Date(filters.endDate);
      where.AND = [
        { startDate: { lte: end } },
        { endDate: { gte: start } },
      ];
    }

    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    } else {
      where.status = { in: ['APPROVED', 'ACTIVE', 'SUBMITTED', 'MANAGER_REVIEW', 'HR_REVIEW'] };
    }

    if (filters.leaveTypeId && filters.leaveTypeId !== 'ALL') {
      where.leaveTypeId = filters.leaveTypeId;
    }

    if (filters.employeeId) {
      where.employeeId = filters.employeeId;
    }

    // Filter by Employee Organizational Unit
    const employeeWhere: any = { deletedAt: null };
    if (filters.departmentId && filters.departmentId !== 'ALL') {
      employeeWhere.departmentId = filters.departmentId;
    }
    if (filters.branchId && filters.branchId !== 'ALL') {
      employeeWhere.branchId = filters.branchId;
    }
    if (filters.stationId && filters.stationId !== 'ALL') {
      employeeWhere.stationId = filters.stationId;
    }

    if (Object.keys(employeeWhere).length > 1) {
      where.employee = employeeWhere;
    }

    const requests = await db.leaveRequest.findMany({
      where,
      orderBy: { startDate: 'asc' },
      include: {
        leaveType: true,
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            department: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
            station: { select: { id: true, name: true } },
            position: { select: { id: true, title: true } },
          },
        },
      },
    });

    // Format events for calendar
    return requests.map((r) => ({
      id: r.id,
      title: `${r.employee.fullName} — ${r.leaveType.name} (${r.durationDays}d)`,
      start: r.startDate.toISOString().split('T')[0],
      end: r.endDate.toISOString().split('T')[0],
      requestNumber: r.requestNumber,
      employeeId: r.employee.id,
      employeeName: r.employee.fullName,
      employeeNumber: r.employee.employeeNumber,
      departmentName: r.employee.department?.name || 'General',
      branchName: r.employee.branch?.name || 'Main',
      stationName: r.employee.station?.name || 'HQ',
      leaveTypeId: r.leaveTypeId,
      leaveTypeName: r.leaveType.name,
      color: r.leaveType.color || (r.status === 'APPROVED' ? '#10b981' : '#f59e0b'),
      durationDays: r.durationDays,
      status: r.status,
      isHalfDay: r.isHalfDay,
      halfDaySession: r.halfDaySession,
    }));
  }
}
