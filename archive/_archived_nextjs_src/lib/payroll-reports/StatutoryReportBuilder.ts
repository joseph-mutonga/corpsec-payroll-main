// CorpSec HR Payroll — Statutory Returns Builder Engine
// Formats finalized payroll results into official Kenyan statutory schedules (PAYE, NSSF, SHA, Housing Levy)

import { StatutoryReportItem } from '@/types';
import { DecimalMath } from '../payroll-engine/DecimalMath';

export type StatutoryRegimeType = 'PAYE' | 'NSSF' | 'SHA' | 'HOUSING_LEVY' | 'ALL';

export interface StatutoryReportSchedule {
  regime: StatutoryRegimeType;
  title: string;
  runNumber: string;
  periodName: string;
  currency: string;
  totalEmployeeCount: number;
  totalPayableAmount: number;
  summaryMetrics: Record<string, number>;
  items: StatutoryReportItem[];
}

export class StatutoryReportBuilder {
  public static build(
    records: any[],
    regime: StatutoryRegimeType = 'PAYE',
    runDetails?: any
  ): StatutoryReportSchedule {
    const items: StatutoryReportItem[] = records.map((rec) => {
      const emp = rec.employee || {};
      const totalNssfEmp = DecimalMath.sum(rec.nssfTier1Employee || 0, rec.nssfTier2Employee || 0);
      const totalNssfEmplr = DecimalMath.sum(rec.nssfTier1Employer || 0, rec.nssfTier2Employer || 0);
      const nssfGrand = DecimalMath.sum(totalNssfEmp, totalNssfEmplr);
      const ahlTotal = DecimalMath.sum(rec.housingLevyEmployee || 0, rec.housingLevyEmployer || 0);

      return {
        employeeNumber: emp.employeeNumber || 'N/A',
        fullName: emp.fullName || 'Employee',
        kraPin: rec.kraPin || emp.kraPin || 'N/A',
        nssfNumber: rec.nssfNumber || emp.nssfNumber || 'N/A',
        shaNumber: rec.shaNumber || emp.shaNumber || 'N/A',
        department: rec.departmentName || emp.department?.name || 'Guarding Operations',
        grossPay: Number(rec.grossPay || 0),
        taxableIncome: Number(rec.taxableGross || rec.grossPay || 0),
        payeTax: Number(rec.payeTax || 0),
        personalRelief: Number(rec.personalRelief || 2400),
        pensionableEarnings: Number(rec.basicSalary || rec.proratedBasicPay || 0),
        nssfTier1Employee: Number(rec.nssfTier1Employee || 0),
        nssfTier2Employee: Number(rec.nssfTier2Employee || 0),
        nssfTotalEmployee: totalNssfEmp,
        nssfTier1Employer: Number(rec.nssfTier1Employer || 0),
        nssfTier2Employer: Number(rec.nssfTier2Employer || 0),
        nssfTotalEmployer: totalNssfEmplr,
        nssfGrandTotal: nssfGrand,
        shaEmployee: Number(rec.shaEmployee || 0),
        housingLevyEmployee: Number(rec.housingLevyEmployee || 0),
        housingLevyEmployer: Number(rec.housingLevyEmployer || 0),
        housingLevyTotal: ahlTotal,
      };
    });

    let title = 'Statutory Returns Schedule';
    let totalPayable = 0;
    const summaryMetrics: Record<string, number> = {};

    switch (regime) {
      case 'PAYE':
        title = 'Kenya Revenue Authority (KRA) — PAYE Tax Return Schedule';
        totalPayable = items.reduce((acc, i) => DecimalMath.sum(acc, i.payeTax), 0);
        summaryMetrics.totalGrossTaxable = items.reduce((acc, i) => DecimalMath.sum(acc, i.taxableIncome), 0);
        summaryMetrics.totalRelief = items.reduce((acc, i) => DecimalMath.sum(acc, i.personalRelief), 0);
        summaryMetrics.totalPayeTax = totalPayable;
        break;

      case 'NSSF':
        title = 'National Social Security Fund (NSSF) — Member & Employer Return Schedule';
        totalPayable = items.reduce((acc, i) => DecimalMath.sum(acc, i.nssfGrandTotal), 0);
        summaryMetrics.totalEmployeeContribution = items.reduce((acc, i) => DecimalMath.sum(acc, i.nssfTotalEmployee), 0);
        summaryMetrics.totalEmployerContribution = items.reduce((acc, i) => DecimalMath.sum(acc, i.nssfTotalEmployer), 0);
        summaryMetrics.totalNssf = totalPayable;
        break;

      case 'SHA':
        title = 'Social Health Authority (SHA / SHIF) — Monthly Contribution Return Schedule';
        totalPayable = items.reduce((acc, i) => DecimalMath.sum(acc, i.shaEmployee), 0);
        summaryMetrics.totalAssessableEarnings = items.reduce((acc, i) => DecimalMath.sum(acc, i.grossPay), 0);
        summaryMetrics.totalShaContributions = totalPayable;
        break;

      case 'HOUSING_LEVY':
        title = 'Affordable Housing Levy (AHL) — 1.5% Employee + 1.5% Employer Return Schedule';
        totalPayable = items.reduce((acc, i) => DecimalMath.sum(acc, i.housingLevyTotal), 0);
        summaryMetrics.totalEmployeeLevy = items.reduce((acc, i) => DecimalMath.sum(acc, i.housingLevyEmployee), 0);
        summaryMetrics.totalEmployerLevy = items.reduce((acc, i) => DecimalMath.sum(acc, i.housingLevyEmployer), 0);
        summaryMetrics.totalHousingLevy = totalPayable;
        break;

      default:
        title = 'Consolidated Kenya Statutory Returns Schedule';
        totalPayable = items.reduce(
          (acc, i) => DecimalMath.sum(acc, i.payeTax, i.nssfGrandTotal, i.shaEmployee, i.housingLevyTotal),
          0
        );
        break;
    }

    return {
      regime,
      title,
      runNumber: runDetails?.runNumber || 'PAY-RUN',
      periodName: runDetails?.payrollPeriod?.name || 'Current Period',
      currency: 'KES',
      totalEmployeeCount: items.length,
      totalPayableAmount: totalPayable,
      summaryMetrics,
      items,
    };
  }
}
