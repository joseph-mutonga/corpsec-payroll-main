'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { PayrollPeriodData, PayrollRunData } from '@/types';
import {
  FileSpreadsheet,
  Search,
  Filter,
  Download,
  Printer,
  CheckCircle2,
  AlertCircle,
  Clock,
  DollarSign,
  Users,
  Building2,
  MapPin,
  RefreshCw,
  Edit3,
  Layers,
} from 'lucide-react';

export default function PayrollRegisterPage() {
  const { toast } = useToast();
  const [periods, setPeriods] = useState<PayrollPeriodData[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [runs, setRuns] = useState<PayrollRunData[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [registerData, setRegisterData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [stationFilter, setStationFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  // Payment Status Edit Modal State
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [newStatus, setNewStatus] = useState<string>('PAID');
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Bulk Payment Status Modal
  const [isBulkStatusModalOpen, setIsBulkStatusModalOpen] = useState<boolean>(false);
  const [bulkStatus, setBulkStatus] = useState<string>('PAID');
  const [bulkBatchRef, setBulkBatchRef] = useState<string>('');

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

  const fetchRegister = useCallback(async () => {
    if (!selectedPeriodId) return;
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      params.append('periodId', selectedPeriodId);
      if (selectedRunId) params.append('runId', selectedRunId);
      if (departmentFilter) params.append('departmentId', departmentFilter);
      if (stationFilter) params.append('stationId', stationFilter);
      if (statusFilter) params.append('paymentStatus', statusFilter);
      if (search) params.append('search', search);

      const res = await fetch(`/api/payroll/reports/register?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setRegisterData(data.data);
      } else {
        setRegisterData(null);
      }
    } catch (err) {
      toast.error('Failed to fetch payroll register');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPeriodId, selectedRunId, departmentFilter, stationFilter, statusFilter, search, toast]);

  useEffect(() => {
    fetchRegister();
  }, [fetchRegister]);

  // Export CSV
  const handleExportCsv = () => {
    if (!selectedPeriodId) return;
    const params = new URLSearchParams();
    params.append('periodId', selectedPeriodId);
    if (selectedRunId) params.append('runId', selectedRunId);
    if (departmentFilter) params.append('departmentId', departmentFilter);
    if (stationFilter) params.append('stationId', stationFilter);
    if (statusFilter) params.append('paymentStatus', statusFilter);
    if (search) params.append('search', search);
    params.append('format', 'csv');

    window.open(`/api/payroll/reports/register?${params.toString()}`, '_blank');
  };

  // Update single record payment status
  const handleUpdatePaymentStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;

    try {
      setIsUpdatingStatus(true);
      const res = await fetch(`/api/payroll/records/${editingRecord.id}/payment-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentStatus: newStatus,
          paymentReference: paymentRef,
          paymentNotes,
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success('Payment Status Updated', `${editingRecord.fullName} marked as ${newStatus}`);
        setIsEditModalOpen(false);
        fetchRegister();
      } else {
        toast.error('Update failed', data.error?.message);
      }
    } catch (err) {
      toast.error('Failed to update status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Bulk update all records in run
  const handleBulkUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    const runId = registerData?.run?.id;
    if (!runId) return;

    try {
      setIsUpdatingStatus(true);
      const res = await fetch(`/api/payroll/runs/${runId}/payment-status/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentStatus: bulkStatus,
          paymentReference: bulkBatchRef || `BATCH-${Date.now().toString().slice(-6)}`,
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success('Bulk Payment Status Updated', `Updated ${data.data.updatedCount} records to ${bulkStatus}`);
        setIsBulkStatusModalOpen(false);
        fetchRegister();
      } else {
        toast.error('Bulk update failed', data.error?.message);
      }
    } catch (err) {
      toast.error('Failed to bulk update status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const rows = registerData?.rows || [];
  const totals = registerData?.totals || {};
  const runInfo = registerData?.run;

  const departments = Array.from(new Set(rows.map((r: any) => r.department).filter(Boolean)));
  const stations = Array.from(new Set(rows.map((r: any) => r.station).filter(Boolean)));

  return (
    <div className="animate-fade-in space-y-6">
      <Breadcrumb
        items={[
          { label: 'Payroll Management', href: '/payroll' },
          { label: 'Payroll Register' },
        ]}
      />

      {/* Header Card */}
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
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                Master Payroll Register
              </h1>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                Complete individual salary breakdown, deductions, net pay commitments, and live disbursement tracking.
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
            Print Register
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download size={14} />}
            onClick={handleExportCsv}
          >
            Export Excel / CSV
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Edit3 size={14} />}
            onClick={() => setIsBulkStatusModalOpen(true)}
            disabled={rows.length === 0}
          >
            Batch Payment Status
          </Button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <Card noPadding>
          <div className="p-3.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Workforce</span>
            <div className="text-lg font-extrabold text-slate-900 mt-1">{totals.employeeCount || 0}</div>
          </div>
        </Card>
        <Card noPadding>
          <div className="p-3.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Gross Payroll</span>
            <div className="text-lg font-extrabold text-slate-900 mt-1 font-mono">
              KES {(totals.grossSalary || 0).toLocaleString()}
            </div>
          </div>
        </Card>
        <Card noPadding>
          <div className="p-3.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Total Deductions</span>
            <div className="text-lg font-extrabold text-rose-600 mt-1 font-mono">
              - KES {(totals.totalDeductions || 0).toLocaleString()}
            </div>
          </div>
        </Card>
        <Card noPadding>
          <div className="p-3.5">
            <span className="text-[11px] font-bold text-emerald-700 uppercase">Net Payable</span>
            <div className="text-lg font-extrabold text-emerald-800 mt-1 font-mono">
              KES {(totals.netSalary || 0).toLocaleString()}
            </div>
          </div>
        </Card>
        <Card noPadding>
          <div className="p-3.5">
            <span className="text-[11px] font-bold text-emerald-600 uppercase">Paid Count</span>
            <div className="text-lg font-extrabold text-emerald-700 mt-1">{totals.paidCount || 0}</div>
          </div>
        </Card>
        <Card noPadding>
          <div className="p-3.5">
            <span className="text-[11px] font-bold text-amber-600 uppercase">Pending Count</span>
            <div className="text-lg font-extrabold text-amber-700 mt-1">{totals.pendingCount || 0}</div>
          </div>
        </Card>
      </div>

      {/* Filter Controls */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
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
            <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Status</label>
            <select
              className="w-full h-9 pl-3 pr-8 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-800"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="PROCESSING">Processing</option>
              <option value="PAID">Paid</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Search Staff</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Name, Emp No, ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Register Data Table */}
      <Card noPadding>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-900 text-sm">
              Payroll Register Ledger &bull; {runInfo?.runNumber || 'Run'}
            </h3>
            <Badge variant="neutral">{rows.length} Staff</Badge>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12">
            <Spinner fullHeight message="Generating payroll register..." />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            No payroll records found matching specified filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold tracking-wider">
                  <th className="py-3 px-4">Emp No</th>
                  <th className="py-3 px-4">Employee Name</th>
                  <th className="py-3 px-4">National ID</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Station</th>
                  <th className="py-3 px-4 text-right">Basic Pay</th>
                  <th className="py-3 px-4 text-right">Gross Pay</th>
                  <th className="py-3 px-4 text-right">Total Ded</th>
                  <th className="py-3 px-4 text-right font-bold text-emerald-800">Net Pay</th>
                  <th className="py-3 px-4 text-center">Disbursement</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {rows.map((row: any) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">{row.employeeNumber}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{row.fullName}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">{row.nationalId}</td>
                    <td className="py-3 px-4 text-slate-700">{row.department}</td>
                    <td className="py-3 px-4 text-slate-700">{row.station}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      KES {row.basicSalary.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                      KES {row.grossSalary.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-rose-600">
                      - KES {row.totalDeductions.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                      KES {row.netSalary.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {row.paymentMethod}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge
                        variant={
                          row.paymentStatus === 'PAID'
                            ? 'success'
                            : row.paymentStatus === 'PROCESSING'
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        {row.paymentStatus}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingRecord(row);
                          setNewStatus(row.paymentStatus || 'PAID');
                          setPaymentRef(row.paymentReference || '');
                          setIsEditModalOpen(true);
                        }}
                      >
                        <Edit3 size={12} className="mr-1" /> Status
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Edit Payment Status Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Update Payment Status: ${editingRecord?.fullName}`}
        size="md"
      >
        {editingRecord && (
          <form onSubmit={handleUpdatePaymentStatus} className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex justify-between font-medium text-slate-700">
                <span>Employee:</span>
                <span className="font-bold text-slate-900">{editingRecord.fullName} ({editingRecord.employeeNumber})</span>
              </div>
              <div className="flex justify-between font-medium text-slate-700 mt-1">
                <span>Net Payable Amount:</span>
                <span className="font-mono font-bold text-emerald-700">KES {editingRecord.netSalary?.toLocaleString()}</span>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">New Payment Status</label>
              <select
                className="w-full h-9 pl-3 pr-8 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-800"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              >
                <option value="PENDING">PENDING</option>
                <option value="PROCESSING">PROCESSING</option>
                <option value="PAID">PAID</option>
                <option value="FAILED">FAILED</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Payment Reference / Bank Trx ID</label>
              <input
                type="text"
                placeholder="e.g. EFT-98231 or MPESA-SJD982"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" type="button" onClick={() => setIsEditModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" disabled={isUpdatingStatus}>
                {isUpdatingStatus ? 'Updating...' : 'Save Payment Status'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Bulk Batch Payment Status Modal */}
      <Modal
        isOpen={isBulkStatusModalOpen}
        onClose={() => setIsBulkStatusModalOpen(false)}
        title="Batch Payment Status Update"
        size="md"
      >
        <form onSubmit={handleBulkUpdateStatus} className="space-y-4 text-xs">
          <p className="text-slate-600">
            Bulk update payment status for all <strong>{rows.length}</strong> employees in <strong>{runInfo?.runNumber}</strong>.
          </p>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Target Payment Status</label>
            <select
              className="w-full h-9 pl-3 pr-8 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-800"
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
            >
              <option value="PAID">PAID (Disbursed)</option>
              <option value="PROCESSING">PROCESSING (Submitted to Bank/M-Pesa)</option>
              <option value="PENDING">PENDING (Awaiting Disbursement)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Bank Batch Reference</label>
            <input
              type="text"
              placeholder="e.g. KCB-BATCH-20260828"
              value={bulkBatchRef}
              onChange={(e) => setBulkBatchRef(e.target.value)}
              className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsBulkStatusModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={isUpdatingStatus}>
              {isUpdatingStatus ? 'Applying...' : 'Apply to All Staff'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
