import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { resolveSessionEmployee } from '@/lib/portal/PortalAuth';
import { apiSuccess, apiError, apiNotFound, apiForbidden } from '@/lib/response';
import { PayslipFormatter } from '@/lib/payroll-reports/PayslipFormatter';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authContext = await resolveSessionEmployee();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { employee, isHRAdmin } = authContext;
    const recordId = params.id;

    const record = await db.payrollEmployeeRecord.findUnique({
      where: { id: recordId },
      include: {
        employee: {
          include: {
            department: true,
            position: true,
            station: true,
            branch: true,
          },
        },
        payrollRun: {
          include: {
            payrollPeriod: true,
          },
        },
      },
    });

    if (!record) {
      return apiNotFound('Payslip record not found');
    }

    // IDOR Protection: Employee can only view their own payslip
    if (!isHRAdmin && record.employeeId !== employee.id) {
      return apiForbidden("Access Denied: You cannot view another employee's payslip.");
    }

    const companySetting = await db.companySetting.findFirst();
    const formatted = PayslipFormatter.format(record, companySetting);

    return apiSuccess(formatted);
  } catch (error: any) {
    console.error('Error fetching employee payslip detail:', error);
    return apiError(error.message || 'Failed to load employee payslip');
  }
}
