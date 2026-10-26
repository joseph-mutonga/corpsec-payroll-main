'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { FormattedPayslipData, PayrollPeriodData, PayrollRunData } from '@/types';
import {
  FileText,
  Search,
  Filter,
  Download,
  Printer,
  Mail,
  Eye,
  CheckCircle2,
  Calendar,
  Users,
  DollarSign,
  Building2,
  MapPin,
  ShieldCheck,
  CreditCard,
  Phone,
  RefreshCw,
  Layers,
  Send,
  Clock,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export default function PayslipsPage() {
  const { toast } = useToast();
  const [periods, setPeriods] = useState<PayrollPeriodData[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [runs, setRuns] = useState<PayrollRunData[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [payslips, setPayslips] = useState<FormattedPayslipData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');

  // Selection state for bulk operations
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
  const [bulkProgress, setBulkProgress] = useState<number>(0);
  const [isBulkGenerating, setIsBulkGenerating] = useState<boolean>(false);

  // Single Payslip Modal
  const [activePayslip, setActivePayslip] = useState<FormattedPayslipData | null>(null);
  const [isPayslipModalOpen, setIsPayslipModalOpen] = useState<boolean>(false);
  const [isEmailing, setIsEmailing] = useState<boolean>(false);

  const printRef = useRef<HTMLDivElement>(null);

  // Fetch Periods on Mount
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
        if (openPeriod) {
          setSelectedPeriodId(openPeriod.id);
        }
      }
    } catch (err) {
      toast.error('Failed to load payroll periods');
    }
  };

  // Fetch Runs when period changes
  const fetchRunsAndPayslips = useCallback(async () => {
    if (!selectedPeriodId) return;
    try {
      setIsLoading(true);
      const runsRes = await fetch(`/api/payroll/runs?payrollPeriodId=${selectedPeriodId}`);
      const runsData = await runsRes.json();
      if (runsData.success && runsData.data && runsData.data.length > 0) {
        setRuns(runsData.data);
        const targetRun = runsData.data[0];
        setSelectedRunId(targetRun.id);

        // Fetch payslips for this run
        const params = new URLSearchParams();
        params.append('runId', targetRun.id);
        if (departmentFilter) params.append('departmentId', departmentFilter);
        if (search) params.append('search', search);

        const slipRes = await fetch(`/api/payroll/payslips?${params.toString()}`);
        const slipData = await slipRes.json();
        if (slipData.success) {
          setPayslips(slipData.data || []);
        }
      } else {
        setRuns([]);
        setSelectedRunId('');
        setPayslips([]);
      }
    } catch (err) {
      toast.error('Failed to load payslips');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPeriodId, departmentFilter, search, toast]);

  useEffect(() => {
    fetchRunsAndPayslips();
  }, [fetchRunsAndPayslips]);

  // Select all or toggle single
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedRecordIds(filteredPayslips.map((p) => p.recordId));
    } else {
      setSelectedRecordIds([]);
    }
  };

  const handleToggleRecord = (recordId: string) => {
    setSelectedRecordIds((prev) =>
      prev.includes(recordId) ? prev.filter((id) => id !== recordId) : [...prev, recordId]
    );
  };

  // Email single payslip
  const handleEmailPayslip = async (recordId: string) => {
    try {
      setIsEmailing(true);
      const res = await fetch(`/api/payroll/payslips/${recordId}/email`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Payslip Dispatched', data.data.message);
      } else {
        toast.error('Email Failed', data.error?.message || 'Unable to email payslip');
      }
    } catch (err) {
      toast.error('Email request failed');
    } finally {
      setIsEmailing(false);
    }
  };

  // Bulk Generate & Download
  const handleBulkGenerate = async () => {
    try {
      setIsBulkGenerating(true);
      setBulkProgress(20);

      const targetIds = selectedRecordIds.length > 0 ? selectedRecordIds : undefined;
      const res = await fetch('/api/payroll/payslips/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: selectedRunId,
          recordIds: targetIds,
        }),
      });

      setBulkProgress(60);
      const data = await res.json();

      if (data.success) {
        setBulkProgress(100);
        toast.success('Bulk Generation Complete', `Successfully generated ${data.data.generatedCount} payslips.`);
        setTimeout(() => {
          setIsBulkModalOpen(false);
          setBulkProgress(0);
          setIsBulkGenerating(false);
          // Trigger print dialog for bulk payslips
          window.print();
        }, 800);
      } else {
        toast.error('Bulk generation failed', data.error?.message);
        setIsBulkGenerating(false);
      }
    } catch (err) {
      toast.error('Bulk generation failed');
      setIsBulkGenerating(false);
    }
  };

  // Print single payslip
  const handlePrintSingle = (slip: FormattedPayslipData) => {
    setActivePayslip(slip);
    setIsPayslipModalOpen(true);
    setTimeout(() => {
      window.print();
    }, 400);
  };

  // Client-side filter
  const filteredPayslips = payslips.filter((p) => {
    const q = search.toLowerCase();
    const matchName = p.employee.fullName.toLowerCase().includes(q);
    const matchNum = p.employee.employeeNumber.toLowerCase().includes(q);
    const matchPin = p.employee.kraPin.toLowerCase().includes(q);
    const matchDept = !departmentFilter || p.employee.department === departmentFilter;
    return (matchName || matchNum || matchPin) && matchDept;
  });

  const departments = Array.from(new Set(payslips.map((p) => p.employee.department).filter(Boolean)));

  return (
    <div className="animate-fade-in space-y-6">
      <Breadcrumb
        items={[
          { label: 'Payroll Management', href: '/payroll' },
          { label: 'Payslips Generation & Vault' },
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
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
              <FileText size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                Payslips Generation &amp; Distribution Vault
              </h1>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                Generate, preview, print, and export official CorpSec employee payslips with full Kenyan statutory itemization.
              </p>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Printer size={14} />}
            onClick={() => window.print()}
          >
            Print View
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Sparkles size={14} />}
            onClick={() => setIsBulkModalOpen(true)}
            disabled={filteredPayslips.length === 0}
          >
            Bulk Generate ({selectedRecordIds.length > 0 ? selectedRecordIds.length : filteredPayslips.length})
          </Button>
        </div>
      </div>

      {/* Controls & Filter Card */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Period Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Payroll Period
            </label>
            <div className="relative">
              <select
                className="w-full h-9 pl-3 pr-8 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
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
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Department
            </label>
            <select
              className="w-full h-9 pl-3 pr-8 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Search Employee
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, employee number, or KRA PIN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Payslips Table */}
      <Card noPadding>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-900 text-sm">
              Employee Payslips Directory
            </h3>
            <Badge variant="neutral">
              {filteredPayslips.length} Records
            </Badge>
          </div>

          {selectedRecordIds.length > 0 && (
            <div className="text-xs text-blue-700 font-semibold bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
              {selectedRecordIds.length} employee(s) selected
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="py-12">
            <Spinner fullHeight message="Loading payslips archive..." />
          </div>
        ) : filteredPayslips.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <FileText size={36} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold">No payslips found for the selected period.</p>
            <p className="text-xs text-slate-500 mt-1">
              Ensure a payroll run has been calculated for this period under <a href="/payroll/runs" className="text-blue-600 underline">Payroll Runs</a>.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold tracking-wider">
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={selectedRecordIds.length === filteredPayslips.length && filteredPayslips.length > 0}
                      onChange={handleSelectAll}
                      className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department &amp; Station</th>
                  <th className="py-3 px-4 text-right">Basic Pay</th>
                  <th className="py-3 px-4 text-right">Gross Pay</th>
                  <th className="py-3 px-4 text-right">Deductions</th>
                  <th className="py-3 px-4 text-right">Net Payable</th>
                  <th className="py-3 px-4 text-center">Payment Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayslips.map((slip) => (
                  <tr key={slip.recordId} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={selectedRecordIds.includes(slip.recordId)}
                        onChange={() => handleToggleRecord(slip.recordId)}
                        className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{slip.employee.fullName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {slip.employee.employeeNumber} &bull; PIN: {slip.employee.kraPin}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{slip.employee.department}</div>
                      <div className="text-[11px] text-slate-400">{slip.employee.station}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      KES {slip.earnings.basicPay.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                      KES {slip.earnings.grossPay.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-rose-600">
                      - KES {slip.deductions.totalDeductions.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 text-sm">
                      KES {slip.summary.netPay.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge
                        variant={
                          slip.paymentStatus === 'PAID'
                            ? 'success'
                            : slip.paymentStatus === 'PROCESSING'
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        {slip.paymentStatus}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActivePayslip(slip);
                            setIsPayslipModalOpen(true);
                          }}
                        >
                          <Eye size={13} className="mr-1" /> View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePrintSingle(slip)}
                        >
                          <Printer size={13} />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEmailPayslip(slip.recordId)}
                          disabled={isEmailing}
                        >
                          <Mail size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Individual Payslip Modal with Official Kenyan Corporate Layout */}
      <Modal
        isOpen={isPayslipModalOpen}
        onClose={() => setIsPayslipModalOpen(false)}
        title={`Payslip: ${activePayslip?.employee.fullName || 'Employee'}`}
        size="lg"
      >
        {activePayslip && (
          <div className="space-y-4 text-xs">
            {/* Modal Actions */}
            <div className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg no-print">
              <div className="text-slate-600 font-medium">
                Period: <span className="font-bold text-slate-900">{activePayslip.periodName}</span> &bull; Pay Date: <span className="font-bold text-slate-900">{activePayslip.payDate}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" leftIcon={<Printer size={13} />} onClick={() => window.print()}>
                  Print / Save PDF
                </Button>
                <Button variant="outline" size="sm" leftIcon={<Mail size={13} />} onClick={() => handleEmailPayslip(activePayslip.recordId)}>
                  Email Payslip
                </Button>
              </div>
            </div>

            {/* Printable Payslip Body */}
            <div
              ref={printRef}
              className="bg-white p-6 border border-slate-300 rounded-xl shadow-sm space-y-5 text-slate-800"
              style={{ minHeight: '600px' }}
            >
              {/* CorpSec Official Header */}
              <div className="border-b-2 border-slate-900 pb-4 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={28} className="text-blue-900" />
                    <div>
                      <h2 className="text-xl font-extrabold text-slate-950 tracking-tight m-0">
                        {activePayslip.company.name.toUpperCase()}
                      </h2>
                      <p className="text-[11px] text-slate-500 font-semibold m-0">
                        {activePayslip.company.tagline}
                      </p>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-2 space-y-0.5">
                    <p className="m-0">{activePayslip.company.address}</p>
                    <p className="m-0">Email: {activePayslip.company.email} | Tel: {activePayslip.company.phone}</p>
                    <p className="m-0 font-mono font-semibold">Employer KRA PIN: {activePayslip.company.kraPin}</p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="inline-block bg-slate-900 text-white font-extrabold text-sm px-3.5 py-1.5 rounded uppercase tracking-wider">
                    PAYSLIP
                  </div>
                  <div className="text-xs font-bold text-slate-800 mt-2">
                    {activePayslip.periodName}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Pay Date: {activePayslip.payDate}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Ref: {activePayslip.runNumber}
                  </div>
                </div>
              </div>

              {/* Employee Bio Matrix */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-[11px]">
                <div>
                  <span className="text-slate-500 block">Employee Name:</span>
                  <span className="font-bold text-slate-900">{activePayslip.employee.fullName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Employee No:</span>
                  <span className="font-mono font-bold text-slate-900">{activePayslip.employee.employeeNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">National ID No:</span>
                  <span className="font-mono font-bold text-slate-900">{activePayslip.employee.nationalId}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Job Designation:</span>
                  <span className="font-bold text-slate-900">{activePayslip.employee.jobTitle}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Department:</span>
                  <span className="font-semibold text-slate-800">{activePayslip.employee.department}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Guarding Station:</span>
                  <span className="font-semibold text-slate-800">{activePayslip.employee.station}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">KRA PIN:</span>
                  <span className="font-mono font-bold text-slate-900">{activePayslip.employee.kraPin}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">NSSF / SHA No:</span>
                  <span className="font-mono font-semibold text-slate-800">{activePayslip.employee.nssfNumber} / {activePayslip.employee.shaNumber}</span>
                </div>
              </div>

              {/* Earnings & Deductions Two-Column Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Earnings Column */}
                <div className="border border-slate-200 rounded-lg overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="bg-slate-100 px-3.5 py-2 font-bold text-slate-800 text-xs border-b border-slate-200 flex justify-between">
                      <span>EARNINGS &amp; ALLOWANCES</span>
                      <span>AMOUNT (KES)</span>
                    </div>
                    <div className="p-3 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-700">Basic Salary</span>
                        <span className="font-mono font-semibold">{activePayslip.earnings.basicPay.toFixed(2)}</span>
                      </div>
                      {activePayslip.earnings.allowances.map((a, i) => (
                        <div key={i} className="flex justify-between text-slate-600">
                          <span>{a.name}</span>
                          <span className="font-mono">{a.amount.toFixed(2)}</span>
                        </div>
                      ))}
                      {activePayslip.earnings.overtime.amount > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Overtime Pay ({activePayslip.earnings.overtime.hours} hrs)</span>
                          <span className="font-mono">{activePayslip.earnings.overtime.amount.toFixed(2)}</span>
                        </div>
                      )}
                      {activePayslip.earnings.bonuses > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Performance Bonuses</span>
                          <span className="font-mono">{activePayslip.earnings.bonuses.toFixed(2)}</span>
                        </div>
                      )}
                      {activePayslip.earnings.commissions > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Commissions &amp; Arrears</span>
                          <span className="font-mono">{activePayslip.earnings.commissions.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-50 px-3.5 py-2.5 border-t border-slate-200 font-bold flex justify-between text-slate-900">
                    <span>TOTAL GROSS PAY</span>
                    <span className="font-mono">KES {activePayslip.earnings.grossPay.toFixed(2)}</span>
                  </div>
                </div>

                {/* Deductions Column */}
                <div className="border border-slate-200 rounded-lg overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="bg-slate-100 px-3.5 py-2 font-bold text-slate-800 text-xs border-b border-slate-200 flex justify-between">
                      <span>DEDUCTIONS &amp; TAXES</span>
                      <span>AMOUNT (KES)</span>
                    </div>
                    <div className="p-3 space-y-2 text-xs">
                      <div className="flex justify-between text-slate-700">
                        <span>PAYE Income Tax (Net)</span>
                        <span className="font-mono font-semibold">{activePayslip.deductions.payeTax.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>NSSF Employee (Tier I &amp; II)</span>
                        <span className="font-mono">{activePayslip.deductions.totalNssf.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Social Health Authority (SHA)</span>
                        <span className="font-mono">{activePayslip.deductions.sha.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Affordable Housing Levy (1.5%)</span>
                        <span className="font-mono">{activePayslip.deductions.housingLevy.toFixed(2)}</span>
                      </div>
                      {activePayslip.deductions.otherDeductions.map((d, i) => (
                        <div key={i} className="flex justify-between text-slate-600">
                          <span>
                            {d.name} {d.currentBalance !== undefined ? `(Bal: KES ${d.currentBalance.toLocaleString()})` : ''}
                          </span>
                          <span className="font-mono">{d.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-rose-50 px-3.5 py-2.5 border-t border-rose-200 font-bold flex justify-between text-rose-800">
                    <span>TOTAL DEDUCTIONS</span>
                    <span className="font-mono">- KES {activePayslip.deductions.totalDeductions.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* NET PAY BANNER */}
              <div className="bg-emerald-800 text-white p-4 rounded-xl flex items-center justify-between shadow-sm">
                <div>
                  <span className="text-[11px] font-semibold tracking-wider uppercase text-emerald-200 block">
                    NET PAYABLE SALARY
                  </span>
                  <span className="text-xs text-emerald-100">
                    Disbursement Method: <strong className="text-white">{activePayslip.employee.paymentMethod}</strong>
                    {activePayslip.employee.bankName && ` (${activePayslip.employee.bankName} - ${activePayslip.employee.bankAccount})`}
                    {activePayslip.employee.mpesaPhone && ` (${activePayslip.employee.mpesaPhone})`}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold font-mono tracking-tight">
                    KES {activePayslip.summary.netPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-emerald-200 font-medium">
                    Payment Status: <span className="uppercase font-bold text-white">{activePayslip.paymentStatus}</span>
                  </div>
                </div>
              </div>

              {/* Employer Statutory Contributions Reference */}
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/70 text-[11px] text-slate-600 flex items-center justify-between flex-wrap gap-2">
                <span>
                  <strong>Employer Matching Contributions (Not deducted from pay):</strong> NSSF: KES {activePayslip.employerContributions.totalNssf.toFixed(2)} | Housing Levy: KES {activePayslip.employerContributions.housingLevy.toFixed(2)}
                </span>
                <span className="font-mono font-bold text-slate-800">
                  Total Employer Match: KES {activePayslip.employerContributions.totalContributions.toFixed(2)}
                </span>
              </div>

              {/* Footer Stamp & Security Note */}
              <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-[10px] text-slate-400">
                <span>Computer-generated official payslip issued by CorpSec Investigations &amp; Guarding Services. No signature required.</span>
                <span>Confidential Document &bull; Generated {new Date().toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk Payslips Generation Progress Modal */}
      <Modal
        isOpen={isBulkModalOpen}
        onClose={() => !isBulkGenerating && setIsBulkModalOpen(false)}
        title="Bulk Payslip Generation &amp; Export"
        size="md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600">
            Generate and package printable payslips for <strong>{selectedRecordIds.length > 0 ? selectedRecordIds.length : filteredPayslips.length}</strong> employees in the selected period.
          </p>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900">
            <h4 className="font-bold mb-1">Batch Export Scope</h4>
            <p className="text-[11px] text-blue-700 m-0">
              This action prepares a consolidated batch document ready for thermal / A4 printing, PDF archival, and bulk employee self-service release.
            </p>
          </div>

          {isBulkGenerating && (
            <div className="space-y-2">
              <div className="flex justify-between text-slate-600 font-semibold">
                <span>Generating payslips...</span>
                <span>{bulkProgress}%</span>
              </div>
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${bulkProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBulkModalOpen(false)}
              disabled={isBulkGenerating}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Sparkles size={14} />}
              onClick={handleBulkGenerate}
              disabled={isBulkGenerating}
            >
              {isBulkGenerating ? 'Processing Batch...' : 'Start Batch Export'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
