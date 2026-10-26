import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { CsvExporter } from '@/lib/payroll-reports/CsvExporter';
import { DecimalMath } from '@/lib/payroll-engine/DecimalMath';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['payroll_summary.view', 'payroll_report.view']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const runId = searchParams.get('runId');
    const periodId = searchParams.get('periodId');
    const departmentId = searchParams.get('departmentId');
    const branchId = searchParams.get('branchId');
    const stationId = searchParams.get('stationId');
    const search = searchParams.get('search');
    const format = searchParams.get('format'); // 'csv' or 'json'

    // Determine target payroll run
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
      // Find latest finalized or calculated run
      targetRun = await prisma.payrollRun.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { payrollPeriod: true },
      });
    }

    if (!targetRun) {
      return apiError('No payroll run found for summary report', 404);
    }

    const where: any = {
      payrollRunId: targetRun.id,
    };

    if (departmentId) where.employee = { ...where.employee, departmentId };
    if (branchId) where.employee = { ...where.employee, branchId };
    if (stationId) where.employee = { ...where.employee, stationId };

    if (search) {
      where.OR = [
        { employee: { fullName: { contains: search } } },
        { employee: { employeeNumber: { contains: search } } },
        { kraPin: { contains: search } },
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

    const rows = records.map((r) => {
      const emp = r.employee || {};
      const totalNssf = DecimalMath.sum(r.nssfTier1Employee || 0, r.nssfTier2Employee || 0);
      const emplrContribs = Number(r.totalEmployerContributions || 0);
      const trueCost = DecimalMath.sum(r.grossPay || 0, emplrContribs);

      return {
        employeeId: emp.id || r.employeeId,
        employeeNumber: emp.employeeNumber || 'N/A',
        fullName: emp.fullName || 'Employee',
        department: r.departmentName || emp.department?.name || 'Guarding Operations',
        station: r.stationName || emp.station?.name || 'Nairobi HQ',
        basicSalary: Number(r.proratedBasicPay || r.basicSalary || 0),
        allowances: Number(r.totalAllowances || 0),
        overtime: Number(r.totalOvertimePay || 0),
        bonuses: Number(r.totalBonusPay || 0),
        commissions: Number(r.totalCommissionPay || 0),
        grossPay: Number(r.grossPay || 0),
        paye: Number(r.payeTax || 0),
        nssf: totalNssf,
        sha: Number(r.shaEmployee || 0),
        housingLevy: Number(r.housingLevyEmployee || 0),
        otherDeductions: Number(r.totalOtherDeductions || 0),
        totalDeductions: Number(r.totalDeductions || 0),
        netPay: Number(r.netPay || 0),
        employerCost: trueCost,
        paymentStatus: r.paymentStatus || 'PENDING',
      };
    });

    // Compute Totals
    const totals = {
      employeeCount: rows.length,
      basicSalary: rows.reduce((acc, r) => DecimalMath.sum(acc, r.basicSalary), 0),
      allowances: rows.reduce((acc, r) => DecimalMath.sum(acc, r.allowances), 0),
      overtime: rows.reduce((acc, r) => DecimalMath.sum(acc, r.overtime), 0),
      bonuses: rows.reduce((acc, r) => DecimalMath.sum(acc, r.bonuses), 0),
      commissions: rows.reduce((acc, r) => DecimalMath.sum(acc, r.commissions), 0),
      grossPay: rows.reduce((acc, r) => DecimalMath.sum(acc, r.grossPay), 0),
      paye: rows.reduce((acc, r) => DecimalMath.sum(acc, r.paye), 0),
      nssf: rows.reduce((acc, r) => DecimalMath.sum(acc, r.nssf), 0),
      sha: rows.reduce((acc, r) => DecimalMath.sum(acc, r.sha), 0),
      housingLevy: rows.reduce((acc, r) => DecimalMath.sum(acc, r.housingLevy), 0),
      otherDeductions: rows.reduce((acc, r) => DecimalMath.sum(acc, r.otherDeductions), 0),
      totalDeductions: rows.reduce((acc, r) => DecimalMath.sum(acc, r.totalDeductions), 0),
      netPay: rows.reduce((acc, r) => DecimalMath.sum(acc, r.netPay), 0),
      employerCost: rows.reduce((acc, r) => DecimalMath.sum(acc, r.employerCost), 0),
    };

    if (format === 'csv') {
      const csvContent = CsvExporter.generate({
        title: 'PAYROLL SUMMARY REPORT',
        periodName: targetRun.payrollPeriod?.name || 'Current Period',
        generatedBy: `${auth.user.firstName} ${auth.user.lastName}`,
        columns: [
          { header: 'Emp No', key: 'employeeNumber' },
          { header: 'Employee Name', key: 'fullName' },
          { header: 'Department', key: 'department' },
          { header: 'Guarding Station', key: 'station' },
          { header: 'Basic Pay (KES)', key: 'basicSalary' },
          { header: 'Allowances (KES)', key: 'allowances' },
          { header: 'Overtime (KES)', key: 'overtime' },
          { header: 'Bonus/Comm (KES)', key: 'bonuses', formatter: (_, r) => (r.bonuses + r.commissions).toFixed(2) },
          { header: 'Gross Pay (KES)', key: 'grossPay' },
          { header: 'PAYE Tax (KES)', key: 'paye' },
          { header: 'NSSF (KES)', key: 'nssf' },
          { header: 'SHA (KES)', key: 'sha' },
          { header: 'Housing Levy (KES)', key: 'housingLevy' },
          { header: 'Other Ded (KES)', key: 'otherDeductions' },
          { header: 'Total Ded (KES)', key: 'totalDeductions' },
          { header: 'Net Pay (KES)', key: 'netPay' },
          { header: 'Payment Status', key: 'paymentStatus' },
        ],
        data: rows,
        totalsKeys: ['basicSalary', 'allowances', 'overtime', 'grossPay', 'paye', 'nssf', 'sha', 'housingLevy', 'otherDeductions', 'totalDeductions', 'netPay'],
      });

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="Payroll_Summary_${targetRun.runNumber}.csv"`,
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
      totals,
      rows,
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to generate payroll summary report', 500);
  }
}
