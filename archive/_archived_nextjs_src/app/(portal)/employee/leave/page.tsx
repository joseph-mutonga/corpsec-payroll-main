'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import {
  CalendarDays,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

export default function EmployeeLeavePortalPage() {
  const { success, error: toastError } = useToast();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  useEffect(() => {
    fetchPortalData();
  }, []);

  const fetchPortalData = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/portal/leave');
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) {
      toastError('Failed to load your leave dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdraw = async (requestId: string) => {
    if (!confirm('Are you sure you want to withdraw this leave application?')) return;
    try {
      setIsWithdrawing(true);
      const res = await fetch(`/api/leave/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'WITHDRAW', reason: 'Withdrawn by employee' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      success('Leave application withdrawn successfully.');
      setSelectedRequest(null);
      fetchPortalData();
    } catch (err: any) {
      toastError(err.message || 'Failed to withdraw application.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
      case 'ACTIVE':
      case 'COMPLETED':
        return <Badge variant="success">{status}</Badge>;
      case 'SUBMITTED':
      case 'MANAGER_REVIEW':
      case 'HR_REVIEW':
        return <Badge variant="warning">{status.replace('_', ' ')}</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">REJECTED</Badge>;
      case 'CANCELLED':
      case 'WITHDRAWN':
        return <Badge variant="neutral">{status}</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  if (isLoading || !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  const { balances, myRequests, upcomingLeaves } = data;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <Breadcrumb
            items={[
              { label: 'Employee Self-Service', href: '/employee' },
              { label: 'My Leave & Time-Off' },
            ]}
          />
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
            My Leave &amp; Time-Off
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
            View your personal leave entitlement matrix, available balance days, apply for time-off, and track approvals
          </p>
        </div>

        <Link href="/employee/leave/request">
          <Button variant="primary">
            <Plus size={16} style={{ marginRight: '0.5rem' }} /> Apply for Leave
          </Button>
        </Link>
      </div>

      {/* Leave Balance Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        {balances.map((b: any) => (
          <Card key={b.leaveTypeId} style={{ borderTop: `4px solid ${b.color || '#2563eb'}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>{b.leaveTypeName}</span>
                <Badge variant={b.isPaid ? 'success' : 'neutral'} size="sm">
                  {b.isPaid ? 'Paid' : 'Unpaid'}
                </Badge>
              </div>

              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>
                {b.availableBalance} <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#64748b' }}>Days Available</span>
              </div>

              <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                <span>Entitlement: <strong>{b.entitledDays}d</strong></span>
                <span>Used: <strong>{b.usedDays}d</strong></span>
                <span>Pending: <strong>{b.pendingDays}d</strong></span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Upcoming Approved Leaves Banner (if any) */}
      {upcomingLeaves.length > 0 && (
        <Card style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <CheckCircle2 size={24} color="#10b981" />
            <div>
              <div style={{ fontWeight: 700, color: '#065f46' }}>You have upcoming approved leave!</div>
              <div style={{ fontSize: '0.8125rem', color: '#047857', marginTop: '0.15rem' }}>
                {upcomingLeaves.map((l: any) => (
                  <span key={l.id}>
                    {l.leaveType.name} ({l.durationDays} days): {new Date(l.startDate).toLocaleDateString()} &ndash; {new Date(l.endDate).toLocaleDateString()}{' '}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* My Applications History Table */}
      <Card title="My Leave Applications History" subtitle="Chronological history of all your submitted leave requests">
        {myRequests.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            You have not submitted any leave applications yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Request #</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Leave Category</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Dates</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Days</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {myRequests.map((r: any) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>
                      {r.requestNumber}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                      {r.leaveType.name}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {new Date(r.startDate).toLocaleDateString()} to {new Date(r.endDate).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700 }}>
                      {r.durationDays}d
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      {getStatusBadge(r.status)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <Button variant="outline" size="sm" onClick={() => setSelectedRequest(r)}>
                          Details
                        </Button>
                        {['SUBMITTED', 'MANAGER_REVIEW', 'HR_REVIEW'].includes(r.status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleWithdraw(r.id)}
                            disabled={isWithdrawing}
                            style={{ borderColor: '#ef4444', color: '#ef4444' }}
                          >
                            Withdraw
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Details Modal */}
      {selectedRequest && (
        <Modal
          isOpen={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
          title={`Leave Request Details — ${selectedRequest.requestNumber}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Category</span>
                <strong>{selectedRequest.leaveType.name}</strong> ({selectedRequest.leaveType.isPaid ? 'Paid' : 'Unpaid'})
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Status</span>
                {getStatusBadge(selectedRequest.status)}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Duration</span>
              <strong>
                {new Date(selectedRequest.startDate).toLocaleDateString()} &ndash; {new Date(selectedRequest.endDate).toLocaleDateString()} ({selectedRequest.durationDays} Working Days)
              </strong>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Reason for Application</span>
              <div style={{ padding: '0.75rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.375rem', marginTop: '0.25rem' }}>
                {selectedRequest.reason}
              </div>
            </div>

            {selectedRequest.reviewerComments && (
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Approver Comments</span>
                <div style={{ padding: '0.75rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.375rem', marginTop: '0.25rem' }}>
                  {selectedRequest.reviewerComments}
                </div>
              </div>
            )}

            {selectedRequest.rejectionReason && (
              <div>
                <span style={{ fontSize: '0.75rem', color: '#ef4444', display: 'block', fontWeight: 600 }}>Rejection Reason</span>
                <div style={{ padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.375rem', marginTop: '0.25rem', color: '#b91c1c' }}>
                  {selectedRequest.rejectionReason}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <Button variant="primary" onClick={() => setSelectedRequest(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
