import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { evaluatePayrollReadiness } from '@/lib/payroll-config-validator';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['payroll_config.view', 'salary.view', 'payroll.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const employees = await db.employee.findMany({
      where: {
        deletedAt: null,
        isArchived: false,
        employmentStatus: 'ACTIVE',
      },
      select: {
        id: true,
        employeeNumber: true,
        fullName: true,
        employmentStatus: true,
        kraPin: true,
        nssfNumber: true,
        shaNumber: true,
        preferredPaymentMethod: true,
        bankAccountNumber: true,
        bankName: true,
        mpesaPhoneNumber: true,
        salaryRecords: {
          where: { status: 'ACTIVE' },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          select: {
            basicSalary: true,
            status: true,
            effectiveFrom: true,
          },
        },
      },
    });

    const formattedList = employees.map((emp) => ({
      id: emp.id,
      fullName: emp.fullName,
      employeeNumber: emp.employeeNumber,
      employmentStatus: emp.employmentStatus,
      kraPin: emp.kraPin,
      nssfNumber: emp.nssfNumber,
      shaNumber: emp.shaNumber,
      preferredPaymentMethod: emp.preferredPaymentMethod,
      bankAccountNumber: emp.bankAccountNumber,
      bankName: emp.bankName,
      mpesaPhoneNumber: emp.mpesaPhoneNumber,
      activeSalary: emp.salaryRecords[0] || null,
    }));

    const result = evaluatePayrollReadiness(formattedList);
    return apiSuccess(result);
  } catch (error) {
    console.error('Fetch payroll readiness error:', error);
    return apiError('Failed to run payroll readiness diagnostic');
  }
}
