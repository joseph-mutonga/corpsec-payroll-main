'use client';

import React, { useState, useEffect } from 'react';
import {
  LifeBuoy,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Send,
  Eye,
  User,
  Building,
  MapPin,
  Lock,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { HRRequestData, HRRequestStatus } from '@/types';

export default function HRRequestsManagementPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  // Review Drawer / Modal
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Review form states
  const [newStatus, setNewStatus] = useState<HRRequestStatus>('UNDER_REVIEW');
  const [employeeResponse, setEmployeeResponse] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    fetchHRRequests();
  }, [statusFilter, typeFilter, priorityFilter]);

  const fetchHRRequests = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (typeFilter !== 'ALL') params.append('requestType', typeFilter);
      if (priorityFilter !== 'ALL') params.append('priority', priorityFilter);

      const res = await fetch(`/api/hr/requests?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data.items || []);
        setStats(data.data.stats);
      } else {
        toast.error('Error', data.message || 'Failed to load HR requests queue');
      }
    } catch (err) {
      toast.error('Error', 'Unable to connect to HR requests service');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenReview = async (requestId: string) => {
    try {
      const res = await fetch(`/api/hr/requests/${requestId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedRequest(data.data);
        setNewStatus(data.data.status);
        setEmployeeResponse(data.data.employeeVisibleResponse || '');
        setInternalNotes(data.data.internalHrNotes || '');
        setRejectionReason(data.data.rejectionReason || '');
        setIsReviewOpen(true);
      } else {
        toast.error('Error', data.message || 'Failed to load request details');
      }
    } catch (err) {
      toast.error('Error', 'Failed to retrieve ticket detail');
    }
  };

  const handleSaveReview = async (statusOverride?: HRRequestStatus) => {
    if (!selectedRequest) return;
    const targetStatus = statusOverride || newStatus;

    setIsUpdating(true);
    try {
      const res = await fetch(`/api/hr/requests/${selectedRequest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: targetStatus,
          employeeVisibleResponse: employeeResponse,
          internalHrNotes: internalNotes,
          rejectionReason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update request');
      }

      toast.success('Updated', data.message || 'HR request updated successfully');
      setIsReviewOpen(false);
      fetchHRRequests();
    } catch (err: any) {
      toast.error('Error', err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
      case 'RESOLVED':
        return <Badge variant="success">{status}</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">Rejected</Badge>;
      case 'UNDER_REVIEW':
        return <Badge variant="info">Under Review</Badge>;
      case 'CANCELLED':
        return <Badge variant="neutral">Cancelled</Badge>;
      case 'SUBMITTED':
      default:
        return <Badge variant="warning">Submitted</Badge>;
    }
  };

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
            Employee HR Requests Management
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
            Review, approve profile updates, address payroll queries, and resolve staff service tickets.
          </p>
        </div>
      </div>

      {/* 4 Stats Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <Card>
          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>New Submissions</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#d97706', marginTop: '0.25rem' }}>
            {stats?.totalSubmitted || 0}
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Under Review</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0284c7', marginTop: '0.25rem' }}>
            {stats?.totalUnderReview || 0}
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Approved Changes</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#16a34a', marginTop: '0.25rem' }}>
            {stats?.totalApproved || 0}
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Resolved Tickets</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
            {stats?.totalResolved || 0}
          </div>
        </Card>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <Input
            placeholder="Search tickets, employee name, or staff ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchHRRequests()}
            leftIcon={<Search size={16} />}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            fontSize: '0.85rem',
            backgroundColor: '#ffffff',
          }}
        >
          <option value="ALL">All Statuses</option>
          <option value="SUBMITTED">Submitted (New)</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="RESOLVED">Resolved</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            fontSize: '0.85rem',
            backgroundColor: '#ffffff',
          }}
        >
          <option value="ALL">All Types</option>
          <option value="BANK_DETAILS_CHANGE">Bank Details Change</option>
          <option value="MPESA_CHANGE">M-Pesa Change</option>
          <option value="PROFILE_UPDATE">Profile Update</option>
          <option value="PAYROLL_QUERY">Payroll Query</option>
          <option value="PAYSLIP_ISSUE">Payslip Issue</option>
          <option value="ATTENDANCE_CORRECTION">Attendance Correction</option>
          <option value="EMPLOYMENT_LETTER">Employment Letter</option>
        </select>

        <Button variant="secondary" onClick={fetchHRRequests}>
          Apply Filter
        </Button>
      </div>

      {/* Requests Ledger */}
      {isLoading ? (
        <div style={{ padding: '3rem 0', textAlign: 'center' }}>
          <Spinner fullHeight message="Loading HR service queue..." />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
            <LifeBuoy size={40} color="#94a3b8" style={{ marginBottom: '1rem' }} />
            <h3 style={{ fontSize: '1.15rem', color: '#0f172a' }}>No Requests Found in Queue</h3>
            <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
              All staff inquiries and change requests are resolved.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', backgroundColor: '#f8fafc' }}>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Ticket #</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Type</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Subject</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Priority</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Submitted</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700, textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((req: any) => (
                  <tr key={req.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                      {req.requestNumber}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <strong style={{ color: '#0f172a' }}>{req.employee?.fullName}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {req.employee?.employeeNumber} • {req.employee?.jobTitle}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant="neutral" size="sm">
                        {req.requestType.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                      {req.subject}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant={req.priority === 'URGENT' || req.priority === 'HIGH' ? 'danger' : 'neutral'} size="sm">
                        {req.priority}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {getStatusBadge(req.status)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                      {new Date(req.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<Eye size={14} />}
                        onClick={() => handleOpenReview(req.id)}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* HR Review & Decision Modal */}
      <Modal
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        title={selectedRequest ? `Review Ticket #${selectedRequest.requestNumber}` : 'Review Request'}
        size="lg"
      >
        {selectedRequest && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Employee Snapshot */}
            <div style={{ backgroundColor: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>
                  {selectedRequest.employee?.fullName} ({selectedRequest.employee?.employeeNumber})
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  {selectedRequest.employee?.jobTitle} • {selectedRequest.employee?.department?.name} • {selectedRequest.employee?.station?.name}
                </div>
              </div>
              <Badge variant="gold" size="md">{selectedRequest.requestType.replace(/_/g, ' ')}</Badge>
            </div>

            {/* Submission Content */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.85rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
                Subject: {selectedRequest.subject}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                {selectedRequest.description}
              </div>
            </div>

            {/* Proposed Changes Diff (if present) */}
            {selectedRequest.proposedData && (
              <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '0.85rem', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <ShieldCheck size={16} />
                  <span>Proposed Data Changes for Automated Verification:</span>
                </div>
                <pre style={{ margin: 0, padding: '0.5rem', backgroundColor: '#ffffff', borderRadius: '4px', border: '1px solid #e0f2fe', fontSize: '0.8rem', overflowX: 'auto' }}>
                  {JSON.stringify(JSON.parse(selectedRequest.proposedData), null, 2)}
                </pre>
              </div>
            )}

            {/* Decision Status Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
                Action Status Decision
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as HRRequestStatus)}
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.85rem',
                }}
              >
                <option value="UNDER_REVIEW">UNDER REVIEW (Mark as actively being investigated)</option>
                <option value="APPROVED">APPROVED (Authorize & automatically apply proposed profile changes)</option>
                <option value="RESOLVED">RESOLVED (Complete ticket with written response)</option>
                <option value="REJECTED">REJECTED (Decline requested change)</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>

            {/* Employee Visible Response */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
                Employee-Visible Response & Instructions
              </label>
              <textarea
                rows={3}
                value={employeeResponse}
                onChange={(e) => setEmployeeResponse(e.target.value)}
                placeholder="Message that the employee will see in their portal timeline..."
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Confidential Internal Notes */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#b91c1c', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Lock size={14} />
                <span>Confidential Internal HR Notes (NEVER visible to employee)</span>
              </label>
              <textarea
                rows={2}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Internal verification notes, bank clearance IDs, or supervisor consultation..."
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: '6px',
                  border: '1px solid #fecaca',
                  backgroundColor: '#fff5f5',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" onClick={() => setIsReviewOpen(false)} type="button">
                Cancel
              </Button>
              {selectedRequest.proposedData && (
                <Button
                  variant="primary"
                  isLoading={isUpdating}
                  onClick={() => handleSaveReview('APPROVED')}
                  style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
                >
                  Approve & Apply
                </Button>
              )}
              <Button
                variant="primary"
                isLoading={isUpdating}
                onClick={() => handleSaveReview()}
              >
                Save Decision
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
