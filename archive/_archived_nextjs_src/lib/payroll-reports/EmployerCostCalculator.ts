// CorpSec HR Payroll — Employer Labor Cost Calculator Engine
// Aggregates direct gross employee earnings and statutory employer matching contributions

import { EmployerCostReportData } from '@/types';
import { DecimalMath } from '../payroll-engine/DecimalMath';

export class EmployerCostCalculator {
  public static calculate(
    run: any,
    records: any[]
  ): EmployerCostReportData {
    const period = run.payrollPeriod || {};

    let totalBasic = 0;
    let totalAllowances = 0;
    let totalOvertime = 0;
    let totalBonuses = 0;
    let totalCommissions = 0;
    let totalOtherEarnings = 0;
    let totalGross = 0;
    let totalEmplrNssf = 0;
    let totalEmplrAhl = 0;
    let totalEmplrSha = 0;

    const deptMap: Record<string, { headcount: number; grossPay: number; employerContributions: number }> = {};
    const branchMap: Record<string, { headcount: number; grossPay: number; employerContributions: number }> = {};

    for (const rec of records) {
      const basic = Number(rec.proratedBasicPay || rec.basicSalary || 0);
      const allow = Number(rec.totalAllowances || 0);
      const ot = Number(rec.totalOvertimePay || 0);
      const bonus = Number(rec.totalBonusPay || 0);
      const comm = Number(rec.totalCommissionPay || 0);
      const other = Number(rec.totalOtherEarnings || 0);
      const gross = Number(rec.grossPay || 0);

      const emplrNssf = DecimalMath.sum(rec.nssfTier1Employer || 0, rec.nssfTier2Employer || 0);
      const emplrAhl = Number(rec.housingLevyEmployer || 0);
      const emplrSha = Number(rec.shaEmployer || 0);
      const emplrTotal = DecimalMath.sum(emplrNssf, emplrAhl, emplrSha);

      totalBasic = DecimalMath.sum(totalBasic, basic);
      totalAllowances = DecimalMath.sum(totalAllowances, allow);
      totalOvertime = DecimalMath.sum(totalOvertime, ot);
      totalBonuses = DecimalMath.sum(totalBonuses, bonus);
      totalCommissions = DecimalMath.sum(totalCommissions, comm);
      totalOtherEarnings = DecimalMath.sum(totalOtherEarnings, other);
      totalGross = DecimalMath.sum(totalGross, gross);

      totalEmplrNssf = DecimalMath.sum(totalEmplrNssf, emplrNssf);
      totalEmplrAhl = DecimalMath.sum(totalEmplrAhl, emplrAhl);
      totalEmplrSha = DecimalMath.sum(totalEmplrSha, emplrSha);

      // Department aggregation
      const deptName = rec.departmentName || rec.employee?.department?.name || 'Guarding Operations';
      if (!deptMap[deptName]) {
        deptMap[deptName] = { headcount: 0, grossPay: 0, employerContributions: 0 };
      }
      deptMap[deptName].headcount += 1;
      deptMap[deptName].grossPay = DecimalMath.sum(deptMap[deptName].grossPay, gross);
      deptMap[deptName].employerContributions = DecimalMath.sum(deptMap[deptName].employerContributions, emplrTotal);

      // Branch aggregation
      const branchName = rec.branchName || rec.employee?.branch?.name || 'Nairobi HQ';
      if (!branchMap[branchName]) {
        branchMap[branchName] = { headcount: 0, grossPay: 0, employerContributions: 0 };
      }
      branchMap[branchName].headcount += 1;
      branchMap[branchName].grossPay = DecimalMath.sum(branchMap[branchName].grossPay, gross);
      branchMap[branchName].employerContributions = DecimalMath.sum(branchMap[branchName].employerContributions, emplrTotal);
    }

    const totalEmplrContribs = DecimalMath.sum(totalEmplrNssf, totalEmplrAhl, totalEmplrSha);
    const totalTrueLaborCost = DecimalMath.sum(totalGross, totalEmplrContribs);

    // Department breakdown array
    const departmentBreakdown = Object.entries(deptMap).map(([dept, data]) => {
      const totalCost = DecimalMath.sum(data.grossPay, data.employerContributions);
      const share = totalTrueLaborCost > 0 ? (totalCost / totalTrueLaborCost) * 100 : 0;
      return {
        department: dept,
        headcount: data.headcount,
        grossPay: data.grossPay,
        employerContributions: data.employerContributions,
        totalCost,
        costSharePercentage: Number(share.toFixed(2)),
      };
    }).sort((a, b) => b.totalCost - a.totalCost);

    // Branch breakdown array
    const branchBreakdown = Object.entries(branchMap).map(([branch, data]) => {
      const totalCost = DecimalMath.sum(data.grossPay, data.employerContributions);
      const share = totalTrueLaborCost > 0 ? (totalCost / totalTrueLaborCost) * 100 : 0;
      return {
        branch,
        headcount: data.headcount,
        grossPay: data.grossPay,
        employerContributions: data.employerContributions,
        totalCost,
        costSharePercentage: Number(share.toFixed(2)),
      };
    }).sort((a, b) => b.totalCost - a.totalCost);

    return {
      runId: run.id,
      runNumber: run.runNumber,
      periodName: period.name || 'Current Period',
      employeeCount: records.length,
      totalBasicSalaries: totalBasic,
      totalAllowances,
      totalOvertime,
      totalBonuses,
      totalCommissions,
      totalOtherEarnings,
      totalGrossSalaries: totalGross,
      totalEmployerNssf: totalEmplrNssf,
      totalEmployerHousingLevy: totalEmplrAhl,
      totalEmployerSha: totalEmplrSha,
      totalEmployerContributions: totalEmplrContribs,
      totalTrueEmployerCost: totalTrueLaborCost,
      departmentBreakdown,
      branchBreakdown,
    };
  }
}
