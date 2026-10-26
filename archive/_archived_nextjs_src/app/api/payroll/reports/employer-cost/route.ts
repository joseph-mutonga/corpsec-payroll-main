import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { CsvExporter } from '@/lib/payroll-reports/CsvExporter';
import { EmployerCostCalculator } from '@/lib/payroll-reports/EmployerCostCalculator';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['employer_cost.view', 'payroll_report.view']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const runId = searchParams.get('runId');
    const periodId = searchParams.get('periodId');
    const format = searchParams.get('format');

    // Find run
    let targetRun: any = null;
    if (runId) {
      targetRun = await prisma.payrollRun.findUnique({
        where: { id: runId },
        include: { payrollPeriod: true },
      });
    } else if (periodId) {
      targetRun = await prisma.payrollRun.findFirst({
        where: { payrollPeriodId: periodId },
        orderBy: { createdAt: 'desc' },
        include: { payrollPeriod: true },
      });
    } else {
      targetRun = await prisma.payrollRun.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { payrollPeriod: true },
      });
    }

    if (!targetRun) {
      return apiError('No payroll run found for employer cost report', 404);
    }

    const records = await prisma.payrollEmployeeRecord.findMany({
      where: { payrollRunId: targetRun.id },
      include: {
        employee: {
          include: {
            department: true,
            branch: true,
            station: true,
          },
        },
      },
    });

    const costReport = EmployerCostCalculator.calculate(targetRun, records);

    if (format === 'csv') {
      const csvContent = CsvExporter.generate({
        title: 'EMPLOYER TOTAL LABOR COST REPORT (BY DEPARTMENT)',
        periodName: targetRun.payrollPeriod?.name || 'Current Period',
        generatedBy: `${auth.user.firstName} ${auth.user.lastName}`,
        columns: [
          { header: 'Department', key: 'department' },
          { header: 'Headcount', key: 'headcount' },
          { header: 'Direct Gross Pay (KES)', key: 'grossPay' },
          { header: 'Employer Statutory Match (KES)', key: 'employerContributions' },
          { header: 'True Total Labor Cost (KES)', key: 'totalCost' },
          { header: 'Share of Total (%)', key: 'costSharePercentage', formatter: (val) => `${val}%` },
        ],
        data: costReport.departmentBreakdown,
        totalsKeys: ['grossPay', 'employerContributions', 'totalCost'],
      });

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="Employer_Cost_${targetRun.runNumber}.csv"`,
        },
      });
    }

    return apiSuccess({
      run: {
        id: targetRun.id,
        runNumber: targetRun.runNumber,
        status: targetRun.status,
        periodName: targetRun.payrollPeriod?.name,
        periodMonth: targetRun.payrollPeriod?.payrollMonth,
        periodYear: targetRun.payrollPeriod?.payrollYear,
      },
      report: costReport,
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to generate employer cost report', 500);
  }
}
