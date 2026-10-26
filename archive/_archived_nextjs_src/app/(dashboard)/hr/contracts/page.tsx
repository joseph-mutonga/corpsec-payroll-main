'use client';

import React, { useState, useEffect } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import {
  FileSignature,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Clock,
  Building2,
  MapPin,
} from 'lucide-react';

export default function ContractsManagementPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<any[]>([]);
  const [thresholdDays, setThresholdDays] = useState('90');
  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [renewForm, setRenewForm] = useState({
    newStartDate: '',
    newEndDate: '',
    reason: 'Fixed-term contract renewal for 12 months',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchContracts();
  }, [thresholdDays]);

  const fetchContracts = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/hr/contracts?days=${thresholdDays}`);
      const json = await res.json();
      if (json.success) {
        setContracts(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching contracts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRenew = (c: any) => {
    const today = new Date().toISOString().split('T')[0];
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setSelectedContract(c);
    setRenewForm({
      newStartDate: c.contractEndDate || today,
      newEndDate: nextYear,
      reason: '1-Year Fixed-Term Contract Renewal upon satisfactory performance review',
    });
    setIsRenewOpen(true);
  };

  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewForm.newStartDate || !renewForm.newEndDate) {
      showToast({ type: 'error', title: 'Please specify valid start and end dates' });
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch('/api/hr/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedContract.id,
          newStartDate: renewForm.newStartDate,
          newEndDate: renewForm.newEndDate,
          reason: renewForm.reason,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast({ type: 'success', title: 'Contract successfully renewed' });
        setIsRenewOpen(false);
        fetchContracts();
      } else {
        showToast({ type: 'error', title: json.error || 'Failed to renew contract' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Network error during contract renewal' });
    } finally {
      setSubmitting(false);
    }
  };

  const getAlertBadge = (category: string, daysRemaining: number) => {
    if (daysRemaining <= 0) return <Badge variant="danger">Expired</Badge>;
    if (daysRemaining <= 7) return <Badge variant="danger">7 Days Left (Critical)</Badge>;
    if (daysRemaining <= 14) return <Badge variant="danger">14 Days Left (Urgent)</Badge>;
    if (daysRemaining <= 30) return <Badge variant="warning">30 Days Left</Badge>;
    if (daysRemaining <= 60) return <Badge variant="gold">60 Days Left</Badge>;
    return <Badge variant="neutral">{daysRemaining} Days Left</Badge>;
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Breadcrumb items={[{ label: 'Human Resources', href: '/hr' }, { label: 'Contracts & Renewals' }]} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileSignature size={28} color="#0f1c3f" />
            Fixed-Term Contracts & Expiry Alerts
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
            Automated contract expiry alerts (90d, 60d, 30d, 14d, 7d) and renewal workflow.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>Lookahead Window:</span>
          {['30', '60', '90', '180', '365'].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={thresholdDays === d ? 'primary' : 'outline'}
              onClick={() => setThresholdDays(d)}
            >
              {d} Days
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card noPadding>
        {loading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" />
          </div>
        ) : contracts.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No contracts expiring within the next {thresholdDays} days.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Employee</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Type</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Department & Station</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Start Date</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>End Date</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Expiry Status</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ fontWeight: 700, color: '#0f1c3f' }}>{c.fullName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.employeeNumber} • {c.jobTitle}</div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <Badge variant="neutral" size="sm">{c.employmentType}</Badge>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem' }}>
                      <div>{c.department}</div>
                      <div style={{ color: '#64748b' }}>{c.station}</div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', color: '#475569' }}>
                      {c.contractStartDate || 'N/A'}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontWeight: 700, color: c.daysRemaining <= 14 ? '#dc2626' : '#0f1c3f' }}>
                      {c.contractEndDate}
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      {getAlertBadge(c.alertCategory, c.daysRemaining)}
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <Button size="sm" variant="primary" onClick={() => handleOpenRenew(c)} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <RefreshCw size={14} /> Renew Contract
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Renew Contract Modal */}
      {selectedContract && (
        <Modal
          isOpen={isRenewOpen}
          onClose={() => setIsRenewOpen(false)}
          title={`Renew Contract — ${selectedContract.fullName}`}
        >
          <form onSubmit={handleRenewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, color: '#0f1c3f' }}>{selectedContract.fullName} ({selectedContract.employeeNumber})</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Current Contract End Date: {selectedContract.contractEndDate}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Input
                label="New Start Date *"
                type="date"
                required
                value={renewForm.newStartDate}
                onChange={(e) => setRenewForm({ ...renewForm, newStartDate: e.target.value })}
              />
              <Input
                label="New End Date *"
                type="date"
                required
                value={renewForm.newEndDate}
                onChange={(e) => setRenewForm({ ...renewForm, newEndDate: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Renewal Reason & Justification *
              </label>
              <textarea
                required
                rows={3}
                value={renewForm.reason}
                onChange={(e) => setRenewForm({ ...renewForm, reason: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button variant="outline" type="button" onClick={() => setIsRenewOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={submitting}>
                {submitting ? 'Renewing...' : 'Confirm Contract Renewal'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
