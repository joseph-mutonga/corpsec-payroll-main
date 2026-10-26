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
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Calendar,
  UserCheck,
  UserX,
  History,
} from 'lucide-react';

export default function ProbationManagementPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [probations, setProbations] = useState<any[]>([]);
  const [selectedProbation, setSelectedProbation] = useState<any>(null);
  const [isDecisionOpen, setIsDecisionOpen] = useState(false);
  const [decisionForm, setDecisionForm] = useState({
    outcome: 'CONFIRM' as 'CONFIRM' | 'EXTEND' | 'FAIL',
    newEndDate: '',
    reason: 'Satisfactory performance and exemplary attendance during 3-month probation period.',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchProbations();
  }, []);

  const fetchProbations = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/hr/probation');
      const json = await res.json();
      if (json.success) {
        setProbations(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching probation list:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDecision = (p: any) => {
    setSelectedProbation(p);
    const nextQuarter = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setDecisionForm({
      outcome: 'CONFIRM',
      newEndDate: nextQuarter,
      reason: 'Satisfactory performance, punctuality, and station commander recommendation.',
    });
    setIsDecisionOpen(true);
  };

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await fetch('/api/hr/probation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedProbation.id,
          outcome: decisionForm.outcome,
          newEndDate: decisionForm.outcome === 'EXTEND' ? decisionForm.newEndDate : undefined,
          reason: decisionForm.reason,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast({ type: 'success', title: `Probation outcome recorded (${decisionForm.outcome})` });
        setIsDecisionOpen(false);
        fetchProbations();
      } else {
        showToast({ type: 'error', title: json.error || 'Failed to record probation outcome' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Network error recording probation outcome' });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string, daysRemaining: number) => {
    if (status === 'CONFIRMED') return <Badge variant="success">Confirmed Permanent</Badge>;
    if (status === 'EXTENDED') return <Badge variant="warning">Probation Extended</Badge>;
    if (status === 'FAILED') return <Badge variant="danger">Probation Failed</Badge>;

    if (daysRemaining <= 0) return <Badge variant="danger">Probation Overdue ({Math.abs(daysRemaining)}d ago)</Badge>;
    if (daysRemaining <= 14) return <Badge variant="warning">Due Soon ({daysRemaining} days)</Badge>;
    return <Badge variant="neutral">{daysRemaining} Days Remaining</Badge>;
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Breadcrumb items={[{ label: 'Human Resources', href: '/hr' }, { label: 'Probation Pipeline' }]} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={28} color="#0f1c3f" />
            Probation Pipeline & Outcome Reviews
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
            Monitor new hires on probation, evaluate performance, and execute confirmation / extension decisions.
          </p>
        </div>
      </div>

      {/* Table */}
      <Card noPadding>
        {loading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" />
          </div>
        ) : probations.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No staff currently on probation.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Employee</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Department & Station</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Supervisor</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Probation Period</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Status / Countdown</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Decision</th>
                </tr>
              </thead>
              <tbody>
                {probations.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ fontWeight: 700, color: '#0f1c3f' }}>{p.fullName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{p.employeeNumber} • {p.jobTitle}</div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem' }}>
                      <div>{p.department}</div>
                      <div style={{ color: '#64748b' }}>{p.station}</div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: '#475569' }}>
                      {p.supervisor}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: '#475569' }}>
                      <div>Start: {p.probationStartDate || 'N/A'}</div>
                      <div style={{ fontWeight: 600, color: '#0f1c3f' }}>End: {p.probationEndDate || 'N/A'}</div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      {getStatusBadge(p.probationStatus, p.daysRemaining)}
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <Button size="sm" variant="primary" onClick={() => handleOpenDecision(p)}>
                        Record Outcome
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Record Outcome Modal */}
      {selectedProbation && (
        <Modal
          isOpen={isDecisionOpen}
          onClose={() => setIsDecisionOpen(false)}
          title={`Probation Outcome Review — ${selectedProbation.fullName}`}
        >
          <form onSubmit={handleDecisionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, color: '#0f1c3f' }}>{selectedProbation.fullName} ({selectedProbation.employeeNumber})</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Probation End Date: {selectedProbation.probationEndDate}</div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Outcome Decision *
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setDecisionForm({ ...decisionForm, outcome: 'CONFIRM' })}
                  style={{
                    padding: '0.75rem',
                    borderRadius: '6px',
                    border: `2px solid ${decisionForm.outcome === 'CONFIRM' ? '#16a34a' : '#e2e8f0'}`,
                    backgroundColor: decisionForm.outcome === 'CONFIRM' ? '#f0fdf4' : '#ffffff',
                    color: decisionForm.outcome === 'CONFIRM' ? '#166534' : '#475569',
                    fontWeight: 700,
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <UserCheck size={18} /> Confirm Permanent
                </button>

                <button
                  type="button"
                  onClick={() => setDecisionForm({ ...decisionForm, outcome: 'EXTEND' })}
                  style={{
                    padding: '0.75rem',
                    borderRadius: '6px',
                    border: `2px solid ${decisionForm.outcome === 'EXTEND' ? '#d97706' : '#e2e8f0'}`,
                    backgroundColor: decisionForm.outcome === 'EXTEND' ? '#fffbeb' : '#ffffff',
                    color: decisionForm.outcome === 'EXTEND' ? '#b45309' : '#475569',
                    fontWeight: 700,
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Clock size={18} /> Extend Probation
                </button>

                <button
                  type="button"
                  onClick={() => setDecisionForm({ ...decisionForm, outcome: 'FAIL' })}
                  style={{
                    padding: '0.75rem',
                    borderRadius: '6px',
                    border: `2px solid ${decisionForm.outcome === 'FAIL' ? '#dc2626' : '#e2e8f0'}`,
                    backgroundColor: decisionForm.outcome === 'FAIL' ? '#fef2f2' : '#ffffff',
                    color: decisionForm.outcome === 'FAIL' ? '#991b1b' : '#475569',
                    fontWeight: 700,
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <UserX size={18} /> Fail & Terminate
                </button>
              </div>
            </div>

            {decisionForm.outcome === 'EXTEND' && (
              <Input
                label="New Extended Probation End Date *"
                type="date"
                required
                value={decisionForm.newEndDate}
                onChange={(e) => setDecisionForm({ ...decisionForm, newEndDate: e.target.value })}
              />
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                HR Review Justification & Notes *
              </label>
              <textarea
                required
                rows={3}
                value={decisionForm.reason}
                onChange={(e) => setDecisionForm({ ...decisionForm, reason: e.target.value })}
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
              <Button variant="outline" type="button" onClick={() => setIsDecisionOpen(false)}>
                Cancel
              </Button>
              <Button
                variant={decisionForm.outcome === 'FAIL' ? 'danger' : 'primary'}
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'Saving...' : 'Confirm Decision'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
