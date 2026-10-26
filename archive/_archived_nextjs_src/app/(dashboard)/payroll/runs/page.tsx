'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastContext';
import { PayrollRunData, PayrollPeriodData } from '@/types';
import {
  Calculator,
  Plus,
  Search,
  Filter,
  Calendar,
  DollarSign,
  Users,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ArrowRight,
  RefreshCw,
  Clock,
  FileSpreadsheet,
} from 'lucide-react';

export default function PayrollRunsPage() {
  const { toast } = useToast();
  const [runs, setRuns] = useState<PayrollRunData[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriodData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form State
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [runType, setRunType] = useState<'REGULAR' | 'SUPPLEMENTARY' | 'ADJUSTMENT'>('REGULAR');
  const [notes, setNotes] = useState('');

  const fetchRuns = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (typeFilter) params.append('runType', typeFilter);

      const res = await fetch(`/api/payroll/runs?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setRuns(data.data || []);
      }
    } catch (err) {
      toast.error('Failed to load payroll runs');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, typeFilter, toast]);

  const fetchPeriods = useCallback(async () => {
    try {
      const res = await fetch('/api/payroll/periods?year=2026');
      const data = await res.json();
      if (data.success) {
        setPeriods(data.data || []);
        const openPeriod = data.data?.find((p: any) => p.status === 'OPEN');
        if (openPeriod) {
          setSelectedPeriodId(openPeriod.id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
    fetchPeriods();
  }, [fetchRuns, fetchPeriods]);

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPeriodId) {
      toast.error('Please select a payroll period');
      return;
    }

    try {
      setIsCreating(true);
      const res = await fetch('/api/payroll/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payrollPeriodId: selectedPeriodId,
          runType,
          notes,
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success('Payroll run created', `Run ${data.data.runNumber} initialized.`);
        setIsCreateModalOpen(false);
        setNotes('');
        fetchRuns();
      } else {
        toast.error('Creation failed', data.error?.message || 'Unable to create payroll run');
      }
    } catch (err) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsCreating(false);
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

  const filteredRuns = runs.filter((r) => {
    const q = search.toLowerCase();
    const matchNumber = r.runNumber.toLowerCase().includes(q);
    const matchPeriod = r.payrollPeriod?.name.toLowerCase().includes(q) || false;
    return matchNumber || matchPeriod;
  });

  return (
    <div className="animate-fade-in space-y-6">
      <Breadcrumb
        items={[
          { label: 'Payroll Management', href: '/payroll' },
          { label: 'Payroll Runs & Processing' },
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
        className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(15, 23, 42, 0.08)',
                color: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Calculator size={22} />
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              Payroll Calculation Runs
            </h1>
            <Badge variant="warning">Phase 7 Live</Badge>
          </div>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
            Execute multi-tier payroll calculations, inspect exceptions, audit reconciliation, and process company compensation runs.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <Button
            variant="outline"
            onClick={fetchRuns}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </Button>

          <Button
            variant="primary"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2"
          >
            <Plus size={16} />
            New Payroll Run
          </Button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search by run number or period..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="CALCULATED">Calculated</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="FINALIZED">Finalized</option>
              <option value="LOCKED">Locked</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">All Run Types</option>
              <option value="REGULAR">Regular Monthly</option>
              <option value="SUPPLEMENTARY">Supplementary</option>
              <option value="ADJUSTMENT">Adjustment</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Payroll Runs Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="py-3 px-4">Run Number</th>
                <th className="py-3 px-4">Payroll Period</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-center">Employees</th>
                <th className="py-3 px-4 text-right">Gross Payroll</th>
                <th className="py-3 px-4 text-right">Deductions</th>
                <th className="py-3 px-4 text-right">Net Payroll</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-slate-600" />
                    Loading payroll runs...
                  </td>
                </tr>
              ) : filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Calculator size={36} className="mx-auto mb-2 text-slate-300" />
                    <p className="font-medium text-slate-600">No payroll runs found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Click &quot;New Payroll Run&quot; above to initialize a calculation cycle.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRuns.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                      {r.runNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900">{r.payrollPeriod?.name}</div>
                      <div className="text-xs text-slate-400 font-mono">
                        {r.payrollPeriod?.periodNumber}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant={r.runType === 'REGULAR' ? 'neutral' : 'warning'}>
                        {r.runType}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-center font-medium">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                        <Users size={12} />
                        {r.employeeCount}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium text-slate-700">
                      KES {r.grossPayroll.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right text-rose-600 font-medium">
                      KES {r.totalDeductions.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                      KES {r.totalNetPayroll.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {getStatusBadge(r.status)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        href={`/payroll/runs/${r.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                      >
                        Open Run
                        <ArrowRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* New Payroll Run Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Initialize New Payroll Run"
        size="md"
      >
        <form onSubmit={handleCreateRun} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Select Payroll Period *
            </label>
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">-- Choose Period --</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.periodNumber}) [{p.status}]
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Run Type *
            </label>
            <select
              value={runType}
              onChange={(e) => setRunType(e.target.value as any)}
              required
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="REGULAR">Regular Monthly Cycle</option>
              <option value="SUPPLEMENTARY">Supplementary Run</option>
              <option value="ADJUSTMENT">Adjustment Run</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Run Notes / Memo
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. August 2026 Monthly Regular Payroll Calculation Run..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isCreating}
              className="flex items-center gap-2"
            >
              {isCreating && <RefreshCw size={14} className="animate-spin" />}
              Create Payroll Run
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
