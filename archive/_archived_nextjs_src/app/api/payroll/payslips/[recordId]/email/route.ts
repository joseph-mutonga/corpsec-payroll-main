import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';

export async function POST(
  req: NextRequest,
  { params }: { params: { recordId: string } | Promise<{ recordId: string }> }
) {
  try {
    const auth = await requireAuth(req, ['payslip.email']);
    if (auth.error) return auth.error;

    const resolvedParams = await Promise.resolve(params);
    const recordId = resolvedParams.recordId;

    const record = await prisma.payrollEmployeeRecord.findUnique({
      where: { id: recordId },
      include: {
        employee: true,
        payrollRun: { include: { payrollPeriod: true } },
      },
    });

    if (!record) {
      return apiError('Employee payroll record not found', 404);
    }

    const emailTarget = record.employee.email || `${record.employee.employeeNumber.toLowerCase()}@corpsec.co.ke`;

    const updated = await prisma.payrollEmployeeRecord.update({
      where: { id: record.id },
      data: {
        payslipSentAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'PAYSLIP_EMAILED',
        module: 'PAYROLL',
        entityType: 'PayrollEmployeeRecord',
        entityId: record.id,
        newValue: JSON.stringify({
          employeeNumber: record.employee.employeeNumber,
          recipientEmail: emailTarget,
          runNumber: record.payrollRun.runNumber,
          period: record.payrollRun.payrollPeriod.name,
          netPay: record.netPay,
        }),
      },
    });

    return apiSuccess({
      recordId: updated.id,
      recipientEmail: emailTarget,
      sentAt: updated.payslipSentAt,
      message: `Payslip for ${record.employee.fullName} queued and sent to ${emailTarget}`,
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to dispatch payslip email', 500);
  }
}
