import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export class TimesheetService {
  /**
   * Generates sequential timesheet number: TS-YYYY-XXXX
   */
  static async generateTimesheetNumber(year: number = new Date().getFullYear()): Promise<string> {
    const prefix = `TS-${year}-`;
    const lastTs = await db.timesheet.findFirst({
      where: { timesheetNumber: { startsWith: prefix } },
      orderBy: { timesheetNumber: 'desc' },
      select: { timesheetNumber: true },
    });

    let nextNum = 1;
    if (lastTs && lastTs.timesheetNumber) {
      const parts = lastTs.timesheetNumber.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        nextNum = lastSeq + 1;
      }
    }

    const seq = String(nextNum).padStart(4, '0');
    return `${prefix}${seq}`;
  }

  /**
   * Generates or syncs timesheets for employees over a date period.
   */
  static async generateTimesheet(employeeId: string, startDate: Date | string, endDate: Date | string, createdById?: string) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const records = await db.attendanceRecord.findMany({
      where: {
        employeeId,
        date: { gte: start, lte: end },
      },
    });

    let scheduledMinutes = 0;
    let workedMinutes = 0;
    let overtimeMinutes = 0;
    let lateMinutes = 0;
    let earlyDepartureMinutes = 0;
    let absenceMinutes = 0;
    let leaveMinutes = 0;

    for (const r of records) {
      workedMinutes += r.workedMinutes;
      overtimeMinutes += r.overtimeMinutes;
      lateMinutes += r.lateMinutes;
      earlyDepartureMinutes += r.earlyDepartureMinutes;

      if (r.attendanceStatus === 'ON_LEAVE' || r.attendanceStatus === 'SICK_LEAVE') {
        leaveMinutes += 480; // 8 hours standard leave day
      } else if (r.attendanceStatus === 'ABSENT') {
        absenceMinutes += 480;
      }

      scheduledMinutes += 480;
    }

    const scheduledHours = Number((scheduledMinutes / 60).toFixed(2));
    const totalWorkedHours = Number((workedMinutes / 60).toFixed(2));
    const overtimeHours = Number((overtimeMinutes / 60).toFixed(2));
    const regularHours = Math.max(0, Number((totalWorkedHours - overtimeHours).toFixed(2)));
    const leaveHours = Number((leaveMinutes / 60).toFixed(2));
    const absenceHours = Number((absenceMinutes / 60).toFixed(2));

    const existing = await db.timesheet.findUnique({
      where: {
        employeeId_periodStart_periodEnd: {
          employeeId,
          periodStart: start,
          periodEnd: end,
        },
      },
    });

    if (existing && existing.isPayrollLocked) {
      throw new Error(`Timesheet ${existing.timesheetNumber} is locked by payroll and cannot be recalculated.`);
    }

    let timesheet: any;
    if (existing) {
      timesheet = await db.timesheet.update({
        where: { id: existing.id },
        data: {
          scheduledHours,
          workedHours: totalWorkedHours,
          regularHours,
          leaveHours,
          overtimeHours,
          lateMinutes,
          earlyDepartureMinutes,
          absenceHours,
        },
        include: { employee: true, records: true },
      });
    } else {
      const timesheetNumber = await this.generateTimesheetNumber(start.getFullYear());
      timesheet = await db.timesheet.create({
        data: {
          timesheetNumber,
          employeeId,
          periodStart: start,
          periodEnd: end,
          scheduledHours,
          workedHours: totalWorkedHours,
          regularHours,
          leaveHours,
          overtimeHours,
          lateMinutes,
          earlyDepartureMinutes,
          absenceHours,
          status: 'DRAFT',
        },
        include: { employee: true, records: true },
      });
    }

    // Link records to timesheet
    await db.attendanceRecord.updateMany({
      where: {
        employeeId,
        date: { gte: start, lte: end },
      },
      data: { timesheetId: timesheet.id },
    });

    if (createdById) {
      await AuditService.log({
        userId: createdById,
        action: 'GENERATE_TIMESHEET',
        resource: 'timesheets',
        resourceId: timesheet.id,
        details: { timesheetNumber: timesheet.timesheetNumber, employeeId, workedHours: totalWorkedHours },
      });
    }

    return timesheet;
  }

  /**
   * Lists timesheets with filters.
   */
  static async listTimesheets(filters: {
    employeeId?: string;
    status?: string;
    departmentId?: string;
    periodStart?: Date | string;
    periodEnd?: Date | string;
  } = {}) {
    const where: any = {};

    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.status && filters.status !== 'ALL') where.status = filters.status;
    if (filters.departmentId && filters.departmentId !== 'ALL') {
      where.employee = { departmentId: filters.departmentId };
    }

    return db.timesheet.findMany({
      where,
      orderBy: { periodStart: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            employeeNumber: true,
            department: { select: { id: true, name: true } },
            station: { select: { id: true, name: true } },
          },
        },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /**
   * Submits a draft timesheet for manager review.
   */
  static async submitTimesheet(timesheetId: string, submittedById?: string) {
    const timesheet = await db.timesheet.findUnique({ where: { id: timesheetId } });
    if (!timesheet) throw new Error('Timesheet not found.');
    if (timesheet.status !== 'DRAFT' && timesheet.status !== 'REJECTED') {
      throw new Error(`Timesheet is currently in ${timesheet.status} state.`);
    }

    const updated = await db.timesheet.update({
      where: { id: timesheetId },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });

    if (submittedById) {
      await AuditService.log({
        userId: submittedById,
        action: 'SUBMIT_TIMESHEET',
        resource: 'timesheets',
        resourceId: timesheetId,
        details: { timesheetNumber: timesheet.timesheetNumber },
      });
    }

    return updated;
  }

  /**
   * Manager or HR approves or rejects a timesheet.
   */
  static async reviewTimesheet(data: {
    timesheetId: string;
    decision: 'APPROVE' | 'REJECT';
    reviewerUserId: string;
    comments?: string;
  }) {
    const timesheet = await db.timesheet.findUnique({ where: { id: data.timesheetId } });
    if (!timesheet) throw new Error('Timesheet not found.');

    if (timesheet.isPayrollLocked) {
      throw new Error('Timesheet is locked and cannot be edited.');
    }

    const status = data.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    const updated = await db.timesheet.update({
      where: { id: data.timesheetId },
      data: {
        status,
        reviewedById: data.reviewerUserId,
        reviewedAt: new Date(),
        reviewerComments: data.comments || null,
        approvedById: data.decision === 'APPROVE' ? data.reviewerUserId : null,
        approvedAt: data.decision === 'APPROVE' ? new Date() : null,
      },
    });

    // If approved, update linked attendance records approvalStatus
    if (data.decision === 'APPROVE') {
      await db.attendanceRecord.updateMany({
        where: { timesheetId: data.timesheetId },
        data: {
          approvalStatus: 'APPROVED',
          approvedById: data.reviewerUserId,
          approvedAt: new Date(),
        },
      });
    }

    await AuditService.log({
      userId: data.reviewerUserId,
      action: `${data.decision}_TIMESHEET`,
      resource: 'timesheets',
      resourceId: data.timesheetId,
      details: { decision: data.decision, comments: data.comments },
    });

    return updated;
  }

  /**
   * Locks timesheets associated with a finalized payroll period.
   */
  static async lockTimesheetsForPeriod(startDate: Date | string, endDate: Date | string, lockerUserId?: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const result = await db.timesheet.updateMany({
      where: {
        periodStart: { gte: start },
        periodEnd: { lte: end },
        status: 'APPROVED',
      },
      data: {
        status: 'LOCKED',
        isPayrollLocked: true,
        lockedById: lockerUserId || null,
        lockedAt: new Date(),
      },
    });

    await db.attendanceRecord.updateMany({
      where: {
        date: { gte: start, lte: end },
        approvalStatus: 'APPROVED',
      },
      data: {
        approvalStatus: 'LOCKED',
        lockedById: lockerUserId || null,
        lockedAt: new Date(),
      },
    });

    if (lockerUserId) {
      await AuditService.log({
        userId: lockerUserId,
        action: 'LOCK_ATTENDANCE_FOR_PAYROLL',
        resource: 'timesheets',
        resourceId: `period-${startDate}-${endDate}`,
        details: { lockedCount: result.count },
      });
    }

    return result;
  }
}
