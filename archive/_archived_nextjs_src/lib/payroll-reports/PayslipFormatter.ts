// CorpSec HR Payroll — Payslip Formatter Engine
// Transforms PayrollEmployeeRecord and calculationTrace into clean structured FormattedPayslipData

import { FormattedPayslipData, PayslipItem, PayrollPaymentStatus } from '@/types';

export class PayslipFormatter {
  public static format(
    record: any,
    companySettings?: any
  ): FormattedPayslipData {
    let trace: any = {};
    if (record.calculationTrace) {
      try {
        trace = typeof record.calculationTrace === 'string'
          ? JSON.parse(record.calculationTrace)
          : record.calculationTrace;
      } catch (e) {
        trace = {};
      }
    }

    const employee = record.employee || {};
    const payrollRun = record.payrollRun || {};
    const period = payrollRun.payrollPeriod || {};

    // Format company info
    const company = {
      name: companySettings?.companyName || 'CorpSec Investigations & Guarding Services Limited',
      tagline: companySettings?.tagline || 'Professional Security & Guarding Services',
      kraPin: companySettings?.kraPin || 'P051234567Z',
      address: companySettings?.address || 'CorpSec House, Upper Hill, P.O. Box 45678 - 00100, Nairobi, Kenya',
      email: companySettings?.email || 'payroll@corpsec.co.ke',
      phone: companySettings?.phone || '+254 20 271 9000 / +254 722 000 000',
    };

    // Format allowances list
    const allowances: PayslipItem[] = [];
    if (trace.allowances?.items && Array.isArray(trace.allowances.items)) {
      for (const item of trace.allowances.items) {
        allowances.push({
          name: item.name || 'Allowance',
          code: item.code,
          amount: Number(item.amount || 0),
          type: 'EARNING',
          isTaxable: item.isTaxable !== false,
          isPensionable: item.isPensionable !== false,
        });
      }
    } else if (record.totalAllowances > 0) {
      allowances.push({
        name: 'Allowances',
        amount: record.totalAllowances,
        type: 'EARNING',
        isTaxable: true,
      });
    }

    // Format other deductions list
    const otherDeductions: PayslipItem[] = [];
    if (trace.otherDeductions?.items && Array.isArray(trace.otherDeductions.items)) {
      for (const item of trace.otherDeductions.items) {
        otherDeductions.push({
          name: item.name || 'Deduction',
          code: item.code,
          amount: Number(item.amount || 0),
          type: 'OTHER_DEDUCTION',
          currentBalance: item.currentBalance !== undefined ? Number(item.currentBalance) : undefined,
        });
      }
    } else if (record.totalOtherDeductions > 0) {
      otherDeductions.push({
        name: 'Voluntary & Other Deductions',
        amount: record.totalOtherDeductions,
        type: 'OTHER_DEDUCTION',
      });
    }

    // Overtime
    const overtime = {
      hours: Number(record.overtimeHours || trace.overtime?.totalApprovedHours || 0),
      amount: Number(record.totalOvertimePay || trace.overtime?.totalOvertimePay || 0),
    };

    // Pay date resolution
    const payDate = period.payDate
      ? new Date(period.payDate).toISOString().slice(0, 10)
      : `${period.payrollYear || 2026}-${String(period.payrollMonth || 8).padStart(2, '0')}-28`;

    return {
      recordId: record.id,
      runId: payrollRun.id || record.payrollRunId,
      runNumber: payrollRun.runNumber || 'PAY-RUN',
      periodName: period.name || `${period.payrollYear || 2026} Month ${period.payrollMonth || 8}`,
      periodMonth: Number(period.payrollMonth || 8),
      periodYear: Number(period.payrollYear || 2026),
      payDate,
      company,
      employee: {
        id: employee.id || record.employeeId,
        employeeNumber: employee.employeeNumber || record.employeeId?.slice(-6) || 'EMP-001',
        fullName: employee.fullName || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'Employee',
        nationalId: employee.nationalId || 'N/A',
        jobTitle: record.jobTitle || employee.jobTitle || employee.position?.title || 'Security Guard',
        employmentType: employee.employmentType || 'PERMANENT',
        department: record.departmentName || employee.department?.name || 'Guarding Operations',
        branch: record.branchName || employee.branch?.name || 'Nairobi HQ',
        station: record.stationName || employee.station?.name || 'Field Floating',
        kraPin: record.kraPin || employee.kraPin || 'N/A',
        nssfNumber: record.nssfNumber || employee.nssfNumber || 'N/A',
        shaNumber: record.shaNumber || employee.shaNumber || 'N/A',
        paymentMethod: record.paymentMethod || employee.paymentMethod || 'BANK',
        bankName: record.bankName || employee.bankName || undefined,
        bankAccount: record.bankAccountNumber || employee.bankAccountNumber || undefined,
        mpesaPhone: record.mpesaPhoneNumber || employee.mpesaPhoneNumber || undefined,
      },
      salaryStructure: {
        basicSalary: Number(record.basicSalary || 0),
        proratedBasicPay: Number(record.proratedBasicPay || record.basicSalary || 0),
        unpaidLeaveDeduction: Number(record.unpaidLeaveDeduction || 0),
        absenceDeduction: Number(record.absenceDeduction || 0),
      },
      earnings: {
        basicPay: Number(record.proratedBasicPay || record.basicSalary || 0),
        allowances,
        overtime,
        bonuses: Number(record.totalBonusPay || 0),
        commissions: Number(record.totalCommissionPay || 0),
        otherEarnings: Number(record.totalOtherEarnings || 0),
        grossPay: Number(record.grossPay || 0),
        taxableGross: Number(record.taxableGross || record.grossPay || 0),
      },
      deductions: {
        payeTax: Number(record.payeTax || 0),
        personalRelief: Number(record.personalRelief || 2400),
        nssfTier1: Number(record.nssfTier1Employee || 0),
        nssfTier2: Number(record.nssfTier2Employee || 0),
        totalNssf: Number((record.nssfTier1Employee || 0) + (record.nssfTier2Employee || 0)),
        sha: Number(record.shaEmployee || 0),
        housingLevy: Number(record.housingLevyEmployee || 0),
        totalStatutory: Number(record.totalStatutoryDeductions || 0),
        otherDeductions,
        totalOtherDeductions: Number(record.totalOtherDeductions || 0),
        totalDeductions: Number(record.totalDeductions || 0),
      },
      summary: {
        grossPay: Number(record.grossPay || 0),
        totalDeductions: Number(record.totalDeductions || 0),
        netPay: Number(record.netPay || 0),
      },
      employerContributions: {
        nssfTier1: Number(record.nssfTier1Employer || 0),
        nssfTier2: Number(record.nssfTier2Employer || 0),
        totalNssf: Number((record.nssfTier1Employer || 0) + (record.nssfTier2Employer || 0)),
        sha: Number(record.shaEmployer || 0),
        housingLevy: Number(record.housingLevyEmployer || 0),
        totalContributions: Number(record.totalEmployerContributions || 0),
      },
      paymentStatus: (record.paymentStatus as PayrollPaymentStatus) || 'PENDING',
      paidAt: record.paidAt ? new Date(record.paidAt).toISOString() : null,
      paymentReference: record.paymentReference || null,
      notes: record.paymentNotes || undefined,
    };
  }
}
