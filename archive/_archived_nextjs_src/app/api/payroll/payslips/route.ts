import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { PayslipFormatter } from '@/lib/payroll-reports/PayslipFormatter';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['payslip.view']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const periodId = searchParams.get('periodId');
    const runId = searchParams.get('runId');
    const employeeId = searchParams.get('employeeId');
    const departmentId = searchParams.get('departmentId');
    const stationId = searchParams.get('stationId');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

    // If regular employee, enforce self-service isolation (only their own records)
    const isEmployeeOnly = auth.user.roles.includes('employee') && !auth.user.roles.some((r) => ['super_admin', 'hr_admin', 'hr_manager', 'payroll_officer', 'finance'].includes(r));

    const where: any = {};

    if (isEmployeeOnly) {
      // Find employee linked to this user by email
      const emp = await prisma.employee.findFirst({
        where: { email: auth.user.email },
      });
      if (!emp) {
        return apiSuccess([], { total: 0, page: 1, pageSize, totalPages: 0 });
      }
      where.employeeId = emp.id;
    } else if (employeeId) {
      where.employeeId = employeeId;
    }

    if (runId) {
      where.payrollRunId = runId;
    } else if (periodId) {
      where.payrollRun = { payrollPeriodId: periodId };
    }

    if (departmentId) {
      where.employee = { ...where.employee, departmentId };
    }

    if (stationId) {
      where.employee = { ...where.employee, stationId };
    }

    if (search) {
      where.OR = [
        { employee: { fullName: { contains: search } } },
        { employee: { employeeNumber: { contains: search } } },
        { kraPin: { contains: search } },
      ];
    }

    const [total, records, companySettings] = await Promise.all([
      prisma.payrollEmployeeRecord.count({ where }),
      prisma.payrollEmployeeRecord.findMany({
        where,
        include: {
          payrollRun: {
            include: { payrollPeriod: true },
          },
          employee: {
            include: {
              department: true,
              branch: true,
              station: true,
              position: true,
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { employee: { employeeNumber: 'asc' } },
      }),
      prisma.companySetting.findFirst(),
    ]);

    const formattedList = records.map((r) => PayslipFormatter.format(r, companySettings));

    return apiSuccess(formattedList, {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to fetch payslips', 500);
  }
}
