import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['payroll_config.view', 'salary.view', 'payroll.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const [
      activePeriod,
      activeEmployeesCount,
      activeSalaries,
      pendingProposalsCount,
      allowanceTypesCount,
      deductionTypesCount,
      statutoryRulesCount,
    ] = await Promise.all([
      db.payrollPeriod.findFirst({
        where: {
          payrollYear: currentYear,
          payrollMonth: currentMonth,
        },
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          lockedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      db.employee.count({
        where: { deletedAt: null, isArchived: false, employmentStatus: 'ACTIVE' },
      }),
      db.salaryRecord.findMany({
        where: { status: 'ACTIVE' },
        select: { basicSalary: true, employeeId: true },
      }),
      db.salaryRecord.count({
        where: { status: 'PENDING_APPROVAL' },
      }),
      db.allowanceType.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      db.deductionType.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      db.statutoryRule.count({
        where: { status: 'ACTIVE' },
      }),
    ]);

    // Unique employees with active salary
    const uniqueEmpsWithSalary = new Set(activeSalaries.map((s) => s.employeeId)).size;
    const totalEmployeesMissingSalary = Math.max(0, activeEmployeesCount - uniqueEmpsWithSalary);
    const totalMonthlyBasePayrollKES = activeSalaries.reduce((acc, s) => acc + s.basicSalary, 0);

    return apiSuccess({
      activePayrollPeriod: activePeriod,
      totalEmployeesWithSalary: uniqueEmpsWithSalary,
      totalEmployeesMissingSalary,
      pendingSalaryProposals: pendingProposalsCount,
      activeAllowanceTypesCount: allowanceTypesCount,
      activeDeductionTypesCount: deductionTypesCount,
      activeStatutoryRulesCount: statutoryRulesCount,
      totalMonthlyBasePayrollKES,
    });
  } catch (error) {
    console.error('Fetch payroll stats error:', error);
    return apiError('Failed to fetch payroll configuration statistics');
  }
}
