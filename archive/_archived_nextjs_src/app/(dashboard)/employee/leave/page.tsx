'use client';

import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  Plus,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Calendar,
  User,
  Phone,
  MapPin,
  FileText,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';

export default function EmployeeLeavePage() {
  const { toast } = useToast();
  const [entitlements, setEntitlements] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Application Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedLeaveTypeId, setSelectedLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactAddress, setContactAddress] = useState('');

  useEffect(() => {
    fetchLeaveData();
  }, []);

  const fetchLeaveData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/portal/leave');
      const data = await res.json();
      if (data.success) {
        setEntitlements(data.data.entitlements || []);
        setRequests(data.data.requests || []);
        setLeaveTypes(data.data.leaveTypes || []);
        if (data.data.leaveTypes?.length > 0) {
          setSelectedLeaveTypeId(data.data.leaveTypes[0].id);
        }
      } else {
        toast.error('Error', data.message || 'Failed to load leave records');
      }
    } catch (err) {
      toast.error('Error', 'Unable to connect to leave service');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeaveTypeId || !startDate || !endDate) {
      toast.error('Required', 'Please select leave type, start date, and end date.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/portal/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaveTypeId: selectedLeaveTypeId,
          startDate,
          endDate,
          isHalfDay,
          reason,
          contactPhone,
          contactAddress,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit leave application');
      }

      toast.success('Submitted', data.message || 'Leave application submitted for supervisor approval');
      setIsModalOpen(false);
      // Reset form
      setStartDate('');
      setEndDate('');
      setReason('');
      fetchLeaveData();
    } catch (err: any) {
      toast.error('Error', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <Badge variant="success">Approved</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">Rejected</Badge>;
      case 'CANCELLED':
        return <Badge variant="neutral">Cancelled</Badge>;
      case 'SUBMITTED':
      default:
        return <Badge variant="warning">Pending Approval</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <Spinner fullHeight message="Loading your leave balances and entitlement ledger..." />
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
            My Leave Entitlements & Applications
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
            Check your statutory and voluntary leave balances and submit time-off applications.
          </p>
        </div>

        <Button
          variant="primary"
          leftIcon={<Plus size={16} />}
          onClick={() => setIsModalOpen(true)}
        >
          Apply for Leave
        </Button>
      </div>

      {/* Leave Balance Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        {entitlements.map((ent) => (
          <Card key={ent.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                  {ent.leaveType?.name || 'Leave Type'}
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                  {ent.availableBalance}{' '}
                  <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>Days</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Entitled: {ent.entitledDays} | Used: {ent.usedDays}
                </div>
              </div>
              <div style={{ padding: '0.5rem', borderRadius: '8px', backgroundColor: '#fef3c7', color: '#d97706' }}>
                <CalendarDays size={20} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Leave Request History Table */}
      <Card title="My Leave Application History">
        {requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748b' }}>
            <Calendar size={36} color="#94a3b8" style={{ marginBottom: '0.75rem' }} />
            <h4 style={{ margin: 0, color: '#0f172a' }}>No Leave Applications Submitted</h4>
            <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Click &quot;Apply for Leave&quot; above to submit your first leave application.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', backgroundColor: '#f8fafc' }}>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Request #</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Leave Type</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Duration</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Dates</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Reason</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                      {req.requestNumber}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <strong>{req.leaveType?.name}</strong>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0284c7' }}>
                      {req.appliedDays} Working Days
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {new Date(req.startDate).toLocaleDateString()} – {new Date(req.endDate).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#475569', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {req.reason || 'N/A'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {getStatusBadge(req.status)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                      {new Date(req.submittedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Apply Leave Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Apply for Leave Days"
        size="md"
      >
        <form onSubmit={handleApplyLeave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
              Select Leave Category <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              value={selectedLeaveTypeId}
              onChange={(e) => setSelectedLeaveTypeId(e.target.value)}
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
              {leaveTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.name} ({lt.defaultDays} days standard)
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Input
              type="date"
              label="Start Date *"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
            <Input
              type="date"
              label="End Date *"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#334155', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isHalfDay}
                onChange={(e) => setIsHalfDay(e.target.checked)}
              />
              <span>Half-day application</span>
            </label>
          </div>

          <Input
            label="Contact Phone While On Leave"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="+254 7XX XXX XXX"
          />

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
              Reason for Leave <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="State the purpose of your leave application..."
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
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting} leftIcon={<Send size={16} />}>
              Submit Application
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
