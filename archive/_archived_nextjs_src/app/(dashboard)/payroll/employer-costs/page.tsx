'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { PayrollPeriodData, EmployerCostReportData } from '@/types';
import {
  Building2,
  Search,
  Filter,
  Download,
  Printer,
  DollarSign,
  Users,
  TrendingUp,
  PieChart,
  Layers,
  MapPin,
  Calendar,
} from 'lucide-react';

export default function EmployerCostsPage() {
  const { toast } = useToast();
  const [periods, setPeriods] = useState<PayrollPeriodData[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [reportData, setReportData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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

  const fetchCostReport = useCallback(async () => {
    if (!selectedPeriodId) return;
    try {
      setIsLoading(true);
      const res = await fetch(`/api/payroll/reports/employer-cost?periodId=${selectedPeriodId}`);
      const data = await res.json();
      if (data.success) {
        setReportData(data.data);
      } else {
        setReportData(null);
      }
    } catch (err) {
      toast.error('Failed to fetch employer cost report');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPeriodId, toast]);

  useEffect(() => {
    fetchCostReport();
  }, [fetchCostReport]);

  const handleExportCsv = () => {
    if (!selectedPeriodId) return;
    window.open(`/api/payroll/reports/employer-cost?periodId=${selectedPeriodId}&format=csv`, '_blank');
  };

  const costData: EmployerCostReportData | undefined = reportData?.report;
  const runInfo = reportData?.run;

  return (
    <div className="animate-fade-in space-y-6">
      <Breadcrumb
        items={[
          { label: 'Payroll Management', href: '/payroll' },
          { label: 'Employer Labor Cost Analysis' },
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
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
              <Building2 size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                Employer Total Payroll Cost Analysis
              </h1>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                Comprehensive total cost of workforce employment consolidating gross employee earnings and employer statutory contributions.
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
            Print Analysis
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Download size={14} />}
            onClick={handleExportCsv}
          >
            Export Cost File (CSV)
          </Button>
        </div>
      </div>

      {/* Period Selector Card */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-slate-500" />
            <span className="text-xs font-bold text-slate-700">Select Payroll Period:</span>
            <select
              className="h-9 pl-3 pr-8 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
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

          <div className="text-xs text-slate-500">
            Active Run: <strong className="text-slate-800">{runInfo?.runNumber || 'N/A'}</strong> &bull; Status: <Badge variant="neutral">{runInfo?.status || 'N/A'}</Badge>
          </div>
        </div>
      </Card>

      {/* Main Top-Level Cost KPIs */}
      {costData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <Card noPadding>
            <div className="p-4">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Direct Gross Payroll</span>
              <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono">
                KES {costData.totalGrossSalaries.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-400">Headcount: {costData.employeeCount} staff</span>
            </div>
          </Card>

          <Card noPadding>
            <div className="p-4">
              <span className="text-[11px] font-bold text-blue-700 uppercase">Employer NSSF Match</span>
              <div className="text-xl font-extrabold text-blue-800 mt-1 font-mono">
                KES {costData.totalEmployerNssf.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-400">Tier I &amp; II Matching (6%)</span>
            </div>
          </Card>

          <Card noPadding>
            <div className="p-4">
              <span className="text-[11px] font-bold text-purple-700 uppercase">Employer Housing Levy</span>
              <div className="text-xl font-extrabold text-purple-800 mt-1 font-mono">
                KES {costData.totalEmployerHousingLevy.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-400">Statutory 1.5% Matching</span>
            </div>
          </Card>

          <Card noPadding>
            <div className="p-4 bg-indigo-900 text-white rounded-xl shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-200">
                TRUE TOTAL LABOR COST
              </span>
              <div className="text-2xl font-extrabold mt-1 font-mono tracking-tight text-white">
                KES {costData.totalTrueEmployerCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-indigo-200">Gross Salaries + Employer Contributions</span>
            </div>
          </Card>
        </div>
      )}

      {/* Cost Component Breakdown Cards */}
      {costData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Department Cost Distribution */}
          <Card noPadding>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Building2 size={16} className="text-blue-600" />
                Labor Cost by Department
              </h3>
              <Badge variant="neutral">{costData.departmentBreakdown.length} Departments</Badge>
            </div>
            <div className="p-4 space-y-3">
              {costData.departmentBreakdown.map((dept) => (
                <div key={dept.department} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-800">{dept.department} ({dept.headcount} staff)</span>
                    <span className="font-mono text-slate-900">
                      KES {dept.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({dept.costSharePercentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full"
                      style={{ width: `${dept.costSharePercentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Regional Branch Cost Distribution */}
          <Card noPadding>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <MapPin size={16} className="text-emerald-600" />
                Labor Cost by Operating Branch
              </h3>
              <Badge variant="neutral">{costData.branchBreakdown.length} Branches</Badge>
            </div>
            <div className="p-4 space-y-3">
              {costData.branchBreakdown.map((branch) => (
                <div key={branch.branch} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-800">{branch.branch} ({branch.headcount} staff)</span>
                    <span className="font-mono text-slate-900">
                      KES {branch.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({branch.costSharePercentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full rounded-full"
                      style={{ width: `${branch.costSharePercentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
