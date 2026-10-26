import { db } from '@/lib/db';
import { AttendanceCalculationService } from './AttendanceCalculationService';
import { AuditService } from '@/lib/audit';

export interface ImportRow {
  employeeNumber: string;
  date: string;
  clockIn?: string;
  clockOut?: string;
  source?: string;
  device?: string;
  notes?: string;
}

export class AttendanceImportService {
  /**
   * Parses CSV string into structured rows.
   */
  static parseCsv(csvText: string): ImportRow[] {
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length <= 1) return [];

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const empNumIdx = headers.findIndex((h) => h.includes('employee') || h.includes('staff') || h.includes('payroll'));
    const dateIdx = headers.findIndex((h) => h === 'date' || h.includes('day'));
    const clockInIdx = headers.findIndex((h) => h.includes('clock in') || h.includes('in time') || h.includes('start'));
    const clockOutIdx = headers.findIndex((h) => h.includes('clock out') || h.includes('out time') || h.includes('end'));
    const sourceIdx = headers.findIndex((h) => h.includes('source') || h.includes('device') || h.includes('terminal'));

    const rows: ImportRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
      if (parts.length < 2) continue;

      const employeeNumber = parts[empNumIdx >= 0 ? empNumIdx : 0];
      const date = parts[dateIdx >= 0 ? dateIdx : 1];
      const clockIn = clockInIdx >= 0 ? parts[clockInIdx] : undefined;
      const clockOut = clockOutIdx >= 0 ? parts[clockOutIdx] : undefined;
      const source = sourceIdx >= 0 ? parts[sourceIdx] : 'IMPORT';

      if (employeeNumber && date) {
        rows.push({
          employeeNumber,
          date,
          clockIn: clockIn || undefined,
          clockOut: clockOut || undefined,
          source: source || 'IMPORT',
        });
      }
    }

    return rows;
  }

  /**
   * Previews CSV rows and flags potential validation errors before execution.
   */
  static async previewImport(rows: ImportRow[]) {
    const validated = [];
    let validCount = 0;
    let errorCount = 0;

    for (const row of rows) {
      const emp = await db.employee.findFirst({
        where: { employeeNumber: row.employeeNumber.trim(), deletedAt: null },
        select: { id: true, fullName: true, employeeNumber: true },
      });

      let status = 'VALID';
      let error = null;

      if (!emp) {
        status = 'ERROR';
        error = `Employee with number '${row.employeeNumber}' does not exist.`;
        errorCount++;
      } else if (isNaN(new Date(row.date).getTime())) {
        status = 'ERROR';
        error = `Invalid date format '${row.date}'. Expected YYYY-MM-DD.`;
        errorCount++;
      } else {
        validCount++;
      }

      validated.push({
        ...row,
        employeeName: emp?.fullName || 'Unknown',
        employeeId: emp?.id,
        status,
        error,
      });
    }

    return {
      rows: validated,
      validCount,
      errorCount,
      total: rows.length,
    };
  }

  /**
   * Executes batch import of valid rows.
   */
  static async executeImport(rows: ImportRow[], importedById?: string) {
    let importedCount = 0;
    const errors = [];

    for (const row of rows) {
      try {
        const emp = await db.employee.findFirst({
          where: { employeeNumber: row.employeeNumber.trim(), deletedAt: null },
        });
        if (!emp) {
          errors.push({ row, error: `Employee ${row.employeeNumber} not found` });
          continue;
        }

        const date = new Date(row.date);
        date.setHours(0, 0, 0, 0);

        let inDate: Date | null = null;
        if (row.clockIn) {
          if (row.clockIn.includes('T') || row.clockIn.includes('-')) {
            inDate = new Date(row.clockIn);
          } else {
            const [h, m] = row.clockIn.split(':').map((x) => parseInt(x, 10));
            inDate = new Date(date);
            inDate.setHours(h || 0, m || 0, 0, 0);
          }
        }

        let outDate: Date | null = null;
        if (row.clockOut) {
          if (row.clockOut.includes('T') || row.clockOut.includes('-')) {
            outDate = new Date(row.clockOut);
          } else {
            const [h, m] = row.clockOut.split(':').map((x) => parseInt(x, 10));
            outDate = new Date(date);
            outDate.setHours(h || 0, m || 0, 0, 0);
          }
        }

        const calc = AttendanceCalculationService.calculateAttendance(
          '08:00',
          '17:00',
          inDate,
          outDate
        );

        await db.attendanceRecord.upsert({
          where: {
            employeeId_date: {
              employeeId: emp.id,
              date,
            },
          },
          update: {
            actualClockIn: inDate || undefined,
            actualClockOut: outDate || undefined,
            workedMinutes: calc.workedMinutes,
            lateMinutes: calc.lateMinutes,
            overtimeMinutes: calc.overtimeMinutes,
            attendanceStatus: inDate ? (calc.isLate ? 'LATE' : 'PRESENT') : 'ABSENT',
            source: row.source || 'IMPORT',
          },
          create: {
            employeeId: emp.id,
            date,
            actualClockIn: inDate,
            actualClockOut: outDate,
            workedMinutes: calc.workedMinutes,
            lateMinutes: calc.lateMinutes,
            overtimeMinutes: calc.overtimeMinutes,
            attendanceStatus: inDate ? (calc.isLate ? 'LATE' : 'PRESENT') : 'ABSENT',
            source: row.source || 'IMPORT',
          },
        });

        importedCount++;
      } catch (err: any) {
        errors.push({ row, error: err.message });
      }
    }

    if (importedById) {
      await AuditService.log({
        userId: importedById,
        action: 'IMPORT_ATTENDANCE_CSV',
        resource: 'attendance_records',
        resourceId: `import-${Date.now()}`,
        details: { importedCount, total: rows.length, errorsCount: errors.length },
      });
    }

    return {
      importedCount,
      errorsCount: errors.length,
      errors,
    };
  }

  /**
   * Legacy alias: Validates CSV text and returns structured preview with totalRows.
   */
  static async validateAndPreview(csvText: string) {
    const rows = this.parseCsv(csvText);
    const preview = await this.previewImport(rows);
    return {
      totalRows: preview.total,
      validCount: preview.validCount,
      errorCount: preview.errorCount,
      rows: preview.rows,
    };
  }
}
