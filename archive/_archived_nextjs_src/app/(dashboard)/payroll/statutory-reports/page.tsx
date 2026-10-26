'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { PayrollPeriodData, StatutoryReportItem } from '@/types';
import {
  ShieldCheck,
  Search,
  Filter,
  Download,
  Printer,
  Calendar,
  Building2,
  FileSpreadsheet,
  CheckCircle2,
  DollarSign,
  Layers,
} from 'lucide-react';

export default function StatutoryReportsPage() {
  const { toast } = useToast();
  const [periods, setPeriods] = useState<PayrollPeriodData[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [activeRegime, setActiveRegime] = useState<'PAYE' | 'NSSF' | 'SHA' | 'HOUSING_LEVY'>('PAYE');
  const [reportData, setReportData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  useEffect(() => {
    fetchPeriods();
  }, []);

  const fetchPeriods = async () => {
    try {
      const res = await fetch('/api/payroll/periods?year=2026');
      const data = await res.json();
      if (data.success && data.data) {
        setPeriods(data.data);
        const openPeriod = data.data.find((p: any) => p.status === 'OPEN') || data.data[data.data.length - 1];
        if (openPeriod) setSelectedPeriodId(openPeriod.id);
      }
    } catch (err) {
      toast.error('Failed to load periods');
    }
  };

  const fetchStatutoryReport = useCallback(async () => {
    if (!selectedPeriodId) return;
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      params.append('periodId', selectedPeriodId);
      params.append('regime', activeRegime);
      if (search) params.append('search', search);

      const res = await fetch(`/api/payroll/reports/statutory?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setReportData(data.data);
      } else {
        setReportData(null);
      }
    } catch (err) {
      toast.error('Failed to fetch statutory report');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPeriodId, activeRegime, search, toast]);

  useEffect(() => {
    fetchStatutoryReport();
  }, [fetchStatutoryReport]);

  const handleExportCsv = () => {
    if (!selectedPeriodId) return;
    const params = new URLSearchParams();
    params.append('periodId', selectedPeriodId);
    params.append('regime', activeRegime);
    if (search) params.append('search', search);
    params.append('format', 'csv');

    window.open(`/api/payroll/reports/statutory?${params.toString()}`, '_blank');
  };

  const report = reportData?.report;
  const items: StatutoryReportItem[] = report?.items || [];
  const runInfo = reportData?.run;
  const metrics = report?.summaryMetrics || {};

  return (
    <div className="animate-fade-in space-y-6">
      <Breadcrumb
        items={[
          { label: 'Payroll Management', href: '/payroll' },
          { label: 'Kenya Statutory Returns' },
        ]}
      />

      {/* Header Banner */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '24px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
        className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                Kenyan Statutory Tax &amp; Contribution Schedules
              </h1>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                Official statutory returns schedules for KRA PAYE, NSSF Tier I &amp; II, SHA (SHIF), and Affordable Housing Levy (AHL).
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Printer size={14} />}
            onClick={() => window.print()}
          >
            Print Schedule
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Download size={14} />}
            onClick={handleExportCsv}
          >
            Export Return File (CSV)
          </Button>
        </div>
      </div>

      {/* Period Selector & Regime Switcher Tabs */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Regime Switcher Pills */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setActiveRegime('PAYE')}
              className={`px-3.5 py-1.5 rounded-lg transition-all ${
                activeRegime === 'PAYE'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              KRA PAYE Tax
            </button>
            <button
              onClick={() => setActiveRegime('NSSF')}
              className={`px-3.5 py-1.5 rounded-lg transition-all ${
                activeRegime === 'NSSF'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              NSSF Tier I &amp; II
            </button>
            <button
              onClick={() => setActiveRegime('SHA')}
              className={`px-3.5 py-1.5 rounded-lg transition-all ${
                activeRegime === 'SHA'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              SHA / SHIF (2.75%)
            </button>
            <button
              onClick={() => setActiveRegime('HOUSING_LEVY')}
              className={`px-3.5 py-1.5 rounded-lg transition-all ${
                activeRegime === 'HOUSING_LEVY'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Housing Levy (3.0%)
            </button>
          </div>

          {/* Period Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600">Period:</span>
            <select
              className="h-9 pl-3 pr-8 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Metric Summary Card for the selected statutory regime */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <Card noPadding>
          <div className="p-4">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Target Staff Count</span>
            <div className="text-xl font-extrabold text-slate-900 mt-1">{report?.totalEmployeeCount || 0}</div>
            <span className="text-[11px] text-slate-400">Total contributors in schedule</span>
          </div>
        </Card>

        <Card noPadding>
          <div className="p-4">
            <span className="text-[11px] font-bold text-slate-500 uppercase">
              {activeRegime === 'PAYE'
                ? 'Total Taxable Income'
                : activeRegime === 'NSSF'
                ? 'Total Employee NSSF'
                : activeRegime === 'HOUSING_LEVY'
                ? 'Total Employee Levy (1.5%)'
                : 'Total Assessable Gross'}
            </span>
            <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono">
              KES{' '}
              {(
                activeRegime === 'PAYE'
                  ? metrics.totalGrossTaxable || 0
                  : activeRegime === 'NSSF'
                  ? metrics.totalEmployeeContribution || 0
                  : activeRegime === 'HOUSING_LEVY'
                  ? metrics.totalEmployeeLevy || 0
                  : metrics.totalAssessableEarnings || 0
              ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-400">Direct employee component</span>
          </div>
        </Card>

        <Card noPadding>
          <div className="p-4">
            <span className="text-[11px] font-bold text-emerald-700 uppercase">
              Total Remittance Due ({activeRegime})
            </span>
            <div className="text-xl font-extrabold text-emerald-800 mt-1 font-mono">
              KES {(report?.totalPayableAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-emerald-600 font-medium">Full liability payable to authority</span>
          </div>
        </Card>
      </div>

      {/* Schedule Table */}
      <Card noPadding>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">{report?.title}</h3>
            <p className="text-[11px] text-slate-400 m-0">
              Run: <strong className="text-slate-600">{runInfo?.runNumber}</strong> &bull; Period: <strong className="text-slate-600">{runInfo?.periodName}</strong>
            </p>
          </div>
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search PIN / name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-9 pr-3 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="py-12">
            <Spinner fullHeight message="Compiling statutory schedule..." />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            No statutory records found for the selected period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* PAYE Table View */}
            {activeRegime === 'PAYE' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold tracking-wider">
                    <th className="py-3 px-3">Emp No</th>
                    <th className="py-3 px-3">Employee Name</th>
                    <th className="py-3 px-3">KRA PIN</th>
                    <th className="py-3 px-3">Department</th>
                    <th className="py-3 px-3 text-right">Gross Pay (KES)</th>
                    <th className="py-3 px-3 text-right">Taxable Income (KES)</th>
                    <th className="py-3 px-3 text-right">Personal Relief</th>
                    <th className="py-3 px-3 text-right font-bold text-slate-900">Net PAYE Tax (KES)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {items.map((row) => (
                    <tr key={row.employeeNumber} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{row.employeeNumber}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{row.fullName}</td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-700">{row.kraPin}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.department}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">{row.grossPay.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">{row.taxableIncome.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">({row.personalRelief.toFixed(2)})</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">{row.payeTax.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* NSSF Table View */}
            {activeRegime === 'NSSF' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold tracking-wider">
                    <th className="py-3 px-3">Emp No</th>
                    <th className="py-3 px-3">Employee Name</th>
                    <th className="py-3 px-3">NSSF No</th>
                    <th className="py-3 px-3 text-right">Pensionable Pay</th>
                    <th className="py-3 px-3 text-right">Tier 1 Emp</th>
                    <th className="py-3 px-3 text-right">Tier 2 Emp</th>
                    <th className="py-3 px-3 text-right font-semibold">Total Emp</th>
                    <th className="py-3 px-3 text-right">Tier 1 Emplr</th>
                    <th className="py-3 px-3 text-right">Tier 2 Emplr</th>
                    <th className="py-3 px-3 text-right font-semibold">Total Emplr</th>
                    <th className="py-3 px-3 text-right font-bold text-slate-900">Grand Total NSSF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {items.map((row) => (
                    <tr key={row.employeeNumber} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{row.employeeNumber}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{row.fullName}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{row.nssfNumber}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">{row.pensionableEarnings.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">{row.nssfTier1Employee.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">{row.nssfTier2Employee.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">{row.nssfTotalEmployee.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">{row.nssfTier1Employer.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">{row.nssfTier2Employer.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">{row.nssfTotalEmployer.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">{row.nssfGrandTotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* SHA Table View */}
            {activeRegime === 'SHA' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold tracking-wider">
                    <th className="py-3 px-3">Emp No</th>
                    <th className="py-3 px-3">Employee Name</th>
                    <th className="py-3 px-3">SHA Number</th>
                    <th className="py-3 px-3">Department</th>
                    <th className="py-3 px-3 text-right">Assessable Gross (KES)</th>
                    <th className="py-3 px-3 text-right font-bold text-slate-900">Member SHA (2.75%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {items.map((row) => (
                    <tr key={row.employeeNumber} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{row.employeeNumber}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{row.fullName}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{row.shaNumber}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.department}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">{row.grossPay.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">{row.shaEmployee.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Housing Levy Table View */}
            {activeRegime === 'HOUSING_LEVY' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold tracking-wider">
                    <th className="py-3 px-3">Emp No</th>
                    <th className="py-3 px-3">Employee Name</th>
                    <th className="py-3 px-3">KRA PIN</th>
                    <th className="py-3 px-3">Department</th>
                    <th className="py-3 px-3 text-right">Gross Earnings (KES)</th>
                    <th className="py-3 px-3 text-right">Employee 1.5% (KES)</th>
                    <th className="py-3 px-3 text-right">Employer 1.5% (KES)</th>
                    <th className="py-3 px-3 text-right font-bold text-slate-900">Total Housing Levy 3.0%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {items.map((row) => (
                    <tr key={row.employeeNumber} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{row.employeeNumber}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{row.fullName}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{row.kraPin}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.department}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">{row.grossPay.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">{row.housingLevyEmployee.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">{row.housingLevyEmployer.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">{row.housingLevyTotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
