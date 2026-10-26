'use client';

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Plus,
  Send,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  Filter,
  UserCheck,
  ShieldCheck,
  FileText,
  FileCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { HRRequestData, HRRequestType, HRRequestPriority } from '@/types';

export default function EmployeeRequestsPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<HRRequestData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  // Create Request Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestType, setRequestType] = useState<HRRequestType>('PAYROLL_QUERY');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<HRRequestPriority>('MEDIUM');

  // Detail Modal
  const [selectedRequest, setSelectedRequest] = useState<HRRequestData | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/portal/requests');
      const data = await res.json();
      if (data.success) {
        setRequests(data.data || []);
      } else {
        toast.error('Error', data.message || 'Failed to load requests');
      }
    } catch (err) {
      toast.error('Error', 'Unable to connect to HR request desk');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      toast.error('Required', 'Please fill in all required fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/portal/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType,
          subject,
          description,
          priority,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit request');
      }

      toast.success('Created', data.message || 'HR service desk ticket created successfully');
      setIsCreateOpen(false);
      setSubject('');
      setDescription('');
      fetchRequests();
    } catch (err: any) {
      toast.error('Error', err.message);
    } finally {
      setIsSubmitting(false);
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

  const filteredRequests = requests.filter((r) => {
    const matchesSearch =
      r.requestNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'ALL' || r.requestType === filterType;
    return matchesSearch && matchesType;
  });

  if (isLoading) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <Spinner fullHeight message="Loading your HR service desk tickets..." />
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: '3rem' }}>
      {/* Header & Controls */}
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
            HR Service Desk & Support Requests
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
            Submit and track inquiries, payroll questions, profile updates, and official requests.
          </p>
        </div>

        <Button
          variant="primary"
          leftIcon={<Plus size={16} />}
          onClick={() => setIsCreateOpen(true)}
        >
          Submit New Request
        </Button>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <Input
            placeholder="Search tickets by ID, subject, or keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search size={16} />}
          />
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{
            padding: '0.5rem 0.85rem',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            fontSize: '0.85rem',
            backgroundColor: '#ffffff',
          }}
        >
          <option value="ALL">All Request Types</option>
          <option value="PAYROLL_QUERY">Payroll Query</option>
          <option value="PAYSLIP_ISSUE">Payslip Issue</option>
          <option value="PROFILE_UPDATE">Profile Update</option>
          <option value="BANK_DETAILS_CHANGE">Bank Details Change</option>
          <option value="MPESA_CHANGE">M-Pesa Change</option>
          <option value="ATTENDANCE_CORRECTION">Attendance Correction</option>
          <option value="LEAVE_REQUEST">Leave Request</option>
          <option value="EMPLOYMENT_LETTER">Employment Letter</option>
          <option value="GENERAL_HR_QUERY">General HR Query</option>
        </select>
      </div>

      {/* Requests Ledger Table */}
      {filteredRequests.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
            <MessageSquare size={40} color="#94a3b8" style={{ marginBottom: '1rem' }} />
            <h3 style={{ fontSize: '1.15rem', color: '#0f172a' }}>No Requests Found</h3>
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              You do not have any open tickets in this category. Click &quot;Submit New Request&quot; to open a ticket.
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
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Type</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Subject</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Priority</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Submitted Date</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700, textAlign: 'center' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((req) => (
                  <tr key={req.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                      {req.requestNumber}
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
                        onClick={() => setSelectedRequest(req)}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* New HR Request Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Submit New HR Service Desk Request"
        size="md"
      >
        <form onSubmit={handleCreateRequest} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
              Request Category <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as HRRequestType)}
              required
              style={{
                width: '100%',
                padding: '0.65rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            >
              <option value="PAYROLL_QUERY">Payroll Calculation Query</option>
              <option value="PAYSLIP_ISSUE">Payslip Discrepancy / Question</option>
              <option value="PROFILE_UPDATE">General Profile Information Update</option>
              <option value="BANK_DETAILS_CHANGE">Bank Account Change Request</option>
              <option value="MPESA_CHANGE">M-Pesa Number Change Request</option>
              <option value="ATTENDANCE_CORRECTION">Duty Attendance / Shift Issue</option>
              <option value="EMPLOYMENT_LETTER">Official Employment Letter Request</option>
              <option value="GENERAL_HR_QUERY">Other General HR Inquiries</option>
            </select>
          </div>

          <Input
            label="Subject / Topic *"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief summary of your question or request..."
            required
          />

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
              Priority Level
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as HRRequestPriority)}
              style={{
                width: '100%',
                padding: '0.65rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            >
              <option value="LOW">Low - General inquiry</option>
              <option value="MEDIUM">Medium - Standard processing</option>
              <option value="HIGH">High - Urgent issue before payroll cutoff</option>
              <option value="URGENT">Urgent - Critical discrepancy</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
              Detailed Description & Context <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide complete details, dates, station names, or transaction numbers..."
              required
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting} leftIcon={<Send size={16} />}>
              Submit Ticket
            </Button>
          </div>
        </form>
      </Modal>

      {/* Request Detail & Timeline Modal */}
      <Modal
        isOpen={!!selectedRequest}
        onClose={() => setSelectedRequest(null)}
        title={selectedRequest ? `Request #${selectedRequest.requestNumber}` : 'Request Detail'}
        size="md"
      >
        {selectedRequest && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Header / Status Banner */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Category:</span>{' '}
                <strong>{selectedRequest.requestType.replace(/_/g, ' ')}</strong>
              </div>
              <div>{getStatusBadge(selectedRequest.status)}</div>
            </div>

            <div>
              <h4 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>{selectedRequest.subject}</h4>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                Submitted: {new Date(selectedRequest.createdAt).toLocaleString()}
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.85rem', fontSize: '0.85rem', color: '#334155' }}>
              <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '0.35rem' }}>Your Submission:</div>
              {selectedRequest.description}
            </div>

            {/* Official HR Response (if any) */}
            {selectedRequest.employeeVisibleResponse ? (
              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '0.85rem', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: 700, color: '#166534', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <CheckCircle2 size={16} />
                  <span>Official HR Response:</span>
                </div>
                <div style={{ color: '#14532d' }}>{selectedRequest.employeeVisibleResponse}</div>
                {selectedRequest.resolvedAt && (
                  <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '0.4rem' }}>
                    Resolved on {new Date(selectedRequest.resolvedAt).toLocaleString()}
                  </div>
                )}
              </div>
            ) : selectedRequest.status === 'UNDER_REVIEW' ? (
              <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '0.85rem', fontSize: '0.85rem', color: '#0369a1' }}>
                <Clock size={16} style={{ display: 'inline', marginRight: '0.4rem' }} />
                Your ticket has been assigned to an HR Officer and is currently under review.
              </div>
            ) : (
              <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '0.85rem', fontSize: '0.85rem', color: '#92400e' }}>
                <Clock size={16} style={{ display: 'inline', marginRight: '0.4rem' }} />
                Your request is queued for review by the HR Operations team.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setSelectedRequest(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
