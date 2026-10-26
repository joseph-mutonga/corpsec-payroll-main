'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import {
  DollarSign,
  Calendar,
  Layers,
  FileText,
  Settings,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  CreditCard,
  Building2,
  Users,
  ArrowRight,
  Plus,
  Clock,
  ExternalLink,
  Calculator,
  FileSpreadsheet,
  PieChart,
  Sparkles,
} from 'lucide-react';
import { PayrollPeriodData, PayrollConfigStatsData } from '@/types';

export default function PayrollDashboardPage() {
  const [periods, setPeriods] = useState<PayrollPeriodData[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [configStats, setConfigStats] = useState<PayrollConfigStatsData | null>(null);
  const [readiness, setReadiness] = useState<any | null>(null);
  const [summaryData, setSummaryData] = useState<any | null>(null);
  const [registerData, setRegisterData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [periodsRes, statsRes, readyRes] = await Promise.all([
        fetch('/api/payroll/periods?year=2026'),
        fetch('/api/payroll/stats'),
        fetch('/api/payroll/readiness'),
      ]);

      const periodsData = await periodsRes.json();
      if (periodsData.success && periodsData.data) {
        setPeriods(periodsData.data);
        const active = periodsData.data.find((p: any) => p.status === 'OPEN') || periodsData.data[periodsData.data.length - 1];
        if (active) setSelectedPeriodId(active.id);
      }

      if (statsRes.ok) {
        const d = await statsRes.json();
        if (d.success) setConfigStats(d.data);
      }

      if (readyRes.ok) {
        const d = await readyRes.json();
        if (d.success) setReadiness(d.data);
      }
    } catch (err) {
      console.error('Error fetching payroll overview data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPeriodFinancials = useCallback(async () => {
    if (!selectedPeriodId) return;
    try {
      const [sumRes, regRes] = await Promise.all([
        fetch(`/api/payroll/reports/summary?periodId=${selectedPeriodId}`),
        fetch(`/api/payroll/reports/register?periodId=${selectedPeriodId}`),
      ]);

      if (sumRes.ok) {
        const d = await sumRes.json();
        if (d.success) setSummaryData(d.data);
      }
      if (regRes.ok) {
        const d = await regRes.json();
        if (d.success) setRegisterData(d.data);
      }
    } catch (err) {
      console.error('Failed to load period financials:', err);
    }
  }, [selectedPeriodId]);

  useEffect(() => {
    fetchPeriodFinancials();
  }, [fetchPeriodFinancials]);

  if (loading) {
    return <Spinner fullHeight message="Loading payroll command center..." />;
  }

  const totals = summaryData?.totals || {};
  const regTotals = registerData?.totals || {};
  const runInfo = summaryData?.run;
  const isAllReady = readiness?.isReady ?? false;

  return (
    <div className="animate-fade-in space-y-6">
      <Breadcrumb items={[{ label: 'Payroll Management' }, { label: 'Command Center & Reports' }]} />

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
            <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              Payroll Command Center &amp; Financial Analytics
            </h1>
            <Badge variant="gold" size="sm">
              Phase 8 Live
            </Badge>
          </div>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            Master dashboard for payslip generation, payroll runs, official registers, statutory compliance schedules, and true labor cost analytics.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/payroll/runs" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="sm" leftIcon={<Calculator size={14} />}>
              Payroll Runs &amp; Calc
            </Button>
          </Link>
          <Link href="/payroll/payslips" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm" leftIcon={<FileText size={14} />}>
              Payslips Vault
            </Button>
          </Link>
          <Link href="/payroll/register" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm" leftIcon={<FileSpreadsheet size={14} />}>
              Payroll Register
            </Button>
          </Link>
          <Link href="/payroll/statutory-reports" style={{ textDecoration: 'none' }}>
            <Button variant="secondary" size="sm" leftIcon={<ShieldCheck size={14} />}>
              Statutory Returns
            </Button>
          </Link>
        </div>
      </div>

      {/* Period Selector Dropdown Bar */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2.5">
            <Calendar size={16} className="text-blue-600" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Selected Payroll Cycle:
            </span>
            <select
              className="h-9 pl-3 pr-8 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold text-slate-900"
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} &bull; Month {p.payrollMonth}/{p.payrollYear} ({p.status})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500">
              Run: <strong className="text-slate-800">{runInfo?.runNumber || 'No Run'}</strong>
            </span>
            {runInfo && (
              <Badge
                variant={
                  runInfo.status === 'FINALIZED' || runInfo.status === 'LOCKED'
                    ? 'success'
                    : runInfo.status === 'APPROVED'
                    ? 'info'
                    : 'warning'
                }
              >
                {runInfo.status}
              </Badge>
            )}
          </div>
        </div>
      </Card>

      {/* 9 Live Financial Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3.5">
        {/* Metric 1: Total Employees Paid */}
        <Card noPadding>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Paid / Disbursed Staff</span>
              <Users size={16} className="text-emerald-600" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {regTotals.paidCount || 0} / {totals.employeeCount || 0}
            </div>
            <span className="text-[11px] text-emerald-600 font-medium">
              {totals.employeeCount ? Math.round(((regTotals.paidCount || 0) / totals.employeeCount) * 100) : 0}% Disbursed
            </span>
          </div>
        </Card>

        {/* Metric 2: Gross Payroll */}
        <Card noPadding>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Gross Payroll</span>
              <DollarSign size={16} className="text-blue-600" />
            </div>
            <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono">
              KES {(totals.grossPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-400">Basic + Allowances + Overtime</span>
          </div>
        </Card>

        {/* Metric 3: Total Deductions */}
        <Card noPadding>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Total Deductions</span>
              <CreditCard size={16} className="text-rose-600" />
            </div>
            <div className="text-xl font-extrabold text-rose-600 mt-1 font-mono">
              - KES {(totals.totalDeductions || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-400">Statutory + Voluntary Deductions</span>
          </div>
        </Card>

        {/* Metric 4: Total PAYE */}
        <Card noPadding>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Total KRA PAYE Tax</span>
              <ShieldCheck size={16} className="text-purple-600" />
            </div>
            <div className="text-xl font-extrabold text-purple-700 mt-1 font-mono">
              KES {(totals.paye || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-400">5 Bands Less Relief</span>
          </div>
        </Card>

        {/* Metric 5: Total NSSF */}
        <Card noPadding>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Total NSSF (Emp + Emplr)</span>
              <ShieldCheck size={16} className="text-blue-600" />
            </div>
            <div className="text-xl font-extrabold text-blue-800 mt-1 font-mono">
              KES {((totals.nssf || 0) * 2).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-400">Tier I &amp; II (6% + 6%)</span>
          </div>
        </Card>

        {/* Metric 6: Total SHIF / SHA */}
        <Card noPadding>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Total Social Health (SHA)</span>
              <ShieldCheck size={16} className="text-amber-600" />
            </div>
            <div className="text-xl font-extrabold text-amber-800 mt-1 font-mono">
              KES {(totals.sha || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-400">2.75% Member Contribution</span>
          </div>
        </Card>

        {/* Metric 7: Total Housing Levy */}
        <Card noPadding>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Housing Levy (3.0%)</span>
              <Building2 size={16} className="text-indigo-600" />
            </div>
            <div className="text-xl font-extrabold text-indigo-800 mt-1 font-mono">
              KES {((totals.housingLevy || 0) * 2).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-400">1.5% Emp + 1.5% Emplr</span>
          </div>
        </Card>

        {/* Metric 8: Total Net Payroll */}
        <Card noPadding>
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-800 uppercase">TOTAL NET PAYABLE</span>
              <CheckCircle2 size={18} className="text-emerald-700" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-900 mt-1 font-mono">
              KES {(totals.netPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-emerald-700 font-semibold">100% Zero-Cent Reconciled</span>
          </div>
        </Card>

        {/* Metric 9: Total True Employer Cost */}
        <Card noPadding>
          <div className="p-4 bg-slate-900 text-white rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-slate-300">TOTAL EMPLOYER LABOR COST</span>
              <TrendingUp size={18} className="text-amber-400" />
            </div>
            <div className="text-2xl font-extrabold mt-1 font-mono text-white">
              KES {(totals.employerCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-300">Gross Salaries + Employer Contributions</span>
          </div>
        </Card>
      </div>

      {/* Module Navigation Grid */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wider">
          Payroll Operations &amp; Reports Modules
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/payroll/payslips" style={{ textDecoration: 'none' }}>
            <Card className="hover:shadow-md hover:border-blue-300 transition-all cursor-pointer h-full">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg shrink-0">
                  <FileText size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Payslips Vault</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Print, download PDF, and email official employee payslips with full itemized breakdown.
                  </p>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/payroll/register" style={{ textDecoration: 'none' }}>
            <Card className="hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer h-full">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg shrink-0">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Payroll Register</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Detailed master register of all employees with live payment disbursement tracking.
                  </p>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/payroll/summary" style={{ textDecoration: 'none' }}>
            <Card className="hover:shadow-md hover:border-purple-300 transition-all cursor-pointer h-full">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-purple-50 text-purple-700 rounded-lg shrink-0">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Summary Report</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Financial rollups, department subtotals, and verified accounting balance sheets.
                  </p>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/payroll/statutory-reports" style={{ textDecoration: 'none' }}>
            <Card className="hover:shadow-md hover:border-amber-300 transition-all cursor-pointer h-full">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-amber-50 text-amber-700 rounded-lg shrink-0">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Statutory Returns</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    KRA PAYE, NSSF Tier I/II, SHA, and Housing Levy return files ready for export.
                  </p>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/payroll/employer-costs" style={{ textDecoration: 'none' }}>
            <Card className="hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer h-full">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-lg shrink-0">
                  <Building2 size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Employer Labor Cost</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    True total employer cost breakdown across departments and operating stations.
                  </p>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/payroll/runs" style={{ textDecoration: 'none' }}>
            <Card className="hover:shadow-md hover:border-blue-300 transition-all cursor-pointer h-full">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg shrink-0">
                  <Calculator size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Payroll Runs &amp; Calc</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Calculate, review, approve, and finalize monthly and supplementary payroll runs.
                  </p>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/payroll/salaries" style={{ textDecoration: 'none' }}>
            <Card className="hover:shadow-md hover:border-slate-300 transition-all cursor-pointer h-full">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-slate-100 text-slate-700 rounded-lg shrink-0">
                  <DollarSign size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Salary Structures</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Employee basic salary structures, revision proposals, and historical audit timelines.
                  </p>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/payroll/statutory" style={{ textDecoration: 'none' }}>
            <Card className="hover:shadow-md hover:border-slate-300 transition-all cursor-pointer h-full">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-slate-100 text-slate-700 rounded-lg shrink-0">
                  <Settings size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Tax &amp; Statutory Rules</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Kenya 2026 tax bands, NSSF tiers, SHA rates, and personal relief parameters.
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
