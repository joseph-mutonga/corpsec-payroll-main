import { db } from '@/lib/db';
import { AttendanceCalculationService } from './AttendanceCalculationService';
import { AuditService } from '@/lib/audit';

export interface AttendanceFilters {
  startDate?: Date | string;
  endDate?: Date | string;
  departmentId?: string;
  branchId?: string;
  stationId?: string;
  employeeId?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export class AttendanceService {
  /**
   * Lists comprehensive attendance records with pagination and filters.
   */
  static async listAttendance(filters: AttendanceFilters = {}) {
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (filters.startDate && filters.endDate) {
      where.date = {
        gte: new Date(filters.startDate),
        lte: new Date(filters.endDate),
      };
    } else if (filters.startDate) {
      where.date = { gte: new Date(filters.startDate) };
    }

    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.status && filters.status !== 'ALL') where.attendanceStatus = filters.status;

    if (filters.departmentId && filters.departmentId !== 'ALL') {
      where.employee = { ...where.employee, departmentId: filters.departmentId };
    }
    if (filters.branchId && filters.branchId !== 'ALL') {
      where.employee = { ...where.employee, branchId: filters.branchId };
    }
    if (filters.stationId && filters.stationId !== 'ALL') {
      where.employee = { ...where.employee, stationId: filters.stationId };
    }

    if (filters.search) {
      const q = filters.search.trim();
      where.employee = {
        ...where.employee,
        OR: [
          { fullName: { contains: q } },
          { employeeNumber: { contains: q } },
          { nationalId: { contains: q } },
        ],
      };
    }

    const [total, records] = await Promise.all([
      db.attendanceRecord.count({ where }),
      db.attendanceRecord.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { date: 'desc' },
        include: {
          scheduledShift: true,
          employee: {
            select: {
              id: true,
              fullName: true,
              employeeNumber: true,
              nationalId: true,
              department: { select: { id: true, name: true } },
              station: { select: { id: true, name: true } },
              branch: { select: { id: true, name: true } },
              position: { select: { id: true, title: true } },
            },
          },
          approvedBy: { select: { id: true, firstName: true, lastName: true } },
          overtimeRecords: true,
          adjustments: true,
        },
      }),
    ]);

    return {
      records,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Retrieves single attendance record by ID.
   */
  static async getAttendanceById(id: string) {
    return db.attendanceRecord.findUnique({
      where: { id },
      include: {
        scheduledShift: true,
        employee: {
          include: {
            department: true,
            station: true,
            branch: true,
            position: true,
          },
        },
        events: { orderBy: { timestamp: 'asc' } },
        overtimeRecords: true,
        adjustments: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  /**
   * Manual HR attendance override or creation.
   */
  static async recordManualAttendance(data: {
    employeeId: string;
    date: Date | string;
    shiftId?: string;
    scheduledStartTime?: string;
    scheduledEndTime?: string;
    actualClockIn?: Date | string;
    actualClockOut?: Date | string;
    breakDurationMinutes?: number;
    attendanceStatus: string;
    isRemote?: boolean;
    remoteLocationDescription?: string;
    notes?: string;
    recordedById?: string;
  }) {
    const targetDate = new Date(data.date);
    targetDate.setHours(0, 0, 0, 0);

    const shift = data.shiftId
      ? await db.shift.findUnique({ where: { id: data.shiftId } })
      : null;

    const calc = AttendanceCalculationService.calculateAttendance(
      data.scheduledStartTime || shift?.startTime,
      data.scheduledEndTime || shift?.endTime,
      data.actualClockIn,
      data.actualClockOut,
      {
        breakDurationMinutes: data.breakDurationMinutes ?? shift?.breakDurationMinutes ?? 0,
        isBreakPaid: shift?.isBreakPaid ?? false,
        isCrossMidnight: shift?.isOvernight ?? false,
      }
    );

    const record = await db.attendanceRecord.upsert({
      where: {
        employeeId_date: {
          employeeId: data.employeeId,
          date: targetDate,
        },
      },
      update: {
        scheduledShiftId: data.shiftId || undefined,
        scheduledStartTime: data.scheduledStartTime || shift?.startTime,
        scheduledEndTime: data.scheduledEndTime || shift?.endTime,
        actualClockIn: data.actualClockIn ? new Date(data.actualClockIn) : undefined,
        actualClockOut: data.actualClockOut ? new Date(data.actualClockOut) : undefined,
        workedMinutes: calc.workedMinutes,
        lateMinutes: calc.lateMinutes,
        earlyDepartureMinutes: calc.earlyDepartureMinutes,
        overtimeMinutes: calc.overtimeMinutes,
        attendanceStatus: data.attendanceStatus,
        source: 'HR_MANUAL',
        isRemote: data.isRemote ?? false,
        remoteLocationDescription: data.remoteLocationDescription || null,
        notes: data.notes || null,
      },
      create: {
        employeeId: data.employeeId,
        date: targetDate,
        scheduledShiftId: data.shiftId || null,
        scheduledStartTime: data.scheduledStartTime || shift?.startTime || null,
        scheduledEndTime: data.scheduledEndTime || shift?.endTime || null,
        actualClockIn: data.actualClockIn ? new Date(data.actualClockIn) : null,
        actualClockOut: data.actualClockOut ? new Date(data.actualClockOut) : null,
        workedMinutes: calc.workedMinutes,
        lateMinutes: calc.lateMinutes,
        earlyDepartureMinutes: calc.earlyDepartureMinutes,
        overtimeMinutes: calc.overtimeMinutes,
        attendanceStatus: data.attendanceStatus,
        source: 'HR_MANUAL',
        isRemote: data.isRemote ?? false,
        remoteLocationDescription: data.remoteLocationDescription || null,
        notes: data.notes || null,
      },
      include: { scheduledShift: true, employee: true },
    });

    if (data.recordedById) {
      await AuditService.log({
        userId: data.recordedById,
        action: 'RECORD_MANUAL_ATTENDANCE',
        resource: 'attendance_records',
        resourceId: record.id,
        details: { employeeId: data.employeeId, date: targetDate, status: data.attendanceStatus },
      });
    }

    return record;
  }

  /**
   * Legacy alias: Retrieves daily attendance matrix.
   */
  static async getDailyAttendance(params: {
    date?: Date | string;
    departmentId?: string;
    stationId?: string;
    shiftId?: string;
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const targetDate = params.date || new Date().toISOString().split('T')[0];
    return this.listAttendance({
      startDate: targetDate,
      endDate: targetDate,
      departmentId: params.departmentId,
      stationId: params.stationId,
      status: params.status,
      search: params.search,
      page: params.page,
      pageSize: params.pageSize,
    });
  }

  /**
   * Legacy alias: Processes clock in / out event.
   */
  static async processClockEvent(data: {
    employeeId: string;
    eventType: 'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_START' | 'BREAK_END';
    source?: string;
    ipAddress?: string;
    deviceInfo?: string;
    notes?: string;
    createdById?: string;
  }) {
    const { ClockService } = await import('./ClockService');
    const { BreakService } = await import('./BreakService');

    if (data.eventType === 'CLOCK_IN') {
      return ClockService.clockIn({
        employeeId: data.employeeId,
        source: data.source || 'PORTAL',
        ipAddress: data.ipAddress,
        deviceInfo: data.deviceInfo,
        notes: data.notes,
        createdById: data.createdById,
      });
    } else if (data.eventType === 'CLOCK_OUT') {
      return ClockService.clockOut({
        employeeId: data.employeeId,
        source: data.source || 'PORTAL',
        ipAddress: data.ipAddress,
        deviceInfo: data.deviceInfo,
        notes: data.notes,
        createdById: data.createdById,
      });
    } else if (data.eventType === 'BREAK_START') {
      return BreakService.startBreak(data.employeeId, {
        source: data.source || 'PORTAL',
        notes: data.notes,
        createdById: data.createdById,
      });
    } else if (data.eventType === 'BREAK_END') {
      return BreakService.endBreak(data.employeeId, {
        source: data.source || 'PORTAL',
        notes: data.notes,
        createdById: data.createdById,
      });
    }
  }

  /**
   * Legacy alias: Lock attendance for payroll run.
   */
  static async lockAttendanceForPayroll(runId: string, startDate: Date | string, endDate: Date | string, userId?: string) {
    const { AttendancePayrollIntegrationService } = await import('./AttendancePayrollIntegrationService');
    return AttendancePayrollIntegrationService.lockAttendanceForPayroll(startDate, endDate, userId);
  }

  /**
   * Legacy alias: Review overtime.
   */
  static async reviewOvertime(params: {
    overtimeId: string;
    action: 'APPROVE' | 'REJECT';
    reviewerUserId: string;
    comments?: string;
    approvedHours?: number;
  }) {
    const { OvertimeService } = await import('./OvertimeService');
    return OvertimeService.reviewOvertime({
      overtimeId: params.overtimeId,
      decision: params.action,
      reviewerUserId: params.reviewerUserId,
      comments: params.comments,
    });
  }

  /**
   * Legacy alias: Review correction.
   */
  static async reviewCorrection(params: {
    adjustmentId: string;
    action: 'APPROVE' | 'REJECT';
    reviewerUserId: string;
    comments?: string;
  }) {
    const { AttendanceCorrectionService } = await import('./AttendanceCorrectionService');
    const result = await AttendanceCorrectionService.reviewCorrection({
      adjustmentId: params.adjustmentId,
      decision: params.action,
      reviewerUserId: params.reviewerUserId,
      comments: params.comments,
    });
    return { success: true, adjustment: result };
  }
}
