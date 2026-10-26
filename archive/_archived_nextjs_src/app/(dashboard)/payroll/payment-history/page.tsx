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
  CreditCard,
  Phone,
  Search,
  Printer,
  FileText,
  Eye,
  Building2,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Receipt,
  Calendar,
} from 'lucide-react';
import { PaymentReceiptData } from '@/types';

export default function PaymentHistoryPage() {
  const { toast } = useToast();

  const [transactions, setTransactions] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  // Receipt Modal State
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<PaymentReceiptData | null>(null);
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);

  useEffect(() => {
    fetchTransactions();
  }, [searchQuery, methodFilter, statusFilter, page]);

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (methodFilter !== 'ALL') params.set('paymentMethod', methodFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      params.set('page', page.toString());
      params.set('pageSize', '25');

      const res = await fetch(`/api/payroll/payments/transactions?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setTransactions(data.data);
        setTotalCount(data.meta?.total || 0);
      }
    } catch (err) {
      toast.error('Error', 'Failed to load transaction history');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenReceipt = async (transactionId: string) => {
    setIsLoadingReceipt(true);
    setIsReceiptModalOpen(true);
    try {
      const res = await fetch(`/api/payroll/payments/transactions/${transactionId}/receipt`);
      const data = await res.json();
      if (data.success) {
        setReceiptData(data.data);
      } else {
        toast.error('Error', data.message || 'Failed to load payment receipt');
      }
    } catch (err) {
      toast.error('Error', 'Error loading payment receipt');
    } finally {
      setIsLoadingReceipt(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <Badge variant="success">Success</Badge>;
      case 'FAILED':
        return <Badge variant="danger">Failed</Badge>;
      case 'PROCESSING':
        return <Badge variant="info">Processing</Badge>;
      case 'REVERSED':
        return <Badge variant="warning">Reversed</Badge>;
      default:
        return <Badge variant="neutral">Pending</Badge>;
    }
  };

  const totalFilteredSum = transactions.reduce((sum, t) => sum + (t.status === 'SUCCESS' ? t.amount : 0), 0);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1600px', margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { label: 'Payroll', href: '/payroll' },
          { label: 'Disbursements', href: '/payroll/disbursements' },
          { label: 'Payment History Ledger', href: '/payroll/payment-history' },
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
              Historical Payment Transactions
            </h1>
            <Badge variant="gold">Phase 9 Live</Badge>
          </div>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Comprehensive audit archive of bank EFT and M-Pesa payouts with individual digital receipts
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/payroll/disbursements" style={{ textDecoration: 'none' }}>
            <Button variant="outline">Disbursements Hub</Button>
          </Link>
          <Link href="/payroll/reconciliation" style={{ textDecoration: 'none' }}>
            <Button variant="primary">Reconciliation</Button>
          </Link>
        </div>
      </div>

      {/* Filters Card */}
      <Card>
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: '1rem', flex: 1, minWidth: '300px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <Input
                type="text"
                placeholder="Search by transaction #, reference, staff name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ width: '180px' }}>
              <Select
                options={[
                  { value: 'ALL', label: 'All Methods' },
                  { value: 'BANK', label: 'Bank Transfer' },
                  { value: 'MPESA', label: 'M-Pesa Money' },
                ]}
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
              />
            </div>

            <div style={{ width: '180px' }}>
              <Select
                options={[
                  { value: 'ALL', label: 'All Statuses' },
                  { value: 'SUCCESS', label: 'Success Only' },
                  { value: 'FAILED', label: 'Failed Only' },
                  { value: 'PENDING', label: 'Pending Only' },
                ]}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              />
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>PAGE TOTAL PAID</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#16a34a' }}>
              KES {totalFilteredSum.toLocaleString()}
            </div>
          </div>
        </div>
      </Card>

      {/* Transactions Table */}
      <div style={{ marginTop: '1.5rem' }}>
        <Card
          title={`Payment Transactions (${totalCount})`}
          subtitle="Real-time synchronized ledger with unique gateway tracking and masked account details"
        >
          {isLoading ? (
            <div style={{ padding: '3rem 0', textAlign: 'center' }}>
              <Spinner fullHeight message="Loading historical transactions..." />
            </div>
          ) : transactions.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748b' }}>
              <CreditCard size={40} color="#94a3b8" style={{ marginBottom: '1rem' }} />
              <h3>No Payment Transactions Match Your Filters</h3>
              <p style={{ fontSize: '0.875rem' }}>
                Disburse a payment batch in the Disbursements Hub to populate transaction history.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>TX NUMBER</th>
                    <th style={{ padding: '0.75rem 1rem' }}>EMPLOYEE</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>AMOUNT</th>
                    <th style={{ padding: '0.75rem 1rem' }}>CHANNEL</th>
                    <th style={{ padding: '0.75rem 1rem' }}>MASKED DESTINATION</th>
                    <th style={{ padding: '0.75rem 1rem' }}>PROVIDER REFERENCE</th>
                    <th style={{ padding: '0.75rem 1rem' }}>DATE / TIME</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>STATUS</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>RECEIPT</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f172a' }}>
                        {tx.transactionNumber}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{tx.fullName}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {tx.employeeNumber} | {tx.department}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                        KES {tx.amount.toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <Badge variant={tx.paymentMethod === 'MPESA' ? 'success' : 'info'}>
                          {tx.paymentMethod}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: '#334155' }}>
                        {tx.destinationMasked}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: '#0284c7', fontSize: '0.8rem' }}>
                        {tx.providerReference || 'N/A'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', color: '#64748b' }}>
                        {new Date(tx.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        {getStatusBadge(tx.status)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<Receipt size={14} />}
                          onClick={() => handleOpenReceipt(tx.id)}
                        >
                          Receipt
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* OFFICIAL PAYMENT RECEIPT MODAL */}
      {isReceiptModalOpen && (
        <Modal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          title="Corporate Payroll Payment Receipt"
          size="lg"
        >
          {isLoadingReceipt || !receiptData ? (
            <div style={{ padding: '3rem 0', textAlign: 'center' }}>
              <Spinner fullHeight message="Generating verified payment receipt..." />
            </div>
          ) : (
            <div
              id="printable-receipt"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '2rem',
                color: '#0f172a',
              }}
            >
              {/* Header Letterhead */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '2px solid #0f172a',
                  paddingBottom: '1.25rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
                    {receiptData.company.name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
                    {receiptData.company.tagline}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.35rem' }}>
                    KRA PIN: <strong>{receiptData.company.kraPin}</strong> | {receiptData.company.address}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0284c7' }}>
                    PAYMENT RECEIPT
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: '0.2rem' }}>
                    {receiptData.transactionNumber}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Date: {receiptData.paymentDate}
                  </div>
                </div>
              </div>

              {/* Status Badge Banner */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.85rem 1.25rem',
                  backgroundColor: receiptData.status === 'SUCCESS' ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${receiptData.status === 'SUCCESS' ? '#bbf7d0' : '#fecaca'}`,
                  borderRadius: '6px',
                  marginBottom: '1.5rem',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>DISBURSED AMOUNT</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#16a34a' }}>
                    KES {receiptData.amount.toLocaleString()}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <Badge variant={receiptData.status === 'SUCCESS' ? 'success' : 'danger'} size="md">
                    {receiptData.status === 'SUCCESS' ? 'PAYMENT SUCCESSFUL' : 'PAYMENT FAILED'}
                  </Badge>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                    Channel: {receiptData.paymentMethod}
                  </div>
                </div>
              </div>

              {/* Employee & Transaction Details Matrix */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1.25rem',
                  backgroundColor: '#f8fafc',
                  padding: '1.25rem',
                  borderRadius: '6px',
                  marginBottom: '1.5rem',
                  fontSize: '0.85rem',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>RECIPIENT EMPLOYEE</div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', marginTop: '0.2rem' }}>{receiptData.employee.fullName}</div>
                  <div style={{ color: '#475569', marginTop: '0.2rem' }}>
                    Staff ID: {receiptData.employee.employeeNumber} | ID: {receiptData.employee.nationalId}
                  </div>
                  <div style={{ color: '#475569' }}>
                    {receiptData.employee.department} ({receiptData.employee.station})
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>TRANSACTION METRICS</div>
                  <div style={{ marginTop: '0.2rem' }}>
                    <span style={{ color: '#64748b' }}>Gateway Ref: </span>
                    <strong style={{ fontFamily: 'monospace', color: '#0284c7' }}>{receiptData.providerReference}</strong>
                  </div>
                  <div style={{ marginTop: '0.2rem' }}>
                    <span style={{ color: '#64748b' }}>Destination: </span>
                    <strong style={{ fontFamily: 'monospace' }}>{receiptData.destinationMasked}</strong>
                  </div>
                  <div style={{ marginTop: '0.2rem' }}>
                    <span style={{ color: '#64748b' }}>Payroll Period: </span>
                    <strong>{receiptData.payrollPeriod.name}</strong>
                  </div>
                </div>
              </div>

              {/* Security & Disclaimer Footer */}
              <div
                style={{
                  borderTop: '1px solid #e2e8f0',
                  paddingTop: '1rem',
                  textAlign: 'center',
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                }}
              >
                <p style={{ margin: 0 }}>
                  This is an official computer-generated payroll payment receipt from CorpSec HR Payroll System.
                  Amounts are verified against sealed ledger run {receiptData.payrollPeriod.runNumber}.
                </p>
              </div>

              {/* Action Buttons in Modal */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <Button variant="outline" onClick={() => setIsReceiptModalOpen(false)}>
                  Close
                </Button>
                <Button variant="primary" leftIcon={<Printer size={16} />} onClick={handlePrintReceipt}>
                  Print Receipt
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
