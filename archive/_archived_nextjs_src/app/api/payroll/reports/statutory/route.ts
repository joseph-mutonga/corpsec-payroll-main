import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { CsvExporter } from '@/lib/payroll-reports/CsvExporter';
import { StatutoryReportBuilder, StatutoryRegimeType } from '@/lib/payroll-reports/StatutoryReportBuilder';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['statutory_report.view', 'payroll_report.view']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const regime = (searchParams.get('regime') || 'PAYE').toUpperCase() as StatutoryRegimeType;
    const runId = searchParams.get('runId');
    const periodId = searchParams.get('periodId');
    const departmentId = searchParams.get('departmentId');
    const stationId = searchParams.get('stationId');
    const search = searchParams.get('search');
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
      return apiError('No payroll run found for statutory report', 404);
    }

    const where: any = {
      payrollRunId: targetRun.id,
    };

    if (departmentId) where.employee = { ...where.employee, departmentId };
    if (stationId) where.employee = { ...where.employee, stationId };

    if (search) {
      where.OR = [
        { employee: { fullName: { contains: search } } },
        { employee: { employeeNumber: { contains: search } } },
        { kraPin: { contains: search } },
        { nssfNumber: { contains: search } },
        { shaNumber: { contains: search } },
      ];
    }

    const records = await prisma.payrollEmployeeRecord.findMany({
      where,
      include: {
        employee: {
          include: {
            department: true,
            branch: true,
            station: true,
          },
        },
      },
      orderBy: { employee: { employeeNumber: 'asc' } },
    });

    const report = StatutoryReportBuilder.build(records, regime, targetRun);

    if (format === 'csv') {
      let columns: any[] = [];
      let totalsKeys: string[] = [];

      switch (regime) {
        case 'PAYE':
          columns = [
            { header: 'Emp No', key: 'employeeNumber' },
            { header: 'Employee Name', key: 'fullName' },
            { header: 'KRA PIN', key: 'kraPin' },
            { header: 'Department', key: 'department' },
            { header: 'Gross Earnings (KES)', key: 'grossPay' },
            { header: 'Taxable Income (KES)', key: 'taxableIncome' },
            { header: 'Personal Relief (KES)', key: 'personalRelief' },
            { header: 'Net PAYE Tax (KES)', key: 'payeTax' },
          ];
          totalsKeys = ['grossPay', 'taxableIncome', 'personalRelief', 'payeTax'];
          break;

        case 'NSSF':
          columns = [
            { header: 'Emp No', key: 'employeeNumber' },
            { header: 'Employee Name', key: 'fullName' },
            { header: 'NSSF Number', key: 'nssfNumber' },
            { header: 'Department', key: 'department' },
            { header: 'Pensionable Base (KES)', key: 'pensionableEarnings' },
            { header: 'Tier 1 Employee (KES)', key: 'nssfTier1Employee' },
            { header: 'Tier 2 Employee (KES)', key: 'nssfTier2Employee' },
            { header: 'Total Employee (KES)', key: 'nssfTotalEmployee' },
            { header: 'Tier 1 Employer (KES)', key: 'nssfTier1Employer' },
            { header: 'Tier 2 Employer (KES)', key: 'nssfTier2Employer' },
            { header: 'Total Employer (KES)', key: 'nssfTotalEmployer' },
            { header: 'Grand Total NSSF (KES)', key: 'nssfGrandTotal' },
          ];
          totalsKeys = ['pensionableEarnings', 'nssfTier1Employee', 'nssfTier2Employee', 'nssfTotalEmployee', 'nssfTier1Employer', 'nssfTier2Employer', 'nssfTotalEmployer', 'nssfGrandTotal'];
          break;

        case 'SHA':
          columns = [
            { header: 'Emp No', key: 'employeeNumber' },
            { header: 'Employee Name', key: 'fullName' },
            { header: 'SHA Number', key: 'shaNumber' },
            { header: 'Department', key: 'department' },
            { header: 'Assessable Gross (KES)', key: 'grossPay' },
            { header: 'Member SHA Contribution (KES)', key: 'shaEmployee' },
          ];
          totalsKeys = ['grossPay', 'shaEmployee'];
          break;

        case 'HOUSING_LEVY':
          columns = [
            { header: 'Emp No', key: 'employeeNumber' },
            { header: 'Employee Name', key: 'fullName' },
            { header: 'KRA PIN', key: 'kraPin' },
            { header: 'Department', key: 'department' },
            { header: 'Gross Earnings (KES)', key: 'grossPay' },
            { header: 'Employee 1.5% (KES)', key: 'housingLevyEmployee' },
            { header: 'Employer 1.5% (KES)', key: 'housingLevyEmployer' },
            { header: 'Total Housing Levy 3.0% (KES)', key: 'housingLevyTotal' },
          ];
          totalsKeys = ['grossPay', 'housingLevyEmployee', 'housingLevyEmployer', 'housingLevyTotal'];
          break;

        default:
          columns = [
            { header: 'Emp No', key: 'employeeNumber' },
            { header: 'Employee Name', key: 'fullName' },
            { header: 'Gross Pay (KES)', key: 'grossPay' },
            { header: 'PAYE Tax (KES)', key: 'payeTax' },
            { header: 'Total NSSF (KES)', key: 'nssfGrandTotal' },
            { header: 'SHA (KES)', key: 'shaEmployee' },
            { header: 'Housing Levy (KES)', key: 'housingLevyTotal' },
          ];
          totalsKeys = ['grossPay', 'payeTax', 'nssfGrandTotal', 'shaEmployee', 'housingLevyTotal'];
          break;
      }

      const csvContent = CsvExporter.generate({
        title: report.title.toUpperCase(),
        periodName: targetRun.payrollPeriod?.name || 'Current Period',
        generatedBy: `${auth.user.firstName} ${auth.user.lastName}`,
        columns,
        data: report.items,
        totalsKeys,
      });

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="Statutory_${regime}_${targetRun.runNumber}.csv"`,
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
      report,
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to generate statutory report', 500);
  }
}
