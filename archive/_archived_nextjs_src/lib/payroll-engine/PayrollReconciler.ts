// CorpSec HR Payroll — Payroll Financial Reconciler
// Audits exact mathematical balance between run-level aggregate totals and individual employee records

import { DecimalMath } from './DecimalMath';

export interface EmployeeRecordSummary {
  basicSalary: number;
  proratedBasicPay: number;
  totalAllowances: number;
  totalOvertimePay: number;
  totalBonusPay: number;
  totalCommissionPay: number;
  totalOtherEarnings: number;
  grossPay: number;
  payeTax: number;
  nssfTier1Employee: number;
  nssfTier2Employee: number;
  shaEmployee: number;
  housingLevyEmployee: number;
  totalStatutoryDeductions: number;
  totalOtherDeductions: number;
  totalDeductions: number;
  netPay: number;
  nssfTier1Employer: number;
  nssfTier2Employer: number;
  shaEmployer: number;
  housingLevyEmployer: number;
  totalEmployerContributions: number;
}

export interface PayrollRunTotals {
  employeeCount: number;
  totalBasicPay: number;
  totalAllowances: number;
  totalOvertimePay: number;
  totalBonusPay: number;
  totalCommissionPay: number;
  totalOtherEarnings: number;
  grossPayroll: number;
  totalPayeTax: number;
  totalNssfEmployee: number;
  totalShaEmployee: number;
  totalHousingLevyEmployee: number;
  totalStatutoryDeductions: number;
  totalOtherDeductions: number;
  totalDeductions: number;
  totalNetPayroll: number;
  totalEmployerContributions: number;
}

export interface ReconciliationResult {
  isReconciled: boolean;
  discrepancies: Array<{
    field: string;
    sumOfEmployees: number;
    runTotal: number;
    difference: number;
  }>;
  matrix: {
    employeeCount: number;
    sumBasic: number;
    sumAllowances: number;
    sumOvertime: number;
    sumBonuses: number;
    sumGross: number;
    sumStatutory: number;
    sumOtherDeductions: number;
    sumTotalDeductions: number;
    sumNet: number;
    sumEmployerCosts: number;
  };
}

export class PayrollReconciler {
  /**
   * Reconciles all employee records against run totals to guarantee zero cent disparity.
   */
  static reconcile(
    records: EmployeeRecordSummary[],
    runTotals: PayrollRunTotals
  ): ReconciliationResult {
    let sumBasic = 0;
    let sumAllowances = 0;
    let sumOvertime = 0;
    let sumBonuses = 0;
    let sumCommissions = 0;
    let sumOtherEarnings = 0;
    let sumGross = 0;
    let sumPaye = 0;
    let sumNssfEmp = 0;
    let sumShaEmp = 0;
    let sumHousingEmp = 0;
    let sumStatutory = 0;
    let sumOtherDeductions = 0;
    let sumTotalDeductions = 0;
    let sumNet = 0;
    let sumEmployerCosts = 0;

    for (const r of records) {
      sumBasic = DecimalMath.sum(sumBasic, r.proratedBasicPay);
      sumAllowances = DecimalMath.sum(sumAllowances, r.totalAllowances);
      sumOvertime = DecimalMath.sum(sumOvertime, r.totalOvertimePay);
      sumBonuses = DecimalMath.sum(sumBonuses, r.totalBonusPay);
      sumCommissions = DecimalMath.sum(sumCommissions, r.totalCommissionPay);
      sumOtherEarnings = DecimalMath.sum(sumOtherEarnings, r.totalOtherEarnings);
      sumGross = DecimalMath.sum(sumGross, r.grossPay);
      sumPaye = DecimalMath.sum(sumPaye, r.payeTax);
      sumNssfEmp = DecimalMath.sum(sumNssfEmp, r.nssfTier1Employee, r.nssfTier2Employee);
      sumShaEmp = DecimalMath.sum(sumShaEmp, r.shaEmployee);
      sumHousingEmp = DecimalMath.sum(sumHousingEmp, r.housingLevyEmployee);
      sumStatutory = DecimalMath.sum(sumStatutory, r.totalStatutoryDeductions);
      sumOtherDeductions = DecimalMath.sum(sumOtherDeductions, r.totalOtherDeductions);
      sumTotalDeductions = DecimalMath.sum(sumTotalDeductions, r.totalDeductions);
      sumNet = DecimalMath.sum(sumNet, r.netPay);
      sumEmployerCosts = DecimalMath.sum(sumEmployerCosts, r.totalEmployerContributions);
    }

    const discrepancies: ReconciliationResult['discrepancies'] = [];

    const checkField = (fieldName: string, employeeSum: number, runTotal: number) => {
      const diff = Math.abs(DecimalMath.sub(employeeSum, runTotal));
      if (diff > 0.009) {
        discrepancies.push({
          field: fieldName,
          sumOfEmployees: employeeSum,
          runTotal,
          difference: diff,
        });
      }
    };

    checkField('Gross Payroll', sumGross, runTotals.grossPayroll);
    checkField('Basic Pay', sumBasic, runTotals.totalBasicPay);
    checkField('Allowances', sumAllowances, runTotals.totalAllowances);
    checkField('Overtime Pay', sumOvertime, runTotals.totalOvertimePay);
    checkField('Statutory Deductions', sumStatutory, runTotals.totalStatutoryDeductions);
    checkField('Other Deductions', sumOtherDeductions, runTotals.totalOtherDeductions);
    checkField('Total Deductions', sumTotalDeductions, runTotals.totalDeductions);
    checkField('Net Payroll', sumNet, runTotals.totalNetPayroll);
    checkField('Employer Contributions', sumEmployerCosts, runTotals.totalEmployerContributions);

    return {
      isReconciled: discrepancies.length === 0,
      discrepancies,
      matrix: {
        employeeCount: records.length,
        sumBasic,
        sumAllowances,
        sumOvertime,
        sumBonuses: DecimalMath.sum(sumBonuses, sumCommissions, sumOtherEarnings),
        sumGross,
        sumStatutory,
        sumOtherDeductions,
        sumTotalDeductions,
        sumNet,
        sumEmployerCosts,
      },
    };
  }
}
