import { db } from '../db';
import { LeaveBalanceService } from './LeaveBalanceService';

export class LeaveReportService {
  /**
   * Generates Leave Register Report
   */
  static async generateLeaveRegister(year: number = new Date().getFullYear(), format: 'json' | 'csv' = 'json') {
    const requests = await db.leaveRequest.findMany({
      where: { leaveYear: year },
      orderBy: { startDate: 'desc' },
      include: {
        employee: {
          select: { employeeNumber: true, fullName: true, department: { select: { name: true } } },
        },
        leaveType: { select: { name: true, isPaid: true } },
        reviewedBy: { select: { firstName: true, lastName: true } },
      },
    });

    if (format === 'csv') {
      const headers = ['Request Number', 'Employee #', 'Full Name', 'Department', 'Leave Type', 'Paid', 'Start Date', 'End Date', 'Days', 'Status', 'Approved By', 'Date Reviewed'];
      const rows = requests.map((r) => [
        `"${r.requestNumber}"`,
        `"${r.employee.employeeNumber}"`,
        `"${r.employee.fullName}"`,
        `"${r.employee.department?.name || 'General'}"`,
        `"${r.leaveType.name}"`,
        r.leaveType.isPaid ? 'Yes' : 'No',
        r.startDate.toISOString().split('T')[0],
        r.endDate.toISOString().split('T')[0],
        r.durationDays,
        r.status,
        r.reviewedBy ? `"${r.reviewedBy.firstName} ${r.reviewedBy.lastName}"` : '—',
        r.reviewedAt ? r.reviewedAt.toISOString().split('T')[0] : '—',
      ]);
      return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    }

    return requests;
  }

  /**
   * Generates Leave Balance Report
   */
  static async generateLeaveBalances(year: number = new Date().getFullYear(), format: 'json' | 'csv' = 'json') {
    const entitlements = await db.leaveEntitlement.findMany({
      where: { leaveYear: year, status: 'ACTIVE' },
      orderBy: { employee: { fullName: 'asc' } },
      include: {
        employee: {
          select: { employeeNumber: true, fullName: true, department: { select: { name: true } } },
        },
        leaveType: { select: { name: true } },
      },
    });

    const data = entitlements.map((ent) => {
      const closing = LeaveBalanceService.calculateClosingBalance(ent);
      const remaining = Math.max(0, Math.round((closing - ent.pendingDays) * 100) / 100);

      return {
        employeeNumber: ent.employee.employeeNumber,
        fullName: ent.employee.fullName,
        departmentName: ent.employee.department?.name || 'General',
        leaveTypeName: ent.leaveType.name,
        openingBalance: ent.openingBalance,
        entitledDays: ent.entitledDays,
        accruedDays: ent.accruedDays,
        carriedForwardDays: ent.carriedForwardDays,
        adjustmentDays: ent.adjustmentDays,
        usedDays: ent.usedDays,
        pendingDays: ent.pendingDays,
        expiredDays: ent.expiredDays,
        closingBalance: closing,
        availableBalance: remaining,
      };
    });

    if (format === 'csv') {
      const headers = ['Employee #', 'Full Name', 'Department', 'Leave Type', 'Entitlement', 'Accrued', 'Carried Forward', 'Adjustments', 'Used', 'Pending', 'Remaining'];
      const rows = data.map((d) => [
        `"${d.employeeNumber}"`,
        `"${d.fullName}"`,
        `"${d.departmentName}"`,
        `"${d.leaveTypeName}"`,
        d.entitledDays,
        d.accruedDays,
        d.carriedForwardDays,
        d.adjustmentDays,
        d.usedDays,
        d.pendingDays,
        d.availableBalance,
      ]);
      return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    }

    return data;
  }

  /**
   * Generates Absence Report
   */
  static async generateAbsenceReport(year: number = new Date().getFullYear(), format: 'json' | 'csv' = 'json') {
    const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
    const endOfYear = new Date(`${year}-12-31T23:59:59.999Z`);

    const absences = await db.leaveAbsence.findMany({
      where: { date: { gte: startOfYear, lte: endOfYear } },
      orderBy: { date: 'desc' },
      include: {
        employee: {
          select: { employeeNumber: true, fullName: true, department: { select: { name: true } } },
        },
      },
    });

    if (format === 'csv') {
      const headers = ['Absence #', 'Employee #', 'Full Name', 'Department', 'Date', 'Type', 'Reason', 'Status'];
      const rows = absences.map((a) => [
        `"${a.absenceNumber}"`,
        `"${a.employee.employeeNumber}"`,
        `"${a.employee.fullName}"`,
        `"${a.employee.department?.name || 'General'}"`,
        a.date.toISOString().split('T')[0],
        a.absenceType,
        `"${a.reason.replace(/"/g, '""')}"`,
        a.status,
      ]);
      return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    }

    return absences;
  }
}
