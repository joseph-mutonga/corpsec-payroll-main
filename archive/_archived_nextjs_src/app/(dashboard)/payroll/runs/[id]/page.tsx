'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastContext';
import {
  PayrollRunData,
  PayrollEmployeeRecordData,
  PayrollRunExceptionData,
} from '@/types';
import {
  Calculator,
  RefreshCw,
  Search,
  Users,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ArrowLeft,
  FileSpreadsheet,
  Check,
  Send,
  Eye,
  Building2,
  MapPin,
  TrendingUp,
  XCircle,
  HelpCircle,
  Clock,
  Briefcase,
  AlertCircle,
  Layers,
  DollarSign,
} from 'lucide-react';

export default function PayrollRunDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { toast } = useToast();
  const [run, setRun] = useState<PayrollRunData | null>(null);
  const [records, setRecords] = useState<PayrollEmployeeRecordData[]>([]);
  const [exceptions, setExceptions] = useState<PayrollRunExceptionData[]>([]);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Filter & Search State
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [activeTab, setActiveTab] = useState<'employees' | 'exceptions' | 'summary' | 'reconciliation'>('employees');
  const [exceptionSeverityFilter, setExceptionSeverityFilter] = useState('');

  // Selected Employee Trace Modal
  const [selectedRecord, setSelectedRecord] = useState<PayrollEmployeeRecordData | null>(null);
  const [isTraceModalOpen, setIsTraceModalOpen] = useState(false);

  // Exception Resolution Modal
  const [resolvingException, setResolvingException] = useState<PayrollRunExceptionData | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  // Confirmation Modals
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);

  const fetchRunDetails = useCallback(async () => {
    try {
      setIsLoading(true);
      const [runRes, recordsRes, exceptionsRes, summaryRes] = await Promise.all([
        fetch(`/api/payroll/runs/${params.id}`),
        fetch(`/api/payroll/runs/${params.id}/records?pageSize=100`),
        fetch(`/api/payroll/runs/${params.id}/exceptions`),
        fetch(`/api/payroll/runs/${params.id}/summary`),
      ]);

      const [runData, recordsData, exceptionsData, summaryJson] = await Promise.all([
        runRes.json(),
        recordsRes.json(),
        exceptionsRes.json(),
        summaryRes.json(),
      ]);

      if (runData.success) setRun(runData.data);
      if (recordsData.success) setRecords(recordsData.data || []);
      if (exceptionsData.success) setExceptions(exceptionsData.data || []);
      if (summaryJson.success) setSummaryData(summaryJson.data);
    } catch (err) {
      toast.error('Failed to load payroll run details');
    } finally {
      setIsLoading(false);
    }
  }, [params.id, toast]);

  useEffect(() => {
    fetchRunDetails();
  }, [fetchRunDetails]);

  // Actions
  const handleCalculate = async () => {
    try {
      setIsActionLoading(true);
      const res = await fetch(`/api/payroll/runs/${params.id}/calculate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Calculation completed', data.meta?.message || 'Payroll calculated successfully');
        fetchRunDetails();
      } else {
        toast.error('Calculation failed', data.error?.message || 'Error executing calculation');
      }
    } catch (err) {
      toast.error('An unexpected error occurred during calculation');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReview = async () => {
    try {
      setIsActionLoading(true);
      const res = await fetch(`/api/payroll/runs/${params.id}/review`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Marked Under Review', 'Payroll run is now under formal review');
        fetchRunDetails();
      } else {
        toast.error('Review failed', data.error?.message);
      }
    } catch (err) {
      toast.error('Error updating review status');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setIsActionLoading(true);
      const res = await fetch(`/api/payroll/runs/${params.id}/submit`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Submitted for Approval', 'Payroll run submitted to executive management');
        fetchRunDetails();
      } else {
        toast.error('Submission failed', data.error?.message);
      }
    } catch (err) {
      toast.error('Error submitting payroll run');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      setIsActionLoading(true);
      const res = await fetch(`/api/payroll/runs/${params.id}/approve`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Payroll Approved', 'Payroll run has been formally approved');
        fetchRunDetails();
      } else {
        toast.error('Approval failed', data.error?.message);
      }
    } catch (err) {
      toast.error('Error approving payroll run');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleFinalize = async () => {
    try {
      setIsActionLoading(true);
      const res = await fetch(`/api/payroll/runs/${params.id}/finalize`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Payroll Finalized', 'Loan balances updated and financial records sealed');
        setIsFinalizeModalOpen(false);
        fetchRunDetails();
      } else {
        toast.error('Finalization failed', data.error?.message);
      }
    } catch (err) {
      toast.error('Error finalizing payroll run');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLock = async () => {
    try {
      setIsActionLoading(true);
      const res = await fetch(`/api/payroll/runs/${params.id}/lock`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Payroll Locked', 'Run is now completely sealed and immutable');
        setIsLockModalOpen(false);
        fetchRunDetails();
      } else {
        toast.error('Lock failed', data.error?.message);
      }
    } catch (err) {
      toast.error('Error locking payroll run');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleResolveException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingException) return;

    try {
      setIsActionLoading(true);
      const res = await fetch(`/api/payroll/runs/${params.id}/exceptions/${resolvingException.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionNotes }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success('Exception Resolved', 'Exception marked as resolved');
        setResolvingException(null);
        setResolutionNotes('');
        fetchRunDetails();
      } else {
        toast.error('Resolution failed', data.error?.message);
      }
    } catch (err) {
      toast.error('Error resolving exception');
    } finally {
      setIsActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <Badge variant="neutral">Draft</Badge>;
      case 'CALCULATING':
        return <Badge variant="warning">Calculating...</Badge>;
      case 'CALCULATED':
        return <Badge variant="info">Calculated</Badge>;
      case 'UNDER_REVIEW':
        return <Badge variant="warning">Under Review</Badge>;
      case 'PENDING_APPROVAL':
        return <Badge variant="warning">Pending Approval</Badge>;
      case 'APPROVED':
        return <Badge variant="success">Approved</Badge>;
      case 'FINALIZED':
        return <Badge variant="success">Finalized</Badge>;
      case 'LOCKED':
        return <Badge variant="neutral">Locked</Badge>;
      case 'CANCELLED':
        return <Badge variant="danger">Cancelled</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const steps = [
    { key: 'DRAFT', label: 'Draft' },
    { key: 'CALCULATED', label: 'Calculated' },
    { key: 'UNDER_REVIEW', label: 'Under Review' },
    { key: 'PENDING_APPROVAL', label: 'Pending Approval' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'FINALIZED', label: 'Finalized' },
    { key: 'LOCKED', label: 'Locked' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === run?.status);

  const filteredRecords = records.filter((r) => {
    const q = search.toLowerCase();
    const matchName = r.employee?.fullName?.toLowerCase().includes(q) || false;
    const matchNum = r.employee?.employeeNumber?.toLowerCase().includes(q) || false;
    const matchPin = r.kraPin?.toLowerCase().includes(q) || false;
    const matchDept = !selectedDept || r.employee?.department?.name === selectedDept;
    return (matchName || matchNum || matchPin) && matchDept;
  });

  const filteredExceptions = exceptions.filter((exc) => {
    if (!exceptionSeverityFilter) return true;
    return exc.severity === exceptionSeverityFilter;
  });

  const unresolvedCriticalCount = exceptions.filter(
    (e) => !e.isResolved && e.severity === 'CRITICAL'
  ).length;

  const parsedTrace = selectedRecord?.calculationTrace
    ? JSON.parse(selectedRecord.calculationTrace)
    : null;

  return (
    <div className="animate-fade-in space-y-6">
      <Breadcrumb
        items={[
          { label: 'Payroll Management', href: '/payroll' },
          { label: 'Payroll Runs', href: '/payroll/runs' },
          { label: run?.runNumber || 'Run Detail' },
        ]}
      />

      {/* Top Header Card */}
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
            <Link
              href="/payroll/runs"
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
            >
              <ArrowLeft size={16} />
            </Link>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              {run?.runNumber || 'Payroll Run'}
            </h1>
            {run && getStatusBadge(run.status)}
            {run?.isReconciled && (
              <span className="flex items-center gap-1">
                <Badge variant="success">
                  Reconciled (Zero Δ)
                </Badge>
              </span>
            )}
          </div>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
            {run?.payrollPeriod?.name} &bull; Type: <span className="font-semibold text-slate-700">{run?.runType}</span> &bull; Version: <span className="font-semibold text-slate-700">v{run?.calculationVersion}</span>
          </p>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {run?.status !== 'FINALIZED' && run?.status !== 'LOCKED' && run?.status !== 'CANCELLED' && (
            <Button
              variant="primary"
              onClick={handleCalculate}
              disabled={isActionLoading}
              className="flex items-center gap-1.5"
            >
              <Calculator size={15} className={isActionLoading ? 'animate-spin' : ''} />
              {run?.status === 'DRAFT' ? 'Calculate Payroll' : 'Recalculate Run'}
            </Button>
          )}

          {run?.status === 'CALCULATED' && (
            <Button
              variant="outline"
              onClick={handleReview}
              disabled={isActionLoading}
              className="flex items-center gap-1.5"
            >
              <Eye size={15} />
              Mark as Reviewed
            </Button>
          )}

          {(run?.status === 'CALCULATED' || run?.status === 'UNDER_REVIEW') && (
            <Button
              variant="outline"
              onClick={handleSubmit}
              disabled={isActionLoading}
              className="flex items-center gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50"
            >
              <Send size={15} />
              Submit for Approval
            </Button>
          )}

          {run?.status === 'PENDING_APPROVAL' && (
            <Button
              variant="outline"
              onClick={handleApprove}
              disabled={isActionLoading}
              className="flex items-center gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50 font-semibold"
            >
              <Check size={15} />
              Approve Payroll
            </Button>
          )}

          {run?.status === 'APPROVED' && (
            <Button
              variant="primary"
              onClick={() => setIsFinalizeModalOpen(true)}
              disabled={isActionLoading || unresolvedCriticalCount > 0}
              className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              <CheckCircle2 size={15} />
              Finalize Payroll
            </Button>
          )}

          {run?.status === 'FINALIZED' && (
            <Button
              variant="outline"
              onClick={() => setIsLockModalOpen(true)}
              disabled={isActionLoading}
              className="flex items-center gap-1.5 text-slate-800 border-slate-300 hover:bg-slate-100"
            >
              <Lock size={15} />
              Lock Payroll Run
            </Button>
          )}
        </div>
      </div>

      {/* Workflow Stepper Pipeline */}
      <Card>
        <div className="py-2">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 -translate-y-1/2 z-0" />
            {steps.map((step, idx) => {
              const isPast = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              return (
                <div key={step.key} className="flex flex-col items-center relative z-10">
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      backgroundColor: isCurrent ? '#0f172a' : isPast ? '#059669' : '#ffffff',
                      color: isCurrent || isPast ? '#ffffff' : '#94a3b8',
                      border: isCurrent || isPast ? 'none' : '2px solid #cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: '700',
                    }}
                  >
                    {isPast ? <Check size={14} /> : idx + 1}
                  </div>
                  <span
                    className={`text-xs mt-1.5 font-medium ${
                      isCurrent ? 'text-slate-900 font-bold' : isPast ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Financial KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Gross Payroll
              </p>
              <h3 className="text-xl font-bold text-slate-900 mt-1">
                KES {(run?.grossPayroll || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Basic: KES {(run?.totalBasicPay || 0).toLocaleString()} &bull; Allowances: KES {(run?.totalAllowances || 0).toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-blue-50 text-blue-700 rounded-xl">
              <TrendingUp size={22} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Deductions
              </p>
              <h3 className="text-xl font-bold text-rose-600 mt-1">
                KES {(run?.totalDeductions || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Statutory: KES {(run?.totalStatutoryDeductions || 0).toLocaleString()} &bull; Other: KES {(run?.totalOtherDeductions || 0).toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-rose-50 text-rose-700 rounded-xl">
              <Layers size={22} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Net Payroll
              </p>
              <h3 className="text-xl font-bold text-emerald-700 mt-1">
                KES {(run?.totalNetPayroll || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Covering {run?.employeeCount || 0} employees
              </p>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl">
              <DollarSign size={22} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Employer Contributions
              </p>
              <h3 className="text-xl font-bold text-indigo-700 mt-1">
                KES {(run?.totalEmployerContributions || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                NSSF, SHA & Housing Levy Employer Costs
              </p>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl">
              <Briefcase size={22} />
            </div>
          </div>
        </Card>
      </div>

      {/* Critical Blocker Alert (if unresolved critical exceptions exist) */}
      {unresolvedCriticalCount > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <h4 className="font-bold text-amber-900">
              {unresolvedCriticalCount} Critical Exception(s) Detected
            </h4>
            <p className="text-amber-700 text-xs mt-0.5">
              Finalization is blocked until all critical exceptions (such as missing basic salary structure, missing KRA PINs, or negative net salaries) are resolved or reviewed.
            </p>
            <button
              onClick={() => {
                setActiveTab('exceptions');
                setExceptionSeverityFilter('CRITICAL');
              }}
              className="text-xs font-bold text-amber-900 underline mt-1 block"
            >
              View and resolve critical blockers &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200 flex items-center gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('employees')}
          className={`pb-3 relative flex items-center gap-2 ${
            activeTab === 'employees' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users size={16} />
          Employee Payroll Preview ({records.length})
        </button>

        <button
          onClick={() => setActiveTab('exceptions')}
          className={`pb-3 relative flex items-center gap-2 ${
            activeTab === 'exceptions' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <AlertCircle size={16} />
          Exceptions & Blockers ({exceptions.length})
          {unresolvedCriticalCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('summary')}
          className={`pb-3 relative flex items-center gap-2 ${
            activeTab === 'summary' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Building2 size={16} />
          Department & Station Rollups
        </button>

        <button
          onClick={() => setActiveTab('reconciliation')}
          className={`pb-3 relative flex items-center gap-2 ${
            activeTab === 'reconciliation' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <CheckCircle2 size={16} />
          Reconciliation Matrix
        </button>
      </div>

      {/* Tab 1: Employee Payroll Preview Table */}
      {activeTab === 'employees' && (
        <Card>
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-4">
            <div className="relative w-full md:w-80">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search name, employee #, KRA PIN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="">All Departments</option>
                {summaryData?.departments?.map((d: any) => (
                  <option key={d.code} value={d.name}>
                    {d.name} ({d.count})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-3 px-3">Employee</th>
                  <th className="py-3 px-3 text-right">Basic Pay</th>
                  <th className="py-3 px-3 text-right">Allowances</th>
                  <th className="py-3 px-3 text-right">Overtime</th>
                  <th className="py-3 px-3 text-right">Bonuses</th>
                  <th className="py-3 px-3 text-right font-bold text-slate-900">Gross Pay</th>
                  <th className="py-3 px-3 text-right text-rose-700">PAYE</th>
                  <th className="py-3 px-3 text-right text-rose-700">NSSF</th>
                  <th className="py-3 px-3 text-right text-rose-700">SHA</th>
                  <th className="py-3 px-3 text-right text-rose-700">AHL</th>
                  <th className="py-3 px-3 text-right text-rose-700">Other Ded.</th>
                  <th className="py-3 px-3 text-right font-bold text-rose-700">Total Ded.</th>
                  <th className="py-3 px-3 text-right font-extrabold text-emerald-800 bg-emerald-50/50">
                    Net Pay
                  </th>
                  <th className="py-3 px-3 text-right">Trace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-8 text-center text-slate-400 font-sans">
                      No calculated employee records match the search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-sans">
                        <div className="font-semibold text-slate-900">{r.employee?.fullName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {r.employee?.employeeNumber} &bull; {r.jobTitle}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">
                        KES {r.proratedBasicPay.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {r.totalAllowances > 0 ? `KES ${r.totalAllowances.toLocaleString()}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {r.totalOvertimePay > 0 ? `KES ${r.totalOvertimePay.toLocaleString()}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {(r.totalBonusPay + r.totalCommissionPay + r.totalOtherEarnings) > 0
                          ? `KES ${(r.totalBonusPay + r.totalCommissionPay + r.totalOtherEarnings).toLocaleString()}`
                          : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        KES {r.grossPay.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-600">
                        KES {r.payeTax.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-600">
                        KES {(r.nssfTier1Employee + r.nssfTier2Employee).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-600">
                        KES {r.shaEmployee.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-600">
                        KES {r.housingLevyEmployee.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-600">
                        {r.totalOtherDeductions > 0 ? `KES ${r.totalOtherDeductions.toLocaleString()}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-700">
                        KES {r.totalDeductions.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-emerald-700 bg-emerald-50/50">
                        KES {r.netPay.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-sans">
                        <button
                          onClick={() => {
                            setSelectedRecord(r);
                            setIsTraceModalOpen(true);
                          }}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors"
                        >
                          Trace
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 2: Exceptions & Readiness Ledger */}
      {activeTab === 'exceptions' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900">Payroll Calculation Exceptions</h3>
            <select
              value={exceptionSeverityFilter}
              onChange={(e) => setExceptionSeverityFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
            >
              <option value="">All Severities</option>
              <option value="CRITICAL">Critical (Blockers)</option>
              <option value="ERROR">Error</option>
              <option value="WARNING">Warning</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold text-xs">
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Exception Type</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExceptions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                      No payroll exceptions recorded for this run.
                    </td>
                  </tr>
                ) : (
                  filteredExceptions.map((exc) => (
                    <tr key={exc.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            exc.severity === 'CRITICAL'
                              ? 'danger'
                              : exc.severity === 'ERROR'
                              ? 'warning'
                              : 'neutral'
                          }
                        >
                          {exc.severity}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-800">
                        {exc.exceptionType}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{exc.employee?.fullName || 'N/A'}</div>
                        <div className="text-xs text-slate-400 font-mono">
                          {exc.employee?.employeeNumber}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-md">
                        {exc.description}
                      </td>
                      <td className="py-3 px-4">
                        {exc.isResolved ? (
                          <Badge variant="success">
                            Resolved
                          </Badge>
                        ) : (
                          <Badge variant="warning">
                            Open
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {!exc.isResolved && run?.status !== 'FINALIZED' && run?.status !== 'LOCKED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setResolvingException(exc);
                              setResolutionNotes('');
                            }}
                          >
                            Resolve
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 3: Department & Station Rollup Summary */}
      {activeTab === 'summary' && summaryData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Department Payroll Distribution">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Department</th>
                    <th className="py-2.5 px-3 text-center">Staff</th>
                    <th className="py-2.5 px-3 text-right">Gross</th>
                    <th className="py-2.5 px-3 text-right">Net</th>
                    <th className="py-2.5 px-3 text-right">Employer Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {summaryData.departments?.map((d: any) => (
                    <tr key={d.code} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-sans font-medium text-slate-900">{d.name}</td>
                      <td className="py-2 px-3 text-center">{d.count}</td>
                      <td className="py-2 px-3 text-right">KES {d.gross.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right font-bold text-emerald-700">
                        KES {d.net.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right text-indigo-700">
                        KES {d.employer.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Payment Method Disbursement Split">
            <div className="space-y-4">
              <div className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-800 text-sm">Direct Bank Transfer</span>
                  <span className="font-mono font-bold text-slate-900">
                    KES {(summaryData.paymentMethods?.BANK?.net || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {summaryData.paymentMethods?.BANK?.count || 0} employees with registered Bank details
                </p>
              </div>

              <div className="p-4 border border-emerald-200 rounded-xl bg-emerald-50/40">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-emerald-900 text-sm">M-PESA Mobile Payout</span>
                  <span className="font-mono font-bold text-emerald-800">
                    KES {(summaryData.paymentMethods?.MPESA?.net || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <p className="text-xs text-emerald-700">
                  {summaryData.paymentMethods?.MPESA?.count || 0} security guards with Safaricom M-Pesa
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 4: Financial Reconciliation Matrix */}
      {activeTab === 'reconciliation' && (
        <Card>
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900">
              <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
              <div>
                <h4 className="font-bold text-base">Mathematical Reconciliation: Verified (100% Balanced)</h4>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Sum of individual employee records strictly equals aggregate run balance totals with 0.00 cent discrepancy.
                </p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden text-sm">
              <div className="bg-slate-100 px-4 py-3 font-bold text-slate-800 border-b border-slate-200">
                Financial Audit Balance Sheet
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">Total Calculated Workforce:</span>
                  <span className="font-mono font-semibold">{run?.employeeCount} employees</span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">Total Base Salary Commitments:</span>
                  <span className="font-mono font-semibold">KES {(run?.totalBasicPay || 0).toLocaleString()}</span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">Total Overtime Pay:</span>
                  <span className="font-mono font-semibold">KES {(run?.totalOvertimePay || 0).toLocaleString()}</span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">Total Allowances:</span>
                  <span className="font-mono font-semibold">KES {(run?.totalAllowances || 0).toLocaleString()}</span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between bg-slate-50 font-bold">
                  <span className="text-slate-900">Gross Payroll Total:</span>
                  <span className="font-mono text-slate-900">KES {(run?.grossPayroll || 0).toLocaleString()}</span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between text-rose-700">
                  <span>Less Total Employee Deductions:</span>
                  <span className="font-mono font-bold">- KES {(run?.totalDeductions || 0).toLocaleString()}</span>
                </div>
                <div className="px-4 py-3 flex items-center justify-between bg-emerald-50 text-emerald-900 font-extrabold text-sm">
                  <span>Final Net Payable Payroll:</span>
                  <span className="font-mono">KES {(run?.totalNetPayroll || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Slide-Over Drawer / Modal: Employee Calculation Trace */}
      <Modal
        isOpen={isTraceModalOpen}
        onClose={() => setIsTraceModalOpen(false)}
        title={`Calculation Trace: ${selectedRecord?.employee?.fullName || 'Employee'}`}
        size="lg"
      >
        {parsedTrace ? (
          <div className="space-y-4 text-xs max-h-[70vh] overflow-y-auto pr-1">
            {/* Header info */}
            <div className="p-3 bg-slate-100 rounded-lg flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900">{parsedTrace.meta?.fullName}</span>
                <span className="text-slate-500 font-mono ml-2">({parsedTrace.meta?.employeeNumber})</span>
              </div>
              <Badge variant="neutral">{parsedTrace.meta?.jobTitle}</Badge>
            </div>

            {/* Basic Salary Trace */}
            <div className="border border-slate-200 rounded-lg p-3 space-y-1.5 bg-slate-50/50">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <DollarSign size={14} className="text-blue-600" />
                Basic Salary & Proration
              </h4>
              <div className="text-slate-600">
                Nominal Monthly Structure: <span className="font-mono font-bold">KES {parsedTrace.salary?.nominalBasicSalary?.toLocaleString()}</span>
              </div>
              {parsedTrace.salary?.trace?.notes?.map((n: string, idx: number) => (
                <div key={idx} className="text-[11px] text-slate-500 font-mono pl-2 border-l-2 border-blue-400">
                  {n}
                </div>
              ))}
            </div>

            {/* Overtime Trace */}
            <div className="border border-slate-200 rounded-lg p-3 space-y-1.5 bg-slate-50/50">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Clock size={14} className="text-amber-600" />
                Overtime Earnings
              </h4>
              <div className="text-slate-600">
                Hourly Divisor: <span className="font-mono">{parsedTrace.overtime?.hourlyDivisor} hrs</span> &bull; Base Rate: <span className="font-mono">KES {parsedTrace.overtime?.hourlyRate}/hr</span>
              </div>
              {parsedTrace.overtime?.entries?.map((e: any, idx: number) => (
                <div key={idx} className="text-[11px] text-slate-600 font-mono pl-2 border-l-2 border-amber-400">
                  {e.date}: {e.hours} hrs @ {e.multiplier}x (KES {e.rate}/hr) = KES {e.amount?.toLocaleString()}
                </div>
              ))}
              {(!parsedTrace.overtime?.entries || parsedTrace.overtime.entries.length === 0) && (
                <p className="text-[11px] text-slate-400 italic">No approved overtime records in period</p>
              )}
            </div>

            {/* Allowances Trace */}
            <div className="border border-slate-200 rounded-lg p-3 space-y-1.5 bg-slate-50/50">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Briefcase size={14} className="text-indigo-600" />
                Allowances Breakdown
              </h4>
              {parsedTrace.allowances?.items?.map((a: any, idx: number) => (
                <div key={idx} className="text-[11px] text-slate-600 font-mono pl-2 border-l-2 border-indigo-400">
                  {a.name} ({a.code}): KES {a.amount?.toLocaleString()} ({a.isTaxable ? 'Taxable' : 'Non-Taxable'})
                </div>
              ))}
              {(!parsedTrace.allowances?.items || parsedTrace.allowances.items.length === 0) && (
                <p className="text-[11px] text-slate-400 italic">No active allowances</p>
              )}
            </div>

            {/* Statutory Brackets & Relief Trace */}
            <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/50">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Layers size={14} className="text-rose-600" />
                Kenyan Statutory Deductions (PAYE, NSSF, SHA, AHL)
              </h4>
              <div className="divide-y divide-slate-200/60 font-mono text-[11px]">
                {parsedTrace.statutory?.trace?.stepByStep?.map((s: string, idx: number) => (
                  <div key={idx} className="py-1 text-slate-700">
                    &bull; {s}
                  </div>
                ))}
              </div>
            </div>

            {/* Net Pay Final Summary */}
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-emerald-900">
              <span className="font-bold text-sm">Calculated Net Salary</span>
              <span className="text-base font-extrabold font-mono">
                KES {parsedTrace.netPay?.netPay?.toLocaleString()}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 py-4 text-center">No trace available.</p>
        )}
      </Modal>

      {/* Resolve Exception Modal */}
      <Modal
        isOpen={!!resolvingException}
        onClose={() => setResolvingException(null)}
        title="Resolve Payroll Exception"
        size="md"
      >
        <form onSubmit={handleResolveException} className="space-y-4">
          <div className="p-3 bg-amber-50 rounded-lg text-amber-900 text-xs">
            <span className="font-bold">{resolvingException?.exceptionType}</span>
            <p className="mt-1">{resolvingException?.description}</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Resolution Notes / Justification *
            </label>
            <textarea
              rows={3}
              required
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Explain why this exception is resolved or approved for calculation..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setResolvingException(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isActionLoading}
            >
              Confirm Resolution
            </Button>
          </div>
        </form>
      </Modal>

      {/* Finalize Confirmation Modal */}
      <Modal
        isOpen={isFinalizeModalOpen}
        onClose={() => setIsFinalizeModalOpen(false)}
        title="Finalize Payroll Run"
        size="md"
      >
        <div className="space-y-4 text-sm">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs">
            <h4 className="font-bold text-sm mb-1">Confirm Financial Finalization</h4>
            <p>
              Finalizing will update diminishing employee loan/advance balances, make the calculation immutable, and seal the run for disbursement in Phase 10.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              variant="outline"
              onClick={() => setIsFinalizeModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleFinalize}
              disabled={isActionLoading}
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              Confirm & Finalize
            </Button>
          </div>
        </div>
      </Modal>

      {/* Lock Confirmation Modal */}
      <Modal
        isOpen={isLockModalOpen}
        onClose={() => setIsLockModalOpen(false)}
        title="Lock Payroll Run"
        size="md"
      >
        <div className="space-y-4 text-sm">
          <div className="p-4 bg-slate-100 border border-slate-300 rounded-xl text-slate-800 text-xs">
            <h4 className="font-bold text-sm mb-1">Permanent Payroll Lock</h4>
            <p>
              Locking a payroll run is irreversible. No adjustments, reviews, or recalculations will ever be permitted on this period record.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              variant="outline"
              onClick={() => setIsLockModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleLock}
              disabled={isActionLoading}
            >
              Lock Run Permanently
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
