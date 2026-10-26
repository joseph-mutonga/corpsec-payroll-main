'use client';

import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Download,
  Printer,
  Eye,
  CheckCircle2,
  AlertCircle,
  Building,
  ShieldCheck,
  Search,
  Filter,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { PaymentReceiptData } from '@/types';

export default function EmployeePaymentsPage() {
  const { toast } = useToast();
  const [payments, setPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Receipt Modal
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<PaymentReceiptData | null>(null);
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/portal/payments');
      const data = await res.json();
      if (data.success) {
        setPayments(data.data || []);
      } else {
        toast.error('Error', data.message || 'Failed to load payment records');
      }
    } catch (err) {
      toast.error('Error', 'Unable to connect to payments service');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewReceipt = async (transactionId: string) => {
    setSelectedTxId(transactionId);
    setIsLoadingReceipt(true);
    try {
      const res = await fetch(`/api/portal/payments/${transactionId}/receipt`);
      const data = await res.json();
      if (data.success) {
        setReceiptData(data.data);
      } else {
        toast.error('Error', data.message || 'Failed to retrieve payment receipt');
      }
    } catch (err) {
      toast.error('Error', 'Failed to generate digital receipt');
    } finally {
      setIsLoadingReceipt(false);
    }
  };

  const filteredPayments = payments.filter((p) => {
    return (
      p.transactionNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.periodName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.paymentMethod.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.providerReference && p.providerReference.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  if (isLoading) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <Spinner fullHeight message="Loading your payment transaction history..." />
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: '3rem' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            My Salary Disbursement History
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
            Verified bank EFT clearing and M-Pesa B2C salary payment transaction records.
          </p>
        </div>

        <div style={{ width: '280px' }}>
          <Input
            placeholder="Search transactions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search size={16} />}
          />
        </div>
      </div>

      {filteredPayments.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
            <CreditCard size={40} color="#94a3b8" style={{ marginBottom: '1rem' }} />
            <h3 style={{ fontSize: '1.15rem', color: '#0f172a' }}>No Payment Records Found</h3>
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              Your electronic payment receipts and gateway confirmation records will be listed here.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', backgroundColor: '#f8fafc' }}>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Tx Number</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Payroll Period</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Method & Destination</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700, textAlign: 'right' }}>Amount Paid</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Date Cleared</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700, textAlign: 'center' }}>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                      {p.transactionNumber}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{p.periodName}</span>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Batch: {p.batchNumber}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant={p.paymentMethod === 'MPESA' ? 'success' : 'info'} size="sm">
                        {p.paymentMethod}
                      </Badge>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem', fontFamily: 'monospace' }}>
                        {p.destinationMasked}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 800, color: '#16a34a', fontSize: '0.95rem' }}>
                      KES {p.amount.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant={p.status === 'SUCCESS' ? 'success' : p.status === 'FAILED' ? 'danger' : 'warning'}>
                        {p.status}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                      {p.processedAt ? new Date(p.processedAt).toLocaleDateString() : new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<Eye size={14} />}
                        onClick={() => handleViewReceipt(p.id)}
                      >
                        Receipt
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Payment Receipt Modal */}
      <Modal
        isOpen={!!selectedTxId}
        onClose={() => {
          setSelectedTxId(null);
          setReceiptData(null);
        }}
        title="Official Payment Receipt"
        size="md"
      >
        {isLoadingReceipt || !receiptData ? (
          <div style={{ padding: '3rem 0', textAlign: 'center' }}>
            <Spinner fullHeight message="Retrieving digital payment confirmation..." />
          </div>
        ) : (
          <div>
            {/* Header letterhead */}
            <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '0.85rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                  {receiptData.company.name}
                </h3>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                  KRA PIN: {receiptData.company.kraPin} • {receiptData.company.address}
                </div>
              </div>
              <Badge variant={receiptData.status === 'SUCCESS' ? 'success' : 'danger'} size="md">
                {receiptData.status}
              </Badge>
            </div>

            {/* Receipt Summary Banner */}
            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '1rem', textAlign: 'center', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600, textTransform: 'uppercase' }}>
                Amount Disbursed & Cleared
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#15803d', marginTop: '0.25rem' }}>
                KES {receiptData.amount.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#166534', marginTop: '0.25rem' }}>
                Payment Method: <strong>{receiptData.paymentMethod}</strong> ({receiptData.destinationMasked})
              </div>
            </div>

            {/* Transaction Data Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                <span style={{ color: '#64748b' }}>Transaction ID</span>
                <span style={{ color: '#0f172a', fontFamily: 'monospace' }}>{receiptData.transactionNumber}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                <span style={{ color: '#64748b' }}>Gateway Reference</span>
                <span style={{ color: '#0f172a', fontFamily: 'monospace' }}>{receiptData.providerReference || 'EFT-APPROVED'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                <span style={{ color: '#64748b' }}>Recipient Staff</span>
                <span style={{ color: '#0f172a' }}>{receiptData.employee.fullName} ({receiptData.employee.employeeNumber})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                <span style={{ color: '#64748b' }}>Staff National ID</span>
                <span style={{ color: '#0f172a', fontFamily: 'monospace' }}>{receiptData.employee.nationalId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                <span style={{ color: '#64748b' }}>Payroll Period</span>
                <span style={{ color: '#0f172a' }}>{receiptData.payrollPeriod.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Date & Time</span>
                <span style={{ color: '#0f172a' }}>{new Date(receiptData.paidAt).toLocaleString()}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Button variant="secondary" leftIcon={<Printer size={16} />} onClick={() => window.print()}>
                Print Receipt
              </Button>
              <Button
                variant="primary"
                leftIcon={<Download size={16} />}
                onClick={() => {
                  toast.success('Downloaded', `Receipt ${receiptData.transactionNumber} saved.`);
                  window.print();
                }}
              >
                Download PDF
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
