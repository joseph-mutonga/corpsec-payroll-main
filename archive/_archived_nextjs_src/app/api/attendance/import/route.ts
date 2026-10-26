import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/auth-helpers';
import { evaluateAttendance, ShiftInfo } from '@/lib/attendance-calculator';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(['attendance.create', 'attendance.edit']);
    const body = await req.json();

    const { rows, mode = 'preview' } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return errorResponse('Import file must contain at least one valid attendance row', 400);
    }

    if (rows.length > 1000) {
      return errorResponse('Import batch is limited to 1,000 records per upload', 400);
    }

    // Preload employees and shifts for fast batch matching
    const [allEmployees, allShifts] = await Promise.all([
      db.employee.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          employeeNumber: true,
          nationalId: true,
          fullName: true,
          shiftAssignments: {
            where: { status: 'ACTIVE' },
            include: { shift: true },
            take: 1,
          },
        },
      }),
      db.shift.findMany({
        where: { deletedAt: null },
      }),
    ]);

    const empByNum = new Map(allEmployees.map((e) => [e.employeeNumber.toUpperCase(), e]));
    const empByNatId = new Map(allEmployees.map((e) => [e.nationalId, e]));
    const shiftByCode = new Map(allShifts.map((s) => [s.code.toUpperCase(), s]));

    const previewResults: any[] = [];
    const validBatchToCommit: any[] = [];
    let validCount = 0;
    let errorCount = 0;

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNumber = index + 1;
      const errors: string[] = [];

      // 1. Identify Employee
      const empIdentifier = (row.employeeNumber || row.employeeId || row.nationalId || '').trim();
      if (!empIdentifier) {
        errors.push('Missing employee identifier (EmployeeNumber or NationalId required)');
      }

      const emp =
        empByNum.get(empIdentifier.toUpperCase()) ||
        empByNatId.get(empIdentifier) ||
        null;

      if (!emp && empIdentifier) {
        errors.push(`Employee "${empIdentifier}" not found in system directory`);
      }

      // 2. Validate Work Date
      const dateStr = (row.date || row.workDate || '').trim();
      if (!dateStr || isNaN(Date.parse(dateStr))) {
        errors.push('Invalid or missing work date (YYYY-MM-DD expected)');
      }
      const workDate = dateStr ? new Date(dateStr) : new Date();
      workDate.setHours(0, 0, 0, 0);

      // 3. Resolve Shift
      let shift = (row.shiftCode ? shiftByCode.get(row.shiftCode.trim().toUpperCase()) : null) ||
        emp?.shiftAssignments[0]?.shift || null;

      // 4. Parse Clock Times
      let clockIn: Date | null = null;
      let clockOut: Date | null = null;

      if (row.clockIn) {
        const timeInStr = row.clockIn.trim();
        if (timeInStr.includes('T') || timeInStr.includes(' ')) {
          clockIn = new Date(timeInStr);
        } else if (/^\d{1,2}:\d{2}/.test(timeInStr)) {
          const [h, m] = timeInStr.split(':').map((v: string) => parseInt(v, 10));
          clockIn = new Date(workDate);
          clockIn.setHours(h, m, 0, 0);
        }
      }

      if (row.clockOut) {
        const timeOutStr = row.clockOut.trim();
        if (timeOutStr.includes('T') || timeOutStr.includes(' ')) {
          clockOut = new Date(timeOutStr);
        } else if (/^\d{1,2}:\d{2}/.test(timeOutStr)) {
          const [h, m] = timeOutStr.split(':').map((v: string) => parseInt(v, 10));
          clockOut = new Date(workDate);
          if (shift?.isOvernight) {
            clockOut.setDate(clockOut.getDate() + 1);
          }
          clockOut.setHours(h, m, 0, 0);
        }
      }

      if (clockIn && clockOut && clockOut.getTime() < clockIn.getTime()) {
        errors.push('Clock out time cannot be earlier than clock in time');
      }

      // 5. Evaluate Metrics
      let evalResult: any = {
        workedMinutes: 0,
        workedHours: 0,
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        overtimeMinutes: 0,
        overtimeHours: 0,
        attendanceStatus: 'ABSENT',
      };

      if (emp) {
        const shiftInfo: ShiftInfo | null = shift
          ? {
              startTime: shift.startTime,
              endTime: shift.endTime,
              isOvernight: shift.isOvernight,
              gracePeriodMinutes: shift.gracePeriodMinutes,
              breakDurationMinutes: shift.breakDurationMinutes,
              isBreakPaid: shift.isBreakPaid,
            }
          : null;

        evalResult = evaluateAttendance({
          workDate,
          shift: shiftInfo,
          actualClockIn: clockIn,
          actualClockOut: clockOut,
          existingStatus: row.status,
        });
      }

      const isValid = errors.length === 0;
      if (isValid) {
        validCount++;
        validBatchToCommit.push({
          employeeId: emp!.id,
          date: workDate,
          scheduledShiftId: shift?.id || null,
          scheduledStartTime: shift?.startTime || null,
          scheduledEndTime: shift?.endTime || null,
          actualClockIn: clockIn,
          actualClockOut: clockOut,
          breakDurationMinutes: shift?.breakDurationMinutes || 0,
          workedMinutes: evalResult.workedMinutes,
          lateMinutes: evalResult.lateMinutes,
          earlyDepartureMinutes: evalResult.earlyDepartureMinutes,
          overtimeMinutes: evalResult.overtimeMinutes,
          attendanceStatus: row.status || evalResult.attendanceStatus,
          source: 'IMPORT',
          notes: row.notes || 'Batch CSV import',
          approvalStatus: 'SUBMITTED',
        });
      } else {
        errorCount++;
      }

      previewResults.push({
        rowNumber,
        employeeIdentifier: empIdentifier,
        employeeName: emp?.fullName || 'N/A',
        workDate: dateStr,
        shiftCode: shift?.code || 'DEFAULT',
        clockIn: clockIn ? clockIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
        clockOut: clockOut ? clockOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
        workedHours: evalResult.workedHours,
        status: row.status || evalResult.attendanceStatus,
        isValid,
        errors,
      });
    }

    if (mode === 'preview') {
      return successResponse({
        mode: 'preview',
        totalRows: rows.length,
        validCount,
        errorCount,
        canCommit: errorCount === 0 && validCount > 0,
        rows: previewResults,
      });
    }

    // Commit mode
    if (errorCount > 0) {
      return errorResponse(`Cannot commit import because ${errorCount} row(s) have validation errors. Please fix and re-upload.`, 400);
    }

    let committedCount = 0;
    await db.$transaction(async (tx) => {
      for (const item of validBatchToCommit) {
        await tx.attendanceRecord.upsert({
          where: {
            employeeId_date: {
              employeeId: item.employeeId,
              date: item.date,
            },
          },
          update: item,
          create: item,
        });
        committedCount++;
      }
    });

    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'IMPORT_ATTENDANCE_BATCH',
      module: 'ATTENDANCE',
      entityType: 'AttendanceRecord',
      newValue: JSON.stringify({
        totalImported: committedCount,
        timestamp: new Date(),
      }),
    });

    return successResponse(
      {
        mode: 'commit',
        committedCount,
      },
      `Successfully imported and verified ${committedCount} attendance records!`,
      201
    );
  } catch (error: any) {
    return errorResponse(error.message || 'Failed to process attendance import', error.status || 500);
  }
}
