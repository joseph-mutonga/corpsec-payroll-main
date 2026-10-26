'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { PayrollPeriodData, PayrollRunData } from '@/types';
import {
  FileSpreadsheet,
  Search,
  Filter,
  Download,
  Printer,
  Calendar,
  Users,
  DollarSign,
  TrendingUp,
  Building2,
  MapPin,
  RefreshCw,
} from 'lucide-react';

export default function PayrollSummaryReportPage() {
  const { toast } = useToast();
  const [periods, setPeriods] = useState<PayrollPeriodData[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [runs, setRuns] = useState<PayrollRunData[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [reportData, setReportData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [stationFilter, setStationFilter] = useState<string>('');
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

  const fetchSummaryReport = useCallback(async () => {
    if (!selectedPeriodId) return;
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      params.append('periodId', selectedPeriodId);
      if (selectedRunId) params.append('runId', selectedRunId);
      if (departmentFilter) params.append('departmentId', departmentFilter);
      if (stationFilter) params.append('stationId', stationFilter);
      if (search) params.append('search', search);

      const res = await fetch(`/api/payroll/reports/summary?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setReportData(data.data);
      } else {
        setReportData(null);
      }
    } catch (err) {
      toast.error('Failed to fetch payroll summary report');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPeriodId, selectedRunId, departmentFilter, stationFilter, search, toast]);

  useEffect(() => {
    fetchSummaryReport();
  }, [fetchSummaryReport]);

  const handleExportCsv = () => {
    if (!selectedPeriodId) return;
    const params = new URLSearchParams();
    params.append('periodId', selectedPeriodId);
    if (selectedRunId) params.append('runId', selectedRunId);
    if (departmentFilter) params.append('departmentId', departmentFilter);
    if (stationFilter) params.append('stationId', stationFilter);
    if (search) params.append('search', search);
    params.append('format', 'csv');

    window.open(`/api/payroll/reports/summary?${params.toString()}`, '_blank');
  };

  const rows = reportData?.rows || [];
  const totals = reportData?.totals || {};
  const runInfo = reportData?.run;

  const departments = Array.from(new Set(rows.map((r: any) => r.department).filter(Boolean)));
  const stations = Array.from(new Set(rows.map((r: any) => r.station).filter(Boolean)));

  return (
    <div className="animate-fade-in space-y-6">
      <Breadcrumb
        items={[
          { label: 'Payroll Management', href: '/payroll' },
          { label: 'Payroll Summary Report' },
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
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700">
              <TrendingUp size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                Payroll Financial Summary Report
              </h1>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                High-level earnings, statutory deductions, net salaries, and company labor cost summary with totals audit.
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
            Print Summary
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Download size={14} />}
            onClick={handleExportCsv}
          >
            Export Excel / CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3.5">
        <Card noPadding>
          <div className="p-4">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Gross Payroll</span>
            <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono">
              KES {(totals.grossPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Headcount: {totals.employeeCount || 0}</span>
          </div>
        </Card>
        <Card noPadding>
          <div className="p-4">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Total Statutory Deductions</span>
            <div className="text-xl font-extrabold text-blue-700 mt-1 font-mono">
              KES {((totals.paye || 0) + (totals.nssf || 0) + (totals.sha || 0) + (totals.housingLevy || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-400 font-medium">PAYE + NSSF + SHA + AHL</span>
          </div>
        </Card>
        <Card noPadding>
          <div className="p-4">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Net Payable Payroll</span>
            <div className="text-xl font-extrabold text-emerald-700 mt-1 font-mono">
              KES {(totals.netPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-emerald-600 font-medium">100% Reconciled Net</span>
          </div>
        </Card>
        <Card noPadding>
          <div className="p-4">
            <span className="text-[11px] font-bold text-slate-500 uppercase">True Company Labor Cost</span>
            <div className="text-xl font-extrabold text-indigo-900 mt-1 font-mono">
              KES {(totals.employerCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-indigo-700 font-medium">Gross + Employer Match</span>
          </div>
        </Card>
      </div>

      {/* Filter Matrix */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Payroll Period</label>
            <select
              className="w-full h-9 pl-3 pr-8 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-800"
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
            <select
              className="w-full h-9 pl-3 pr-8 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-800"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="">All Departments</option>
              {departments.map((d: any) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Guarding Station</label>
            <select
              className="w-full h-9 pl-3 pr-8 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-800"
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
            >
              <option value="">All Stations</option>
              {stations.map((s: any) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Search Staff</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Name or Emp No..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Summary Table */}
      <Card noPadding>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">
            Payroll Summary Table &bull; {runInfo?.periodName || 'Current Period'} ({runInfo?.runNumber})
          </h3>
          <Badge variant="neutral">{rows.length} Staff</Badge>
        </div>

        {isLoading ? (
          <div className="py-12">
            <Spinner fullHeight message="Generating payroll summary..." />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            No payroll summary data found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold tracking-wider">
                  <th className="py-3 px-3">Emp No</th>
                  <th className="py-3 px-3">Employee Name</th>
                  <th className="py-3 px-3 text-right">Basic Pay</th>
                  <th className="py-3 px-3 text-right">Allowances</th>
                  <th className="py-3 px-3 text-right">Overtime</th>
                  <th className="py-3 px-3 text-right">Gross Pay</th>
                  <th className="py-3 px-3 text-right">PAYE</th>
                  <th className="py-3 px-3 text-right">NSSF</th>
                  <th className="py-3 px-3 text-right">SHA</th>
                  <th className="py-3 px-3 text-right">Housing</th>
                  <th className="py-3 px-3 text-right">Other Ded</th>
                  <th className="py-3 px-3 text-right">Total Ded</th>
                  <th className="py-3 px-3 text-right font-bold text-emerald-800">Net Pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {rows.map((row: any) => (
                  <tr key={row.employeeId} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{row.employeeNumber}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{row.fullName}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">{row.basicSalary.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">{row.allowances.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">{row.overtime.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{row.grossPay.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">{row.paye.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">{row.nssf.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">{row.sha.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">{row.housingLevy.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">{row.otherDeductions.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-rose-600 font-semibold">- {row.totalDeductions.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">{row.netPay.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              {/* Bottom Fixed Totals Row */}
              <tfoot>
                <tr className="bg-slate-900 text-white font-bold text-xs border-t-2 border-slate-950 font-mono">
                  <td className="py-3 px-3" colSpan={2}>
                    GRAND TOTALS ({totals.employeeCount} STAFF)
                  </td>
                  <td className="py-3 px-3 text-right">KES {(totals.basicSalary || 0).toLocaleString()}</td>
                  <td className="py-3 px-3 text-right">KES {(totals.allowances || 0).toLocaleString()}</td>
                  <td className="py-3 px-3 text-right">KES {(totals.overtime || 0).toLocaleString()}</td>
                  <td className="py-3 px-3 text-right text-amber-300">KES {(totals.grossPay || 0).toLocaleString()}</td>
                  <td className="py-3 px-3 text-right">KES {(totals.paye || 0).toLocaleString()}</td>
                  <td className="py-3 px-3 text-right">KES {(totals.nssf || 0).toLocaleString()}</td>
                  <td className="py-3 px-3 text-right">KES {(totals.sha || 0).toLocaleString()}</td>
                  <td className="py-3 px-3 text-right">KES {(totals.housingLevy || 0).toLocaleString()}</td>
                  <td className="py-3 px-3 text-right">KES {(totals.otherDeductions || 0).toLocaleString()}</td>
                  <td className="py-3 px-3 text-right text-rose-300">- KES {(totals.totalDeductions || 0).toLocaleString()}</td>
                  <td className="py-3 px-3 text-right text-emerald-400 text-sm">KES {(totals.netPay || 0).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
