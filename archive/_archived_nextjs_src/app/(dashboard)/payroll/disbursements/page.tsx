'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastContext';
import {
  Banknote,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Eye,
  Plus,
  ShieldCheck,
  Building2,
  XCircle,
  FileCheck,
  CreditCard,
  Phone,
  ArrowRight,
  TrendingUp,
  FileText,
  Search,
} from 'lucide-react';
import {
  PaymentBatchData,
  PaymentBatchStatus,
  DisbursementDashboardStats,
} from '@/types';

export default function PayrollDisbursementsPage() {
  const { toast } = useToast();

  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [runs, setRuns] = useState<any[]>([]);
  const [stats, setStats] = useState<DisbursementDashboardStats | null>(null);
  const [batches, setBatches] = useState<PaymentBatchData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedBatchDetails, setSelectedBatchDetails] = useState<any>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Form State
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [batchName, setBatchName] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('MIXED');
  const [batchNotes, setBatchNotes] = useState<string>('');

  // Search & Filter in Review Modal
  const [reviewSearch, setReviewSearch] = useState<string>('');
  const [reviewMethodFilter, setReviewMethodFilter] = useState<string>('ALL');

  useEffect(() => {
    fetchPeriods();
  }, []);

  useEffect(() => {
    if (selectedPeriodId) {
      fetchDashboardData(selectedPeriodId);
      fetchRunsForPeriod(selectedPeriodId);
    }
  }, [selectedPeriodId]);

  const fetchPeriods = async () => {
    try {
      const res = await fetch('/api/payroll/periods?year=2026');
      const data = await res.json();
      if (data.success && data.data?.length > 0) {
        setPeriods(data.data);
        const openOrAug = data.data.find((p: any) => p.payrollMonth === 8) || data.data[0];
        setSelectedPeriodId(openOrAug.id);
      }
    } catch (err) {
      toast.error('Error', 'Failed to load payroll periods');
    }
  };

  const fetchRunsForPeriod = async (periodId: string) => {
    try {
      const res = await fetch(`/api/payroll/runs?payrollPeriodId=${periodId}`);
      const data = await res.json();
      if (data.success && data.data?.length > 0) {
        setRuns(data.data);
        const finalized = data.data.find((r: any) => ['FINALIZED', 'APPROVED'].includes(r.status));
        if (finalized) setSelectedRunId(finalized.id);
        else setSelectedRunId(data.data[0].id);
      } else {
        setRuns([]);
        setSelectedRunId('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDashboardData = async (periodId: string) => {
    setIsLoading(true);
    try {
      const [statsRes, batchesRes] = await Promise.all([
        fetch(`/api/payroll/payments/stats?payrollPeriodId=${periodId}`),
        fetch(`/api/payroll/payments/batches?payrollPeriodId=${periodId}`),
      ]);

      const statsData = await statsRes.json();
      const batchesData = await batchesRes.json();

      if (statsData.success) setStats(statsData.data);
      if (batchesData.success) setBatches(batchesData.data);
    } catch (err) {
      toast.error('Error', 'Error loading disbursement dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    const period = periods.find((p) => p.id === selectedPeriodId);
    setBatchName(period ? `${period.name} — General Net Salary Payout` : 'General Net Salary Batch');
    setPaymentMethod('MIXED');
    setBatchNotes('Scheduled salary disbursement via corporate banking & M-Pesa channels');
    setIsCreateModalOpen(true);
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRunId) {
      toast.error('Validation Error', 'Please select an eligible payroll calculation run');
      return;
    }

    setIsProcessingAction(true);
    try {
      const res = await fetch('/api/payroll/payments/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payrollRunId: selectedRunId,
          name: batchName,
          paymentMethod,
          notes: batchNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to create payment batch');
      }

      toast.success('Success', data.message || 'Payment batch created successfully');
      setIsCreateModalOpen(false);
      fetchDashboardData(selectedPeriodId);
      handleOpenBatchDetails(data.data.id);
    } catch (err: any) {
      toast.error('Error', err.message);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleOpenBatchDetails = async (batchId: string) => {
    setIsLoadingDetails(true);
    setIsReviewModalOpen(true);
    try {
      const res = await fetch(`/api/payroll/payments/batches/${batchId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedBatchDetails(data.data);
      } else {
        toast.error('Error', data.message || 'Failed to load batch details');
      }
    } catch (err) {
      toast.error('Error', 'Error loading batch review');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleBatchWorkflowAction = async (action: 'submit' | 'approve' | 'process' | 'cancel') => {
    if (!selectedBatchDetails) return;
    const batchId = selectedBatchDetails.batch.id;

    setIsProcessingAction(true);
    try {
      const res = await fetch(`/api/payroll/payments/batches/${batchId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Admin requested status transition' }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || `Failed to execute ${action}`);
      }

      toast.success('Success', data.message || `Batch ${action} completed successfully`);
      fetchDashboardData(selectedPeriodId);
      // Refresh current open details
      handleOpenBatchDetails(batchId);
    } catch (err: any) {
      toast.error('Error', err.message);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleRetryTransaction = async (transactionId: string) => {
    setIsProcessingAction(true);
    try {
      const res = await fetch(`/api/payroll/payments/transactions/${transactionId}/retry`, {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to retry transaction');
      }

      toast.success('Success', `Transaction retried: ${data.data.status}`);
      if (selectedBatchDetails) {
        handleOpenBatchDetails(selectedBatchDetails.batch.id);
      }
      fetchDashboardData(selectedPeriodId);
    } catch (err: any) {
      toast.error('Error', err.message);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const getStatusBadge = (status: PaymentBatchStatus) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge variant="success">Completed</Badge>;
      case 'APPROVED':
        return <Badge variant="info">Approved</Badge>;
      case 'READY':
        return <Badge variant="warning">Ready for Review</Badge>;
      case 'PROCESSING':
        return <Badge variant="info">Processing...</Badge>;
      case 'PARTIALLY_FAILED':
        return <Badge variant="danger">Partially Failed</Badge>;
      case 'FAILED':
        return <Badge variant="danger">Failed</Badge>;
      case 'CANCELLED':
        return <Badge variant="neutral">Cancelled</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const filteredReviewItems = (selectedBatchDetails?.reviewItems || []).filter((item: any) => {
    const matchesSearch =
      item.fullName.toLowerCase().includes(reviewSearch.toLowerCase()) ||
      item.employeeNumber.toLowerCase().includes(reviewSearch.toLowerCase()) ||
      item.department.toLowerCase().includes(reviewSearch.toLowerCase());
    const matchesMethod = reviewMethodFilter === 'ALL' || item.paymentMethod === reviewMethodFilter;
    return matchesSearch && matchesMethod;
  });

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1600px', margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { label: 'Payroll', href: '/payroll' },
          { label: 'Disbursements & Payment Batches', href: '/payroll/disbursements' },
        ]}
      />

      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginTop: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
              Payroll Disbursement Center
            </h1>
            <Badge variant="gold">Phase 9 Live</Badge>
            <Badge variant="info">TEST MODE Gateway</Badge>
          </div>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Authoritative net salary payouts, approval workflows, M-Pesa/EFT batch management, and idempotency protection
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '260px' }}>
            <Select
              options={periods.map((p) => ({
                value: p.id,
                label: `${p.name} (${p.periodNumber})`,
              }))}
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
            />
          </div>

          <Button
            variant="primary"
            leftIcon={<Plus size={16} />}
            onClick={handleOpenCreateModal}
          >
            Create Payment Batch
          </Button>

          <Link href="/payroll/reconciliation" style={{ textDecoration: 'none' }}>
            <Button variant="outline" leftIcon={<RefreshCw size={16} />}>
              Reconciliation
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <div style={{ padding: '3rem 0', textAlign: 'center' }}>
            <Spinner fullHeight message="Loading disbursement command center..." />
          </div>
        </Card>
      ) : (
        <>
          {/* 8 Top KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <Card>
              <div style={{ padding: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
                  <span>NET PAYROLL</span>
                  <Banknote size={16} color="#0284c7" />
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                  KES {(stats?.totalNetPayroll || 0).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  {stats?.totalEmployees || 0} active employees
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ padding: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
                  <span>DISBURSED (PAID)</span>
                  <CheckCircle2 size={16} color="#16a34a" />
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#16a34a', marginTop: '0.25rem' }}>
                  KES {(stats?.successfulAmount || 0).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '0.25rem' }}>
                  {stats?.successfulCount || 0} staff paid
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ padding: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
                  <span>REMAINING PENDING</span>
                  <Clock size={16} color="#d97706" />
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#d97706', marginTop: '0.25rem' }}>
                  KES {(stats?.pendingAmount || 0).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  {stats?.pendingCount || 0} pending payout
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ padding: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
                  <span>COMPLETION %</span>
                  <TrendingUp size={16} color="#4f46e5" />
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#4f46e5', marginTop: '0.25rem' }}>
                  {stats?.completionPercentage || 0}%
                </div>
                <div
                  style={{
                    height: '6px',
                    backgroundColor: '#e2e8f0',
                    borderRadius: '4px',
                    marginTop: '0.5rem',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, stats?.completionPercentage || 0)}%`,
                      backgroundColor: stats?.completionPercentage === 100 ? '#16a34a' : '#4f46e5',
                      borderRadius: '4px',
                    }}
                  />
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ padding: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
                  <span>FAILED PAYOUTS</span>
                  <AlertTriangle size={16} color="#ef4444" />
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: (stats?.failedCount || 0) > 0 ? '#ef4444' : '#64748b', marginTop: '0.25rem' }}>
                  {stats?.failedCount || 0}
                </div>
                <div style={{ fontSize: '0.75rem', color: (stats?.failedCount || 0) > 0 ? '#ef4444' : '#64748b', marginTop: '0.25rem' }}>
                  KES {(stats?.failedAmount || 0).toLocaleString()}
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ padding: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
                  <span>ACTIVE BATCHES</span>
                  <FileCheck size={16} color="#0891b2" />
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                  {stats?.batchesCount || 0}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Period disbursement batches
                </div>
              </div>
            </Card>
          </div>

          {/* Payment Batches Section */}
          <Card
            title="Disbursement Batches Ledger"
            subtitle="Batched payment runs with maker-checker authorizations and gateway execution"
          >
            {batches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                <Send size={40} color="#94a3b8" style={{ marginBottom: '1rem' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#334155', margin: 0 }}>
                  No Disbursement Batches Created Yet
                </h3>
                <p style={{ fontSize: '0.875rem', maxWidth: '500px', margin: '0.5rem auto 1.5rem' }}>
                  Create your first payment batch for this period to review employee banking and M-Pesa destinations before dispatching payouts.
                </p>
                <Button variant="primary" leftIcon={<Plus size={16} />} onClick={handleOpenCreateModal}>
                  Create First Payment Batch
                </Button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>BATCH NUMBER</th>
                      <th style={{ padding: '0.75rem 1rem' }}>BATCH NAME</th>
                      <th style={{ padding: '0.75rem 1rem' }}>METHOD</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>STAFF</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>TOTAL AMOUNT</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>DISBURSED / FAILED</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>STATUS</th>
                      <th style={{ padding: '0.75rem 1rem' }}>CREATED BY</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((batch) => (
                      <tr key={batch.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: '#0f172a' }}>
                          {batch.batchNumber}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>{batch.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {batch.payrollPeriod?.name || 'Monthly Period'}
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <Badge variant="neutral">{batch.paymentMethod}</Badge>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                          {batch.totalEmployees}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                          KES {batch.totalAmount.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          <span style={{ color: '#16a34a', fontWeight: 700 }}>{batch.successfulCount}</span>
                          <span style={{ color: '#94a3b8', margin: '0 4px' }}>/</span>
                          <span style={{ color: batch.failedCount > 0 ? '#ef4444' : '#64748b', fontWeight: 700 }}>
                            {batch.failedCount}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          {getStatusBadge(batch.status)}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: '#475569' }}>
                          {batch.createdBy ? `${batch.createdBy.firstName} ${batch.createdBy.lastName}` : 'System'}
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                            {new Date(batch.createdAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Eye size={14} />}
                            onClick={() => handleOpenBatchDetails(batch.id)}
                          >
                            Review &amp; Process
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* CREATE PAYMENT BATCH MODAL */}
      {isCreateModalOpen && (
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title="Create New Payroll Disbursement Batch"
          size="lg"
        >
          <form onSubmit={handleCreateBatch} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ padding: '0.75rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '0.85rem', color: '#166534' }}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={16} /> Authoritative Net Pay Assurance
              </div>
              <p style={{ margin: '0.25rem 0 0' }}>
                Disbursement amounts are calculated from finalized payroll records and verified against server-side idempotency ledgers.
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Finalized Payroll Calculation Run *
              </label>
              <Select
                options={runs.map((r) => ({
                  value: r.id,
                  label: `${r.runNumber} — Status: ${r.status} (${r.employeeRecords?.length || 0} staff, Net: KES ${(r.totalNetPay || 0).toLocaleString()})`,
                }))}
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Batch Title / Reference Name *
              </label>
              <Input
                type="text"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="e.g. August 2026 Monthly General Payout"
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Disbursement Channel / Method
                </label>
                <Select
                  options={[
                    { value: 'MIXED', label: 'Mixed (Bank EFT + M-Pesa as configured)' },
                    { value: 'BANK', label: 'Bank Direct Transfers (EFT Only)' },
                    { value: 'MPESA', label: 'Safaricom M-Pesa B2C Only' },
                  ]}
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Execution Mode
                </label>
                <Input type="text" value="TEST MODE (Mock Gateway Simulator)" disabled />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Notes &amp; Internal Audit Memo
              </label>
              <Input
                type="text"
                value={batchNotes}
                onChange={(e) => setBatchNotes(e.target.value)}
                placeholder="e.g. Monthly guard salaries approved by Finance Committee"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isProcessingAction} leftIcon={<Send size={16} />}>
                Create &amp; Review Batch
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* BATCH REVIEW & WORKFLOW DRAWER / MODAL */}
      {isReviewModalOpen && (
        <Modal
          isOpen={isReviewModalOpen}
          onClose={() => setIsReviewModalOpen(false)}
          title={`Batch Review: ${selectedBatchDetails?.batch?.batchNumber || 'Loading...'}`}
          size="xl"
        >
          {isLoadingDetails || !selectedBatchDetails ? (
            <div style={{ padding: '3rem 0', textAlign: 'center' }}>
              <Spinner fullHeight message="Loading batch review matrix & destination validations..." />
            </div>
          ) : (
            <div>
              {/* Batch Meta Bar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                    {selectedBatchDetails.batch.name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
                    Period: {selectedBatchDetails.batch.payrollPeriod?.name} | Run: {selectedBatchDetails.batch.payrollRun?.runNumber}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>TOTAL VALUE</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16a34a' }}>
                      KES {selectedBatchDetails.batch.totalAmount.toLocaleString()}
                    </div>
                  </div>
                  <div>{getStatusBadge(selectedBatchDetails.batch.status)}</div>
                </div>
              </div>

              {/* Progress Flow Banner */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  backgroundColor: '#f1f5f9',
                  borderRadius: '6px',
                  marginBottom: '1.25rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#475569',
                }}
              >
                <div style={{ color: '#0f172a', fontWeight: 700 }}>
                  1. DRAFT {selectedBatchDetails.batch.status === 'DRAFT' && '👈'}
                </div>
                <ArrowRight size={14} color="#94a3b8" />
                <div style={{ color: selectedBatchDetails.batch.status === 'READY' ? '#0284c7' : 'inherit' }}>
                  2. READY FOR REVIEW {selectedBatchDetails.batch.status === 'READY' && '👈'}
                </div>
                <ArrowRight size={14} color="#94a3b8" />
                <div style={{ color: selectedBatchDetails.batch.status === 'APPROVED' ? '#16a34a' : 'inherit' }}>
                  3. APPROVED {selectedBatchDetails.batch.status === 'APPROVED' && '👈'}
                </div>
                <ArrowRight size={14} color="#94a3b8" />
                <div style={{ color: selectedBatchDetails.batch.status === 'COMPLETED' ? '#16a34a' : 'inherit' }}>
                  4. COMPLETED {selectedBatchDetails.batch.status === 'COMPLETED' && '✓'}
                </div>
              </div>

              {/* Validation Alert if issues found */}
              {selectedBatchDetails.validation?.errors?.length > 0 && (
                <div style={{ padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', marginBottom: '1rem', color: '#991b1b', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertTriangle size={16} /> Destination Validation Errors Detected ({selectedBatchDetails.validation.errors.length})
                  </div>
                  <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
                    {selectedBatchDetails.validation.errors.slice(0, 3).map((err: any, idx: number) => (
                      <li key={idx}>{err.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Filter controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ width: '280px' }}>
                  <Input
                    type="text"
                    placeholder="Search staff, ID, department..."
                    value={reviewSearch}
                    onChange={(e) => setReviewSearch(e.target.value)}
                  />
                </div>

                <div style={{ width: '200px' }}>
                  <Select
                    options={[
                      { value: 'ALL', label: 'All Payment Methods' },
                      { value: 'BANK', label: 'Bank Transfer (EFT)' },
                      { value: 'MPESA', label: 'M-Pesa Mobile Money' },
                    ]}
                    value={reviewMethodFilter}
                    onChange={(e) => setReviewMethodFilter(e.target.value)}
                  />
                </div>
              </div>

              {/* Staff Review Matrix */}
              <div style={{ maxHeight: '360px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>
                    <tr style={{ borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#334155' }}>
                      <th style={{ padding: '0.65rem 0.75rem' }}>EMPLOYEE</th>
                      <th style={{ padding: '0.65rem 0.75rem' }}>DEPARTMENT / STATION</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>NET SALARY</th>
                      <th style={{ padding: '0.65rem 0.75rem' }}>METHOD</th>
                      <th style={{ padding: '0.65rem 0.75rem' }}>MASKED DESTINATION</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>PAYMENT STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReviewItems.map((item: any) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.6rem 0.75rem' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.fullName}</div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            {item.employeeNumber} | ID: {item.nationalId}
                          </div>
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', color: '#475569' }}>
                          <div>{item.department}</div>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{item.station}</div>
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                          KES {item.netPay.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              backgroundColor: item.paymentMethod === 'MPESA' ? '#dcfce7' : '#e0f2fe',
                              color: item.paymentMethod === 'MPESA' ? '#166534' : '#0369a1',
                              fontWeight: 600,
                            }}
                          >
                            {item.paymentMethod === 'MPESA' ? <Phone size={12} /> : <CreditCard size={12} />}
                            {item.paymentMethod}
                          </span>
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'monospace', color: '#334155' }}>
                          {item.destinationMasked}
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                          {item.paymentStatus === 'PAID' ? (
                            <Badge variant="success">Paid</Badge>
                          ) : item.paymentStatus === 'FAILED' ? (
                            <Badge variant="danger">Failed</Badge>
                          ) : (
                            <Badge variant="neutral">Pending</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Transactions list if already executed */}
              {selectedBatchDetails.transactions?.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
                    Executed Payment Transactions ({selectedBatchDetails.transactions.length})
                  </h4>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                      <thead style={{ backgroundColor: '#f8fafc', position: 'sticky', top: 0 }}>
                        <tr style={{ textAlign: 'left', color: '#64748b' }}>
                          <th style={{ padding: '0.5rem' }}>TX NUMBER</th>
                          <th style={{ padding: '0.5rem' }}>EMPLOYEE</th>
                          <th style={{ padding: '0.5rem', textAlign: 'right' }}>AMOUNT</th>
                          <th style={{ padding: '0.5rem' }}>GATEWAY REF</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center' }}>STATUS</th>
                          <th style={{ padding: '0.5rem', textAlign: 'right' }}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedBatchDetails.transactions.map((tx: any) => (
                          <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.5rem', fontWeight: 600 }}>{tx.transactionNumber}</td>
                            <td style={{ padding: '0.5rem' }}>{tx.fullName} ({tx.employeeNumber})</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700 }}>
                              KES {tx.amount.toLocaleString()}
                            </td>
                            <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{tx.providerReference || 'N/A'}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                              {tx.status === 'SUCCESS' ? (
                                <Badge variant="success">Success</Badge>
                              ) : (
                                <Badge variant="danger">Failed</Badge>
                              )}
                            </td>
                            <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                              {tx.status === 'FAILED' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRetryTransaction(tx.id)}
                                  isLoading={isProcessingAction}
                                >
                                  Retry Payout
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Action Buttons Bar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTop: '1px solid #e2e8f0',
                  paddingTop: '1.25rem',
                  marginTop: '1.25rem',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div>
                  {selectedBatchDetails.batch.status !== 'CANCELLED' && selectedBatchDetails.batch.status !== 'COMPLETED' && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleBatchWorkflowAction('cancel')}
                      isLoading={isProcessingAction}
                      leftIcon={<XCircle size={14} />}
                    >
                      Cancel Batch
                    </Button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <Button variant="outline" onClick={() => setIsReviewModalOpen(false)}>
                    Close
                  </Button>

                  {/* Workflow buttons according to state */}
                  {selectedBatchDetails.batch.status === 'DRAFT' && (
                    <Button
                      variant="primary"
                      onClick={() => handleBatchWorkflowAction('submit')}
                      isLoading={isProcessingAction}
                      leftIcon={<Send size={16} />}
                    >
                      Submit for Approval Review
                    </Button>
                  )}

                  {selectedBatchDetails.batch.status === 'READY' && (
                    <Button
                      variant="primary"
                      onClick={() => handleBatchWorkflowAction('approve')}
                      isLoading={isProcessingAction}
                      leftIcon={<ShieldCheck size={16} />}
                    >
                      Authorize &amp; Approve Batch
                    </Button>
                  )}

                  {selectedBatchDetails.batch.status === 'APPROVED' && (
                    <Button
                      variant="primary"
                      onClick={() => handleBatchWorkflowAction('process')}
                      isLoading={isProcessingAction}
                      leftIcon={<CheckCircle2 size={16} />}
                    >
                      Execute Payout Disbursement (TEST MODE)
                    </Button>
                  )}

                  {selectedBatchDetails.batch.status === 'COMPLETED' && (
                    <Link href="/payroll/reconciliation" style={{ textDecoration: 'none' }}>
                      <Button variant="primary" leftIcon={<RefreshCw size={16} />}>
                        View in Reconciliation
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
