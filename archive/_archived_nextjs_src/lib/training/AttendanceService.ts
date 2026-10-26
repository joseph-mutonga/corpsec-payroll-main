import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export interface RecordAttendanceInput {
  enrollmentId?: string;
  sessionId: string;
  employeeId: string;
  date: Date;
  checkInTime?: Date;
  checkOutTime?: Date;
  hoursAttended?: number;
  status: 'PRESENT' | 'PARTIAL' | 'ABSENT' | 'EXCUSED' | 'NO_SHOW';
  remarks?: string;
  markedById?: string;
}

export class AttendanceService {
  static async recordAttendance(data: RecordAttendanceInput) {
    let enrollmentId = data.enrollmentId;
    if (!enrollmentId) {
      const enrollment = await db.trainingEnrollment.findUnique({
        where: {
          sessionId_employeeId: {
            sessionId: data.sessionId,
            employeeId: data.employeeId,
          },
        },
      });
      if (!enrollment) throw new Error('Employee is not enrolled in this training session.');
      enrollmentId = enrollment.id;
    }

    const attendanceDate = new Date(data.date);
    attendanceDate.setHours(0, 0, 0, 0);

    const existing = await db.trainingAttendance.findUnique({
      where: {
        sessionId_employeeId_date: {
          sessionId: data.sessionId,
          employeeId: data.employeeId,
          date: attendanceDate,
        },
      },
    });

    if (existing && existing.isFinalized) {
      throw new Error('Attendance for this session and date is finalized and cannot be modified.');
    }

    let hours = data.hoursAttended;
    if (hours === undefined) {
      if (data.checkInTime && data.checkOutTime) {
        const diffMs = new Date(data.checkOutTime).getTime() - new Date(data.checkInTime).getTime();
        hours = Math.max(0, Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10);
      } else {
        hours = data.status === 'PRESENT' ? 8 : data.status === 'PARTIAL' ? 4 : 0;
      }
    }

    const attendance = await db.trainingAttendance.upsert({
      where: {
        sessionId_employeeId_date: {
          sessionId: data.sessionId,
          employeeId: data.employeeId,
          date: attendanceDate,
        },
      },
      create: {
        enrollmentId,
        sessionId: data.sessionId,
        employeeId: data.employeeId,
        date: attendanceDate,
        checkInTime: data.checkInTime ? new Date(data.checkInTime) : undefined,
        checkOutTime: data.checkOutTime ? new Date(data.checkOutTime) : undefined,
        hoursAttended: Number(hours),
        status: data.status,
        remarks: data.remarks,
        markedById: data.markedById,
      },
      update: {
        checkInTime: data.checkInTime ? new Date(data.checkInTime) : undefined,
        checkOutTime: data.checkOutTime ? new Date(data.checkOutTime) : undefined,
        hoursAttended: Number(hours),
        status: data.status,
        remarks: data.remarks,
        markedById: data.markedById,
      },
    });

    // Update enrollment status to ATTENDED if present/partial
    if (data.status === 'PRESENT' || data.status === 'PARTIAL') {
      await db.trainingEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'ATTENDED' },
      });
    }

    return attendance;
  }

  static async bulkRecordAttendance(
    sessionId: string,
    date: Date,
    records: Array<{
      employeeId: string;
      status: 'PRESENT' | 'PARTIAL' | 'ABSENT' | 'EXCUSED' | 'NO_SHOW';
      checkInTime?: Date;
      checkOutTime?: Date;
      hoursAttended?: number;
      remarks?: string;
    }>,
    markedById?: string
  ) {
    const results = [];
    for (const rec of records) {
      const res = await this.recordAttendance({
        sessionId,
        employeeId: rec.employeeId,
        date,
        status: rec.status,
        checkInTime: rec.checkInTime,
        checkOutTime: rec.checkOutTime,
        hoursAttended: rec.hoursAttended,
        remarks: rec.remarks,
        markedById,
      });
      results.push(res);
    }

    await AuditService.log({
      userId: markedById,
      action: 'BULK_RECORD_TRAINING_ATTENDANCE',
      module: 'TRAINING',
      entityId: sessionId,
      newValue: { sessionId, date, count: records.length },
    });

    return results;
  }

  static async finalizeSessionAttendance(sessionId: string, date: Date, markedById?: string) {
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    const updated = await db.trainingAttendance.updateMany({
      where: {
        sessionId,
        date: attendanceDate,
      },
      data: {
        isFinalized: true,
      },
    });

    await AuditService.log({
      userId: markedById,
      action: 'FINALIZE_TRAINING_ATTENDANCE',
      module: 'TRAINING',
      entityId: sessionId,
      newValue: { sessionId, date: attendanceDate, finalizedCount: updated.count },
    });

    return updated;
  }

  static async getSessionRoster(sessionId: string, date?: Date) {
    const session = await db.trainingSession.findUnique({
      where: { id: sessionId },
      include: { course: true, venue: true, trainer: true },
    });
    if (!session) throw new Error('Training session not found.');

    const enrollments = await db.trainingEnrollment.findMany({
      where: {
        sessionId,
        status: { in: ['APPROVED', 'ENROLLED', 'ATTENDED', 'COMPLETED'] },
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            department: { select: { id: true, name: true } },
            station: { select: { id: true, name: true } },
          },
        },
        attendances: date ? { where: { date: new Date(date) } } : true,
      },
    });

    return {
      session,
      roster: enrollments.map((enr) => ({
        enrollmentId: enr.id,
        employee: enr.employee,
        enrollmentStatus: enr.status,
        attendance: enr.attendances[0] || null,
      })),
    };
  }

  static async getEmployeeAttendanceHistory(employeeId: string) {
    return db.trainingAttendance.findMany({
      where: { employeeId },
      orderBy: { date: 'desc' },
      include: {
        session: {
          include: {
            course: true,
            venue: true,
            trainer: true,
          },
        },
      },
    });
  }
}
