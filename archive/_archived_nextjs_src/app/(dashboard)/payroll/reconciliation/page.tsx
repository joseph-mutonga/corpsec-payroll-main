'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastContext';
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Printer,
  Save,
  Search,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Banknote,
  ShieldCheck,
  FileCheck,
  CreditCard,
} from 'lucide-react';
import { PaymentDiscrepancyItem, PaymentReconciliationStatus } from '@/types';

export default function PayrollReconciliationPage() {
  const { toast } = useToast();

  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');

  const [reconciliationData, setReconciliationData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingReport, setIsSavingReport] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  useEffect(() => {
    fetchPeriods();
  }, []);

  useEffect(() => {
    if (selectedPeriodId) {
      fetchRunsForPeriod(selectedPeriodId);
    }
  }, [selectedPeriodId]);

  useEffect(() => {
    if (selectedPeriodId && selectedRunId) {
      fetchReconciliationData(selectedPeriodId, selectedRunId);
    }
  }, [selectedPeriodId, selectedRunId]);

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
        setSelectedRunId(data.data[0].id);
      } else {
        setRuns([]);
        setSelectedRunId('');
        setReconciliationData(null);
        setIsLoading(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchReconciliationData = async (periodId: string, runId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/payroll/payments/reconciliation?payrollPeriodId=${periodId}&runId=${runId}`);
      const data = await res.json();
      if (data.success) {
        setReconciliationData(data.data);
      } else {
        toast.error('Error', data.message || 'Failed to perform reconciliation');
      }
    } catch (err) {
      toast.error('Error', 'Error calculating reconciliation ledger');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveOfficialReport = async () => {
    if (!reconciliationData) return;
    setIsSavingReport(true);
    try {
      const res = await fetch('/api/payroll/payments/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payrollPeriodId: selectedPeriodId,
          runId: selectedRunId,
          notes: 'Official payroll disbursement audit reconciliation ledger verified by Finance & Payroll.',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to persist reconciliation report');
      }

      toast.success('Success', data.message || 'Official reconciliation record logged into immutable audit ledger');
    } catch (err: any) {
      toast.error('Error', err.message);
    } finally {
      setIsSavingReport(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getDiscrepancyBadge = (type: PaymentDiscrepancyItem['discrepancyType']) => {
    switch (type) {
      case 'EXACT_MATCH':
        return <Badge variant="success">Exact Match (✓)</Badge>;
      case 'MISSING_PAYMENT':
        return <Badge variant="neutral">Missing Payment</Badge>;
      case 'UNDERPAYMENT':
        return <Badge variant="warning">Underpayment Variance</Badge>;
      case 'OVERPAYMENT':
        return <Badge variant="danger">Overpayment Variance</Badge>;
      case 'FAILED_PAYMENT':
        return <Badge variant="danger">Gateway Failed</Badge>;
      case 'DUPLICATE_ATTEMPT':
        return <Badge variant="danger">Duplicate Alert</Badge>;
      default:
        return <Badge variant="neutral">{type}</Badge>;
    }
  };

  const filteredItems = (reconciliationData?.discrepancies || []).filter((item: PaymentDiscrepancyItem) => {
    const matchesSearch =
      item.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.employeeNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.department.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter = filterType === 'ALL' || item.discrepancyType === filterType;
    return matchesSearch && matchesFilter;
  });

  const summary = reconciliationData?.summary;

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1600px', margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { label: 'Payroll', href: '/payroll' },
          { label: 'Disbursements', href: '/payroll/disbursements' },
          { label: 'Reconciliation Center', href: '/payroll/reconciliation' },
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
              Payroll Payment Reconciliation Center
            </h1>
            <Badge variant="gold">Phase 9 Live</Badge>
          </div>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Dual-ledger comparison: Authorized Net Pay vs Actual Provider Transactions with automated variance detection
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ width: '220px' }}>
            <Select
              options={periods.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
            />
          </div>

          <div style={{ width: '220px' }}>
            <Select
              options={runs.map((r) => ({
                value: r.id,
                label: `${r.runNumber} (${r.status})`,
              }))}
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
            />
          </div>

          <Button
            variant="outline"
            leftIcon={<Printer size={16} />}
            onClick={handlePrint}
          >
            Print
          </Button>

          <Button
            variant="primary"
            leftIcon={<Save size={16} />}
            onClick={handleSaveOfficialReport}
            isLoading={isSavingReport}
          >
            Save Audit Report
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <div style={{ padding: '3rem 0', textAlign: 'center' }}>
            <Spinner fullHeight message="Comparing payroll expected net pay against transaction ledgers..." />
          </div>
        </Card>
      ) : !reconciliationData ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
            <AlertTriangle size={36} color="#d97706" style={{ marginBottom: '1rem' }} />
            <h3>No Active Payroll Run for Reconciliation</h3>
            <p>Please select a period and run that has finalized calculated employee records.</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Status Verdict Banner */}
          <div
            style={{
              padding: '1.25rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              backgroundColor:
                summary?.status === 'RECONCILED'
                  ? '#f0fdf4'
                  : summary?.status === 'EXCEPTIONS_FOUND'
                  ? '#fffbeb'
                  : '#f8fafc',
              border: `1px solid ${
                summary?.status === 'RECONCILED'
                  ? '#bbf7d0'
                  : summary?.status === 'EXCEPTIONS_FOUND'
                  ? '#fde68a'
                  : '#e2e8f0'
              }`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {summary?.status === 'RECONCILED' ? (
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldCheck size={28} color="#16a34a" />
                </div>
              ) : summary?.status === 'EXCEPTIONS_FOUND' ? (
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={28} color="#d97706" />
                </div>
              ) : (
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RefreshCw size={28} color="#64748b" />
                </div>
              )}

              <div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                  Reconciliation Status:{' '}
                  {summary?.status === 'RECONCILED'
                    ? '100% RECONCILED (ZERO VARIANCE)'
                    : summary?.status === 'EXCEPTIONS_FOUND'
                    ? 'EXCEPTIONS FOUND (ACTION REQUIRED)'
                    : summary?.status === 'IN_PROGRESS'
                    ? 'DISBURSEMENTS IN PROGRESS'
                    : 'NOT YET RECONCILED (PENDING PAYOUTS)'}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '0.2rem' }}>
                  Payroll Run: {reconciliationData.run.runNumber} | Period: {reconciliationData.period.name}
                </div>
              </div>
            </div>

            <div>
              {summary?.status === 'RECONCILED' ? (
                <Badge variant="success" size="md">Zero-Cent Match Confirmed</Badge>
              ) : (
                <Badge variant="warning" size="md">{summary?.exceptionsCount || 0} Exceptions Pending</Badge>
              )}
            </div>
          </div>

          {/* 4 Summary Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <Card>
              <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>EXPECTED PAYROLL NET</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                KES {(summary?.expectedAmount || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                {summary?.totalExpectedEmployees || 0} employees calculated
              </div>
            </Card>

            <Card>
              <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>ACTUAL DISBURSED PAID</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#16a34a', marginTop: '0.25rem' }}>
                KES {(summary?.actualPaidAmount || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '0.25rem' }}>
                {summary?.totalPaidEmployees || 0} successfully paid
              </div>
            </Card>

            <Card>
              <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>DISCREPANCY VARIANCE</div>
              <div
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 800,
                  color: (summary?.discrepancyAmount || 0) === 0 ? '#16a34a' : '#ef4444',
                  marginTop: '0.25rem',
                }}
              >
                KES {(summary?.discrepancyAmount || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                {(summary?.discrepancyAmount || 0) === 0 ? 'Exact zero-cent balance' : 'Variance between payroll & payments'}
              </div>
            </Card>

            <Card>
              <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>UNRESOLVED EXCEPTIONS</div>
              <div
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 800,
                  color: (summary?.exceptionsCount || 0) === 0 ? '#16a34a' : '#d97706',
                  marginTop: '0.25rem',
                }}
              >
                {summary?.exceptionsCount || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                {(summary?.exceptionsCount || 0) === 0 ? 'All staff cleared' : 'Requires review in disbursements'}
              </div>
            </Card>
          </div>

          {/* Discrepancy Table Card */}
          <Card
            title="Itemized Reconciliation Ledger"
            subtitle="Line-by-line comparison of payroll entitlement against bank and M-Pesa clearing transactions"
          >
            {/* Search and Filters */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '1rem',
                marginBottom: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ width: '320px' }}>
                <Input
                  type="text"
                  placeholder="Search staff, ID, department..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div style={{ width: '240px' }}>
                <Select
                  options={[
                    { value: 'ALL', label: 'All Discrepancy Types' },
                    { value: 'EXACT_MATCH', label: 'Exact Match Only' },
                    { value: 'MISSING_PAYMENT', label: 'Missing Payment Only' },
                    { value: 'FAILED_PAYMENT', label: 'Failed Transactions' },
                    { value: 'UNDERPAYMENT', label: 'Underpayments' },
                    { value: 'OVERPAYMENT', label: 'Overpayments' },
                  ]}
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                />
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>EMPLOYEE</th>
                    <th style={{ padding: '0.75rem 1rem' }}>DEPARTMENT / STATION</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>EXPECTED NET</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>ACTUAL PAID</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>VARIANCE</th>
                    <th style={{ padding: '0.75rem 1rem' }}>CHANNEL</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>STATUS VERDICT</th>
                    <th style={{ padding: '0.75rem 1rem' }}>AUDIT NOTES</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item: PaymentDiscrepancyItem) => (
                    <tr
                      key={item.employeeId}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: item.discrepancyType !== 'EXACT_MATCH' ? '#fffdfa' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.fullName}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.employeeNumber}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                        <div>{item.department}</div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{item.station}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                        KES {item.expectedNetPay.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: item.actualPaidAmount > 0 ? '#16a34a' : '#64748b',
                        }}
                      >
                        KES {item.actualPaidAmount.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: item.difference === 0 ? '#16a34a' : '#ef4444',
                        }}
                      >
                        KES {item.difference.toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <Badge variant="neutral">{item.paymentMethod}</Badge>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        {getDiscrepancyBadge(item.discrepancyType)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', color: '#475569', maxWidth: '280px' }}>
                        {item.notes}
                        {item.providerReference && (
                          <div style={{ fontFamily: 'monospace', color: '#0284c7', marginTop: '2px' }}>
                            Ref: {item.providerReference}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
