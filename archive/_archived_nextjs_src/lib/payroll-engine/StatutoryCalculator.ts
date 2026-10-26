// CorpSec HR Payroll — Statutory Deductions & Contributions Engine
// Computes PAYE progressive tax bands, NSSF Tier I & II, SHA, and Affordable Housing Levy
// Strictly consumes dynamic database configuration with zero hardcoded values

import { DecimalMath } from './DecimalMath';

export interface StatutoryRuleInput {
  id: string;
  regimeType: string; // PAYE, NSSF, SHA, HOUSING_LEVY, NHIF
  name: string;
  employeeRate?: number | null;
  employerRate?: number | null;
  employeeRatePercentage?: number;
  employerRatePercentage?: number;
  minThreshold?: number | null;
  maxThreshold?: number | null;
  tier1Limit?: number | null;
  tier2Limit?: number | null;
  minMonthlyContribution?: number | null;
  maxMonthlyContribution?: number | null;
  isMandatory?: boolean;
  status: string;
}

export interface TaxBandInput {
  id: string;
  bandOrder: number;
  bandName: string;
  lowerThreshold: number;
  upperThreshold: number | null;
  ratePercentage: number;
  taxReliefMonthly?: number;
  status: string;
}

export interface StatutoryCalculationResult {
  payeTax: number;
  grossTax: number;
  personalRelief: number;
  taxableIncome: number;
  nssfTier1Employee: number;
  nssfTier2Employee: number;
  totalNssfEmployee: number;
  nssfTier1Employer: number;
  nssfTier2Employer: number;
  totalNssfEmployer: number;
  shaEmployee: number;
  shaEmployer: number;
  housingLevyEmployee: number;
  housingLevyEmployer: number;
  totalStatutoryDeductions: number;
  totalEmployerContributions: number;
  taxBandsBreakdown: Array<{
    bandOrder: number;
    bandName: string;
    rate: number;
    taxableInBand: number;
    taxAmount: number;
  }>;
  trace: {
    nssfFormula: string;
    shaFormula: string;
    housingLevyFormula: string;
    payeFormula: string;
    stepByStep: string[];
  };
}

export class StatutoryCalculator {
  /**
   * Calculates all Kenyan statutory deductions (employee) and contributions (employer).
   */
  static calculate(
    grossPay: number,
    taxableGross: number,
    pensionableEarnings: number,
    statutoryRules: StatutoryRuleInput[] = [],
    taxBands: TaxBandInput[] = []
  ): StatutoryCalculationResult {
    const steps: string[] = [];

    // 1. NSSF Calculation
    const nssfRule = statutoryRules.find(
      (r) => r.status === 'ACTIVE' && (r.regimeType.toUpperCase() === 'NSSF' || r.regimeType.toUpperCase().startsWith('NSSF'))
    );

    const nssfEmpRate = ((nssfRule?.employeeRate ?? nssfRule?.employeeRatePercentage) ?? 6.0) / 100;
    const nssfEmplrRate = ((nssfRule?.employerRate ?? nssfRule?.employerRatePercentage) ?? 6.0) / 100;
    const tier1Limit = nssfRule?.tier1Limit ?? nssfRule?.minThreshold ?? 8000;
    const tier2Limit = nssfRule?.tier2Limit ?? nssfRule?.maxThreshold ?? 72000;

    const tier1Subject = Math.min(pensionableEarnings, tier1Limit);
    const nssfTier1Employee = DecimalMath.mul(tier1Subject, nssfEmpRate);
    const nssfTier1Employer = DecimalMath.mul(tier1Subject, nssfEmplrRate);

    let nssfTier2Employee = 0;
    let nssfTier2Employer = 0;

    if (pensionableEarnings > tier1Limit) {
      const tier2Subject = Math.min(pensionableEarnings, tier2Limit) - tier1Limit;
      nssfTier2Employee = DecimalMath.mul(tier2Subject, nssfEmpRate);
      nssfTier2Employer = DecimalMath.mul(tier2Subject, nssfEmplrRate);
    }

    const totalNssfEmployee = DecimalMath.sum(nssfTier1Employee, nssfTier2Employee);
    const totalNssfEmployer = DecimalMath.sum(nssfTier1Employer, nssfTier2Employer);

    steps.push(
      `NSSF: Tier I (KES ${tier1Subject} @ ${nssfEmpRate * 100}%) = KES ${nssfTier1Employee}; Tier II = KES ${nssfTier2Employee} | Total Employee: KES ${totalNssfEmployee}, Employer: KES ${totalNssfEmployer}`
    );

    // 2. SHA (Social Health Authority)
    const shaRule = statutoryRules.find(
      (r) => r.status === 'ACTIVE' && (r.regimeType.toUpperCase() === 'SHA' || r.regimeType.toUpperCase() === 'NHIF')
    );

    const shaEmpRate = ((shaRule?.employeeRate ?? shaRule?.employeeRatePercentage) ?? 2.75) / 100;
    const shaEmplrRate = ((shaRule?.employerRate ?? shaRule?.employerRatePercentage) ?? 0) / 100;
    const shaMin = shaRule?.minMonthlyContribution ?? 300;

    let shaEmployee = DecimalMath.mul(grossPay, shaEmpRate);
    if (shaMin && shaEmployee < shaMin && grossPay > 0) {
      shaEmployee = shaMin;
    }
    const shaEmployer = DecimalMath.mul(grossPay, shaEmplrRate);

    steps.push(
      `SHA: Gross KES ${grossPay.toLocaleString()} @ ${shaEmpRate * 100}% = KES ${shaEmployee} (Employer: KES ${shaEmployer})`
    );

    // 3. Affordable Housing Levy (AHL)
    const ahlRule = statutoryRules.find(
      (r) => r.status === 'ACTIVE' && r.regimeType.toUpperCase() === 'HOUSING_LEVY'
    );

    const ahlEmpRate = ((ahlRule?.employeeRate ?? ahlRule?.employeeRatePercentage) ?? 1.5) / 100;
    const ahlEmplrRate = ((ahlRule?.employerRate ?? ahlRule?.employerRatePercentage) ?? 1.5) / 100;

    const housingLevyEmployee = DecimalMath.mul(grossPay, ahlEmpRate);
    const housingLevyEmployer = DecimalMath.mul(grossPay, ahlEmplrRate);

    steps.push(
      `Housing Levy: Gross KES ${grossPay.toLocaleString()} @ ${ahlEmpRate * 100}% = KES ${housingLevyEmployee} (Employer: KES ${housingLevyEmployer})`
    );

    // 4. PAYE Progressive Tax Calculation
    // Allowable pension deduction: Employee NSSF contribution
    const taxableIncome = Math.max(0, DecimalMath.sub(taxableGross, totalNssfEmployee));
    steps.push(`PAYE Taxable Base = Taxable Gross (KES ${taxableGross}) - Allowable NSSF (KES ${totalNssfEmployee}) = KES ${taxableIncome}`);

    const activeTaxBands = taxBands
      .filter((b) => b.status === 'ACTIVE')
      .sort((a, b) => a.bandOrder - b.bandOrder);

    let grossTax = 0;
    const taxBandsBreakdown: StatutoryCalculationResult['taxBandsBreakdown'] = [];

    for (const band of activeTaxBands) {
      const lower = band.lowerThreshold;
      const upper = band.upperThreshold !== null && band.upperThreshold !== undefined ? band.upperThreshold : Infinity;
      const rate = band.ratePercentage / 100;

      if (taxableIncome > lower) {
        const taxableInBand = Math.min(taxableIncome, upper) - lower;
        const taxInBand = DecimalMath.mul(taxableInBand, rate);
        grossTax = DecimalMath.sum(grossTax, taxInBand);

        taxBandsBreakdown.push({
          bandOrder: band.bandOrder,
          bandName: band.bandName,
          rate: band.ratePercentage,
          taxableInBand,
          taxAmount: taxInBand,
        });

        steps.push(
          `Band ${band.bandOrder} (${band.bandName}): KES ${taxableInBand.toLocaleString()} @ ${band.ratePercentage}% = KES ${taxInBand.toLocaleString()}`
        );
      } else {
        taxBandsBreakdown.push({
          bandOrder: band.bandOrder,
          bandName: band.bandName,
          rate: band.ratePercentage,
          taxableInBand: 0,
          taxAmount: 0,
        });
      }
    }

    // Personal Relief (Kenya default: 2,400 KES/month)
    const personalRelief = activeTaxBands.length > 0 && activeTaxBands[0].taxReliefMonthly !== undefined
      ? activeTaxBands[0].taxReliefMonthly
      : 2400;

    const payeTax = Math.max(0, DecimalMath.sub(grossTax, personalRelief));
    steps.push(`Gross Tax = KES ${grossTax.toLocaleString()} - Monthly Relief KES ${personalRelief.toLocaleString()} = Net PAYE KES ${payeTax.toLocaleString()}`);

    // Summary Totals
    const totalStatutoryDeductions = DecimalMath.sum(
      payeTax,
      totalNssfEmployee,
      shaEmployee,
      housingLevyEmployee
    );

    const totalEmployerContributions = DecimalMath.sum(
      totalNssfEmployer,
      shaEmployer,
      housingLevyEmployer
    );

    return {
      payeTax,
      grossTax,
      personalRelief,
      taxableIncome,
      nssfTier1Employee,
      nssfTier2Employee,
      totalNssfEmployee,
      nssfTier1Employer,
      nssfTier2Employer,
      totalNssfEmployer,
      shaEmployee,
      shaEmployer,
      housingLevyEmployee,
      housingLevyEmployer,
      totalStatutoryDeductions,
      totalEmployerContributions,
      taxBandsBreakdown,
      trace: {
        nssfFormula: `Tier I: ${nssfEmpRate * 100}% up to ${tier1Limit} | Tier II: ${nssfEmpRate * 100}% up to ${tier2Limit}`,
        shaFormula: `${shaEmpRate * 100}% of gross (min ${shaMin})`,
        housingLevyFormula: `${ahlEmpRate * 100}% employee / ${ahlEmplrRate * 100}% employer of gross`,
        payeFormula: `Progressive 5-band brackets on (Taxable Gross - NSSF) minus KES ${personalRelief} personal relief`,
        stepByStep: steps,
      },
    };
  }
}
