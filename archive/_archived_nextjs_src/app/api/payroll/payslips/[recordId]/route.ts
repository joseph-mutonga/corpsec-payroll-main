import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { PayslipFormatter } from '@/lib/payroll-reports/PayslipFormatter';

export async function GET(
  req: NextRequest,
  { params }: { params: { recordId: string } | Promise<{ recordId: string }> }
) {
  try {
    const auth = await requireAuth(req, ['payslip.view']);
    if (auth.error) return auth.error;

    const resolvedParams = await Promise.resolve(params);
    const recordId = resolvedParams.recordId;

    const record = await prisma.payrollEmployeeRecord.findUnique({
      where: { id: recordId },
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
    });

    if (!record) {
      return apiError('Employee payroll record not found', 404);
    }

    // If employee persona, ensure they only access their own record
    const isEmployeeOnly = auth.user.roles.includes('employee') && !auth.user.roles.some((r) => ['super_admin', 'hr_admin', 'hr_manager', 'payroll_officer', 'finance'].includes(r));
    if (isEmployeeOnly && record.employee?.email !== auth.user.email) {
      return apiError('Access denied. You can only view your own payslips.', 403);
    }

    const companySettings = await prisma.companySetting.findFirst();
    const formatted = PayslipFormatter.format(record, companySettings);

    // Update payslipViewedAt and log audit
    await Promise.all([
      prisma.payrollEmployeeRecord.update({
        where: { id: record.id },
        data: { payslipViewedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          userId: auth.user.id,
          userEmail: auth.user.email,
          action: 'PAYSLIP_VIEWED',
          module: 'PAYROLL',
          entityType: 'PayrollEmployeeRecord',
          entityId: record.id,
          newValue: JSON.stringify({
            employeeNumber: record.employee?.employeeNumber,
            employeeName: record.employee?.fullName,
            runNumber: record.payrollRun?.runNumber,
            netPay: record.netPay,
          }),
        },
      }),
    ]);

    return apiSuccess(formatted);
  } catch (err: any) {
    return apiError(err.message || 'Failed to fetch payslip details', 500);
  }
}
