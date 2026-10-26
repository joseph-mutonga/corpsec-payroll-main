import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/response';
import { requireAuth } from '@/lib/permissions';
import { DecimalMath } from '@/lib/payroll-engine/DecimalMath';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(req, ['payroll.view']);
    if (auth.error) return auth.error;

    const run = await prisma.payrollRun.findUnique({
      where: { id: params.id },
      include: {
        payrollPeriod: true,
        employeeRecords: {
          include: {
            employee: {
              select: {
                id: true,
                fullName: true,
                employeeNumber: true,
                department: { select: { id: true, name: true, code: true } },
                branch: { select: { id: true, name: true, code: true } },
                station: { select: { id: true, name: true, code: true } },
                preferredPaymentMethod: true,
              },
            },
          },
        },
      },
    });

    if (!run) {
      return apiError('Payroll run not found', 404);
    }

    const deptMap: Record<string, { name: string; code: string; count: number; gross: number; statutory: number; deductions: number; net: number; employer: number }> = {};
    const branchMap: Record<string, { name: string; code: string; count: number; gross: number; net: number }> = {};
    const stationMap: Record<string, { name: string; code: string; count: number; gross: number; net: number }> = {};
    const paymentMap: Record<string, { count: number; net: number }> = {
      BANK: { count: 0, net: 0 },
      MPESA: { count: 0, net: 0 },
      CASH: { count: 0, net: 0 },
      CHEQUE: { count: 0, net: 0 },
    };

    for (const rec of run.employeeRecords) {
      const deptName = rec.employee.department?.name || 'Unassigned';
      const deptCode = rec.employee.department?.code || 'UNASSIGNED';
      if (!deptMap[deptName]) {
        deptMap[deptName] = { name: deptName, code: deptCode, count: 0, gross: 0, statutory: 0, deductions: 0, net: 0, employer: 0 };
      }
      deptMap[deptName].count += 1;
      deptMap[deptName].gross = DecimalMath.sum(deptMap[deptName].gross, rec.grossPay);
      deptMap[deptName].statutory = DecimalMath.sum(deptMap[deptName].statutory, rec.totalStatutoryDeductions);
      deptMap[deptName].deductions = DecimalMath.sum(deptMap[deptName].deductions, rec.totalDeductions);
      deptMap[deptName].net = DecimalMath.sum(deptMap[deptName].net, rec.netPay);
      deptMap[deptName].employer = DecimalMath.sum(deptMap[deptName].employer, rec.totalEmployerContributions);

      const branchName = rec.employee.branch?.name || 'Unassigned';
      const branchCode = rec.employee.branch?.code || 'UNASSIGNED';
      if (!branchMap[branchName]) {
        branchMap[branchName] = { name: branchName, code: branchCode, count: 0, gross: 0, net: 0 };
      }
      branchMap[branchName].count += 1;
      branchMap[branchName].gross = DecimalMath.sum(branchMap[branchName].gross, rec.grossPay);
      branchMap[branchName].net = DecimalMath.sum(branchMap[branchName].net, rec.netPay);

      if (rec.employee.station) {
        const stationName = rec.employee.station.name;
        const stationCode = rec.employee.station.code;
        if (!stationMap[stationName]) {
          stationMap[stationName] = { name: stationName, code: stationCode, count: 0, gross: 0, net: 0 };
        }
        stationMap[stationName].count += 1;
        stationMap[stationName].gross = DecimalMath.sum(stationMap[stationName].gross, rec.grossPay);
        stationMap[stationName].net = DecimalMath.sum(stationMap[stationName].net, rec.netPay);
      }

      const method = rec.paymentMethod || rec.employee.preferredPaymentMethod || 'BANK';
      if (!paymentMap[method]) paymentMap[method] = { count: 0, net: 0 };
      paymentMap[method].count += 1;
      paymentMap[method].net = DecimalMath.sum(paymentMap[method].net, rec.netPay);
    }

    return apiSuccess({
      run: {
        id: run.id,
        runNumber: run.runNumber,
        periodName: run.payrollPeriod.name,
        employeeCount: run.employeeCount,
        grossPayroll: run.grossPayroll,
        totalNetPayroll: run.totalNetPayroll,
        totalDeductions: run.totalDeductions,
        totalEmployerContributions: run.totalEmployerContributions,
        isReconciled: run.isReconciled,
        status: run.status,
      },
      departments: Object.values(deptMap),
      branches: Object.values(branchMap),
      stations: Object.values(stationMap),
      paymentMethods: paymentMap,
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to fetch payroll summary', 500);
  }
}
