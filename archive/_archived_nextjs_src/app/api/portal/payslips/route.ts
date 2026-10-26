import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { resolveSessionEmployee } from '@/lib/portal/PortalAuth';
import { apiSuccess, apiError } from '@/lib/response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authContext = await resolveSessionEmployee();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { employee } = authContext;

    // Fetch finalized employee records for authenticated employee only
    const records = await db.payrollEmployeeRecord.findMany({
      where: {
        employeeId: employee.id,
        payrollRun: {
          status: { in: ['FINALIZED', 'PAID', 'APPROVED'] },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        payrollRun: {
          include: {
            payrollPeriod: true,
          },
        },
      },
    });

    const payslips = records.map((rec) => {
      const period = rec.payrollRun.payrollPeriod;
      return {
        id: rec.id,
        payrollRecordId: rec.id,
        payrollPeriodId: period.id,
        periodName: period.name,
        periodNumber: period.periodNumber,
        payrollMonth: period.payrollMonth,
        payrollYear: period.payrollYear,
        runNumber: rec.payrollRun.runNumber,
        basicSalary: rec.basicSalary,
        grossEarnings: rec.grossPay,
        totalDeductions: rec.totalDeductions,
        netPay: rec.netPay,
        paymentStatus: rec.paymentStatus || 'PENDING',
        paymentMethod: rec.paymentMethod,
        payDate: period.paymentDate ? period.paymentDate.toISOString() : null,
        createdAt: rec.createdAt,
      };
    });

    return apiSuccess(payslips);
  } catch (error: any) {
    console.error('Error fetching employee payslips:', error);
    return apiError(error.message || 'Failed to load employee payslips');
  }
}
