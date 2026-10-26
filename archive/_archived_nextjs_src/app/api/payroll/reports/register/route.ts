import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { CsvExporter } from '@/lib/payroll-reports/CsvExporter';
import { DecimalMath } from '@/lib/payroll-engine/DecimalMath';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['payroll_register.view', 'payroll_report.view']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const runId = searchParams.get('runId');
    const periodId = searchParams.get('periodId');
    const departmentId = searchParams.get('departmentId');
    const stationId = searchParams.get('stationId');
    const paymentStatus = searchParams.get('paymentStatus');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
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
      return apiError('No payroll run found for register', 404);
    }

    const where: any = {
      payrollRunId: targetRun.id,
    };

    if (departmentId) where.employee = { ...where.employee, departmentId };
    if (stationId) where.employee = { ...where.employee, stationId };
    if (paymentStatus) where.paymentStatus = paymentStatus;

    if (search) {
      where.OR = [
        { employee: { fullName: { contains: search } } },
        { employee: { employeeNumber: { contains: search } } },
        { employee: { nationalId: { contains: search } } },
        { kraPin: { contains: search } },
      ];
    }

    const [total, records] = await Promise.all([
      prisma.payrollEmployeeRecord.count({ where }),
      prisma.payrollEmployeeRecord.findMany({
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
        skip: format === 'csv' ? 0 : (page - 1) * pageSize,
        take: format === 'csv' ? undefined : pageSize,
        orderBy: { employee: { employeeNumber: 'asc' } },
      }),
    ]);

    const rows = records.map((r) => {
      const emp = r.employee || {};
      return {
        id: r.id,
        employeeId: emp.id || r.employeeId,
        employeeNumber: emp.employeeNumber || 'N/A',
        fullName: emp.fullName || 'Employee',
        nationalId: emp.nationalId || 'N/A',
        department: r.departmentName || emp.department?.name || 'Guarding Operations',
        station: r.stationName || emp.station?.name || 'Nairobi HQ',
        basicSalary: Number(r.proratedBasicPay || r.basicSalary || 0),
        grossSalary: Number(r.grossPay || 0),
        totalDeductions: Number(r.totalDeductions || 0),
        netSalary: Number(r.netPay || 0),
        paymentMethod: r.paymentMethod || 'BANK',
        paymentStatus: r.paymentStatus || 'PENDING',
        paidAt: r.paidAt ? new Date(r.paidAt).toISOString().slice(0, 10) : null,
        paymentReference: r.paymentReference || null,
      };
    });

    if (format === 'csv') {
      const csvContent = CsvExporter.generate({
        title: 'OFFICIAL PAYROLL REGISTER',
        periodName: targetRun.payrollPeriod?.name || 'Current Period',
        generatedBy: `${auth.user.firstName} ${auth.user.lastName}`,
        columns: [
          { header: 'Emp Number', key: 'employeeNumber' },
          { header: 'Employee Full Name', key: 'fullName' },
          { header: 'National ID', key: 'nationalId' },
          { header: 'Department', key: 'department' },
          { header: 'Guarding Station', key: 'station' },
          { header: 'Basic Salary (KES)', key: 'basicSalary' },
          { header: 'Gross Salary (KES)', key: 'grossSalary' },
          { header: 'Total Deductions (KES)', key: 'totalDeductions' },
          { header: 'Net Salary (KES)', key: 'netSalary' },
          { header: 'Disbursement Method', key: 'paymentMethod' },
          { header: 'Payment Status', key: 'paymentStatus' },
          { header: 'Payment Date', key: 'paidAt' },
        ],
        data: rows,
        totalsKeys: ['basicSalary', 'grossSalary', 'totalDeductions', 'netSalary'],
      });

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="Payroll_Register_${targetRun.runNumber}.csv"`,
        },
      });
    }

    // Totals for all records in the run
    const allRunRecords = await prisma.payrollEmployeeRecord.findMany({
      where: { payrollRunId: targetRun.id },
      select: {
        basicSalary: true,
        proratedBasicPay: true,
        grossPay: true,
        totalDeductions: true,
        netPay: true,
        paymentStatus: true,
      },
    });

    const runTotals = {
      employeeCount: allRunRecords.length,
      basicSalary: allRunRecords.reduce((acc, r) => DecimalMath.sum(acc, r.proratedBasicPay || r.basicSalary), 0),
      grossSalary: allRunRecords.reduce((acc, r) => DecimalMath.sum(acc, r.grossPay), 0),
      totalDeductions: allRunRecords.reduce((acc, r) => DecimalMath.sum(acc, r.totalDeductions), 0),
      netSalary: allRunRecords.reduce((acc, r) => DecimalMath.sum(acc, r.netPay), 0),
      paidCount: allRunRecords.filter((r) => r.paymentStatus === 'PAID').length,
      pendingCount: allRunRecords.filter((r) => r.paymentStatus === 'PENDING' || !r.paymentStatus).length,
      processingCount: allRunRecords.filter((r) => r.paymentStatus === 'PROCESSING').length,
      failedCount: allRunRecords.filter((r) => r.paymentStatus === 'FAILED').length,
    };

    return apiSuccess({
      run: {
        id: targetRun.id,
        runNumber: targetRun.runNumber,
        status: targetRun.status,
        periodName: targetRun.payrollPeriod?.name,
        periodMonth: targetRun.payrollPeriod?.payrollMonth,
        periodYear: targetRun.payrollPeriod?.payrollYear,
      },
      totals: runTotals,
      rows,
    }, {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to generate payroll register', 500);
  }
}
