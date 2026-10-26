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
import { CheckCircle2, XCircle, Clock, ShieldCheck, UserCheck, AlertTriangle } from 'lucide-react';

export default function LeaveApprovalsPage() {
  const { success, error: toastError } = useToast();
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeRequest, setActiveRequest] = useState<any | null>(null);
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [comments, setComments] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  const fetchPendingRequests = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/leave/requests?status=MANAGER_REVIEW');
      const resHr = await fetch('/api/leave/requests?status=HR_REVIEW');
      const resSub = await fetch('/api/leave/requests?status=SUBMITTED');

      const [j1, j2, j3] = await Promise.all([res.json(), resHr.json(), resSub.json()]);
      const list = [
        ...(j1.data?.requests || []),
        ...(j2.data?.requests || []),
        ...(j3.data?.requests || []),
      ];

      // Deduplicate by ID
      const unique = Array.from(new Map(list.map((item) => [item.id, item])).values());
      setPendingRequests(unique);
    } catch (err) {
      toastError('Failed to fetch pending approval requests');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenActionModal = (request: any, type: 'APPROVE' | 'REJECT') => {
    setActiveRequest(request);
    setActionType(type);
    setComments('');
  };

  const handleConfirmDecision = async () => {
    if (!activeRequest || !actionType) return;
    if (actionType === 'REJECT' && (!comments || comments.trim().length < 3)) {
      toastError('A detailed rejection reason is required.');
      return;
    }

    try {
      setIsProcessing(true);
      const url =
        actionType === 'APPROVE'
          ? `/api/leave/requests/${activeRequest.id}/approve`
          : `/api/leave/requests/${activeRequest.id}/reject`;

      const payload =
        actionType === 'APPROVE'
          ? { comments, level: activeRequest.status === 'HR_REVIEW' ? 'HR' : 'MANAGER' }
          : { reason: comments };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      success(`Leave request ${actionType === 'APPROVE' ? 'approved' : 'rejected'} successfully.`);
      setActiveRequest(null);
      setActionType(null);
      fetchPendingRequests();
    } catch (err: any) {
      toastError(err.message || 'Action failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <Breadcrumb
          items={[
            { label: 'Leave Management', href: '/leave' },
            { label: 'Leave Approvals Desk' },
          ]}
        />
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
          Manager &amp; HR Approvals Desk
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
          Review pending leave applications, inspect balance commitments, authorize requests, or provide rejection feedback
        </p>
      </div>

      {/* Desk Content */}
      <Card>
        {isLoading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" />
          </div>
        ) : pendingRequests.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>
            <ShieldCheck size={48} color="#10b981" style={{ margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' }}>All Clear!</h3>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.25rem' }}>
              There are currently no leave requests awaiting manager or HR review.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {pendingRequests.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1.25rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>
                      {r.requestNumber}
                    </span>
                    <Badge variant={r.status === 'HR_REVIEW' ? 'info' : 'warning'} size="sm">
                      {r.status.replace('_', ' ')}
                    </Badge>
                    <Badge variant="neutral" size="sm">
                      {r.leaveType.name}
                    </Badge>
                  </div>

                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginTop: '0.25rem' }}>
                    {r.employee.fullName}
                    <span style={{ fontSize: '0.8125rem', fontWeight: 400, color: '#64748b', marginLeft: '0.5rem' }}>
                      ({r.employee.employeeNumber} &bull; {r.employee.department?.name || 'General'})
                    </span>
                  </div>

                  <div style={{ fontSize: '0.8125rem', color: '#475569', marginTop: '0.25rem' }}>
                    <strong>Dates:</strong> {new Date(r.startDate).toLocaleDateString()} to {new Date(r.endDate).toLocaleDateString()} &bull;{' '}
                    <strong>Duration:</strong> {r.durationDays} working day(s)
                  </div>

                  <div style={{ fontSize: '0.8125rem', color: '#64748b', fontStyle: 'italic', marginTop: '0.25rem' }}>
                    &ldquo;{r.reason}&rdquo;
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenActionModal(r, 'REJECT')}
                    style={{ borderColor: '#ef4444', color: '#ef4444' }}
                  >
                    <XCircle size={16} style={{ marginRight: '0.375rem' }} /> Reject
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleOpenActionModal(r, 'APPROVE')}
                    style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                  >
                    <CheckCircle2 size={16} style={{ marginRight: '0.375rem' }} /> Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Decision Action Modal */}
      {activeRequest && actionType && (
        <Modal
          isOpen={!!activeRequest}
          onClose={() => {
            setActiveRequest(null);
            setActionType(null);
          }}
          title={
            actionType === 'APPROVE'
              ? `Authorize Leave Request — ${activeRequest.requestNumber}`
              : `Reject Leave Request — ${activeRequest.requestNumber}`
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
            <div style={{ padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }}>
              <div><strong>Applicant:</strong> {activeRequest.employee.fullName} ({activeRequest.employee.employeeNumber})</div>
              <div><strong>Leave Category:</strong> {activeRequest.leaveType.name} ({activeRequest.durationDays} Working Days)</div>
              <div><strong>Dates:</strong> {new Date(activeRequest.startDate).toLocaleDateString()} &ndash; {new Date(activeRequest.endDate).toLocaleDateString()}</div>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                {actionType === 'APPROVE' ? 'Approval Comments (Optional)' : 'Rejection Reason (Mandatory)'}
              </label>
              <textarea
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '0.625rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
                placeholder={
                  actionType === 'APPROVE'
                    ? 'Optional notes regarding shift handovers or coverage...'
                    : 'Provide detailed justification for rejecting this leave application...'
                }
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                required={actionType === 'REJECT'}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setActiveRequest(null);
                  setActionType(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant={actionType === 'APPROVE' ? 'primary' : 'danger'}
                type="button"
                onClick={handleConfirmDecision}
                disabled={isProcessing}
                style={actionType === 'APPROVE' ? { backgroundColor: '#10b981', borderColor: '#10b981' } : {}}
              >
                {isProcessing ? 'Processing...' : actionType === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
