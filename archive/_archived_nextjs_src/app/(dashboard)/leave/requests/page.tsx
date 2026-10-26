'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { Search, Filter, Plus, FileText, CheckCircle2, XCircle, Clock, Calendar, ArrowUpRight } from 'lucide-react';

export default function LeaveRequestsPage() {
  const { success, error: toastError } = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);

  useEffect(() => {
    fetchRequests();
    fetchLeaveTypes();
  }, [statusFilter, leaveTypeFilter]);

  const fetchRequests = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (leaveTypeFilter !== 'ALL') params.append('leaveTypeId', leaveTypeFilter);
      if (searchQuery) params.append('search', searchQuery);

      const res = await fetch(`/api/leave/requests?${params.toString()}`);
      const json = await res.json();
      if (json.success) setRequests(json.data?.requests || json.data || json.requests || []);
    } catch (err) {
      toastError('Failed to load leave requests');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLeaveTypes = async () => {
    try {
      const res = await fetch('/api/leave/types');
      const json = await res.json();
      if (json.success) setLeaveTypes(json.data?.leaveTypes || json.data || json.leaveTypes || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRequests();
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

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <Breadcrumb
            items={[
              { label: 'Leave Management', href: '/leave' },
              { label: 'All Leave Requests' },
            ]}
          />
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
            Leave Applications Directory
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
            Comprehensive directory of all employee leave applications, approval tracking, attachments, and status logs
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/leave/approvals">
            <Button variant="outline">
              <CheckCircle2 size={16} style={{ marginRight: '0.5rem' }} /> Pending Approvals
            </Button>
          </Link>
          <Link href="/employee/leave/request">
            <Button variant="primary">
              <Plus size={16} style={{ marginRight: '0.5rem' }} /> Apply for Leave
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <Card>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <Input
              label="Search Employee or Request #"
              placeholder="Search by name, employee #, reference..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ width: '200px' }}>
            <Select
              label="Status Filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'All Statuses' },
                { value: 'SUBMITTED', label: 'Submitted (Initial)' },
                { value: 'MANAGER_REVIEW', label: 'Manager Review' },
                { value: 'HR_REVIEW', label: 'HR Review' },
                { value: 'APPROVED', label: 'Approved' },
                { value: 'REJECTED', label: 'Rejected' },
                { value: 'CANCELLED', label: 'Cancelled' },
                { value: 'WITHDRAWN', label: 'Withdrawn' },
              ]}
            />
          </div>

          <div style={{ width: '200px' }}>
            <Select
              label="Leave Type"
              value={leaveTypeFilter}
              onChange={(e) => setLeaveTypeFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'All Leave Types' },
                ...leaveTypes.map((lt) => ({ value: lt.id, label: lt.name })),
              ]}
            />
          </div>

          <Button variant="outline" type="submit">
            <Search size={16} style={{ marginRight: '0.5rem' }} /> Filter
          </Button>
        </form>
      </Card>

      {/* Requests Table */}
      <Card>
        {isLoading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" />
          </div>
        ) : requests.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No leave requests matched the selected filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Request #</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Leave Type</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Dates Requested</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Working Days</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Approval Step</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>
                      {r.requestNumber}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.employee.fullName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {r.employee.employeeNumber} &bull; {r.employee.department?.name || 'General'}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant="neutral" size="sm">
                        {r.leaveType.name}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>
                        {new Date(r.startDate).toLocaleDateString()} &ndash; {new Date(r.endDate).toLocaleDateString()}
                      </div>
                      {r.isHalfDay && (
                        <div style={{ fontSize: '0.75rem', color: '#f59e0b' }}>Half-Day ({r.halfDaySession})</div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>
                      {r.durationDays}d
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {r.approvalStep ? r.approvalStep.replace('_', ' ') : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      {getStatusBadge(r.status)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <Button variant="outline" size="sm" onClick={() => setSelectedRequest(r)}>
                        View Details
                      </Button>
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
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Applicant</span>
                <strong>{selectedRequest.employee.fullName}</strong> ({selectedRequest.employee.employeeNumber})
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Department &amp; Station</span>
                {selectedRequest.employee.department?.name || 'General'} &bull; {selectedRequest.employee.station?.name || 'HQ'}
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Leave Category</span>
                <strong>{selectedRequest.leaveType.name}</strong> ({selectedRequest.leaveType.isPaid ? 'Paid' : 'Unpaid'})
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Status &amp; Workflow Step</span>
                {getStatusBadge(selectedRequest.status)} ({selectedRequest.approvalStep || 'N/A'})
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Date Range &amp; Working Days</span>
              <div style={{ fontWeight: 600, color: '#0f172a', marginTop: '0.25rem' }}>
                {new Date(selectedRequest.startDate).toLocaleDateString()} to {new Date(selectedRequest.endDate).toLocaleDateString()} ({selectedRequest.durationDays} Working Day(s))
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Reason for Application</span>
              <div style={{ padding: '0.75rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.375rem', marginTop: '0.25rem' }}>
                {selectedRequest.reason}
              </div>
            </div>

            {selectedRequest.reliever && (
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Designated Reliever</span>
                <strong>{selectedRequest.reliever.fullName}</strong>
              </div>
            )}

            {selectedRequest.reviewerComments && (
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Reviewer Comments</span>
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

            {selectedRequest.cancellationReason && (
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Cancellation Reason</span>
                <div style={{ padding: '0.75rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.375rem', marginTop: '0.25rem' }}>
                  {selectedRequest.cancellationReason}
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
