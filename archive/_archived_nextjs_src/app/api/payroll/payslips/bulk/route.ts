import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { PayslipFormatter } from '@/lib/payroll-reports/PayslipFormatter';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['payslip.bulk']);
    if (auth.error) return auth.error;

    const body = await req.json();
    const { runId, periodId, recordIds, departmentId, stationId } = body;

    if (!runId && !periodId && (!recordIds || recordIds.length === 0)) {
      return apiError('Either runId, periodId, or recordIds must be specified for bulk generation', 400);
    }

    const where: any = {};

    if (recordIds && Array.isArray(recordIds) && recordIds.length > 0) {
      where.id = { in: recordIds };
    } else if (runId) {
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

    const [records, companySettings] = await Promise.all([
      prisma.payrollEmployeeRecord.findMany({
        where,
        include: {
          payrollRun: { include: { payrollPeriod: true } },
          employee: {
            include: {
              department: true,
              branch: true,
              station: true,
              position: true,
            },
          },
        },
        orderBy: { employee: { employeeNumber: 'asc' } },
      }),
      prisma.companySetting.findFirst(),
    ]);

    if (records.length === 0) {
      return apiError('No payroll records found matching specified criteria', 404);
    }

    // Update generation timestamps
    const now = new Date();
    await prisma.payrollEmployeeRecord.updateMany({
      where: { id: { in: records.map((r) => r.id) } },
      data: { payslipGeneratedAt: now },
    });

    const formattedList = records.map((r) => PayslipFormatter.format(r, companySettings));

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'BULK_PAYSLIPS_GENERATED',
        module: 'PAYROLL',
        entityType: 'PayrollEmployeeRecord',
        newValue: JSON.stringify({
          count: records.length,
          runId: runId || records[0]?.payrollRunId,
          period: records[0]?.payrollRun?.payrollPeriod?.name,
        }),
      },
    });

    return apiSuccess({
      generatedCount: formattedList.length,
      generatedAt: now.toISOString(),
      payslips: formattedList,
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to bulk generate payslips', 500);
  }
}
