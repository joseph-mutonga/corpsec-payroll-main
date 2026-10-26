'use client';

import React, { useEffect, useState } from 'react';
import {
  Clock,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileCheck,
  Search,
  Filter,
  Users,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { OvertimeRecordData, EmployeeData } from '@/types';
import Link from 'next/link';

export default function OvertimePage() {
  const [overtimes, setOvertimes] = useState<OvertimeRecordData[]>([]);
  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    employeeId: '',
    date: new Date().toISOString().split('T')[0],
    scheduledHours: 12,
    actualHours: 14,
    overtimeHours: 2,
    reason: '',
    comments: '',
  });

  useEffect(() => {
    loadEmployees();
    fetchOvertimes();
  }, [statusFilter]);

  const loadEmployees = async () => {
    try {
      const res = await fetch('/api/employees?limit=200');
      const data = await res.json();
      if (data.success) {
        setEmployees(data.data.employees || data.data);
      }
    } catch (err) {
      console.error('Failed to load employees:', err);
    }
  };

  const fetchOvertimes = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'ALL') params.append('status', statusFilter);
      const res = await fetch(`/api/attendance/overtime?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setOvertimes(data.data);
      }
    } catch (err) {
      console.error('Failed to load overtime records:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenClaim = () => {
    setFormData({
      employeeId: employees[0]?.id || '',
      date: new Date().toISOString().split('T')[0],
      scheduledHours: 12,
      actualHours: 14,
      overtimeHours: 2,
      reason: '',
      comments: '',
    });
    setShowClaimModal(true);
  };

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setNotification(null);

      const res = await fetch('/api/attendance/overtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (data.success) {
        setNotification({ type: 'success', message: 'Overtime claim logged successfully' });
        setShowClaimModal(false);
        fetchOvertimes();
      } else {
        setNotification({ type: 'error', message: data.error?.message || 'Failed to submit claim' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error submitting overtime' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: string, action: 'APPROVE' | 'REJECT') => {
    const comments = prompt(`Enter optional review comments for ${action}:`) || undefined;
    try {
      const res = await fetch(`/api/attendance/overtime/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comments }),
      });

      const data = await res.json();
      if (data.success) {
        setNotification({ type: 'success', message: `Overtime claim ${action.toLowerCase()}d successfully` });
        fetchOvertimes();
      } else {
        setNotification({ type: 'error', message: data.error?.message || 'Status update failed' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error updating status' });
    }
  };

  const filteredOvertimes = overtimes.filter(
    (o) =>
      o.employee?.fullName.toLowerCase().includes(search.toLowerCase()) ||
      o.employee?.employeeNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.reason.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'Attendance', href: '/attendance' },
          { label: 'Overtime Claims & Authorizations' },
        ]}
      />

      {notification && (
        <div
          style={{
            padding: '0.875rem 1.25rem',
            borderRadius: '8px',
            marginBottom: '1.25rem',
            backgroundColor: notification.type === 'success' ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${notification.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
            color: notification.type === 'success' ? '#065f46' : '#991b1b',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '1.5rem 1.75rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0f1c3f', marginBottom: '0.25rem' }}>
            Overtime Claims &amp; Time Tracking
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Verify and authorize extra duty hours for static guards and patrol officers. (Monetary pay calculations will be processed during Payroll Phase 7).
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={handleOpenClaim} leftIcon={<Plus size={14} />}>
          Log Overtime Claim
        </Button>
      </div>

      {/* Filter and Table */}
      <Card noPadding>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', minWidth: '240px' }}>
            <input
              type="text"
              placeholder="Search guard or reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                fontSize: '0.8125rem',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
              }}
            />
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.8125rem',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                backgroundColor: '#ffffff',
              }}
            >
              <option value="ALL">All Overtime Statuses</option>
              <option value="PENDING">Pending Authorization</option>
              <option value="APPROVED">Approved (Verified)</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700 }}>
                <th style={{ padding: '0.75rem 1rem' }}>Duty Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Employee / Guard</th>
                <th style={{ padding: '0.75rem 1rem' }}>Deployment Station</th>
                <th style={{ padding: '0.75rem 1rem' }}>Scheduled</th>
                <th style={{ padding: '0.75rem 1rem' }}>Actual Hours</th>
                <th style={{ padding: '0.75rem 1rem' }}>Overtime Claim</th>
                <th style={{ padding: '0.75rem 1rem' }}>Reason &amp; Notes</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} style={{ padding: '3rem 1rem', textAlign: 'center' }}>
                    <Spinner size="md" message="Loading overtime records..." />
                  </td>
                </tr>
              ) : filteredOvertimes.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748b' }}>
                    No overtime claims found.
                  </td>
                </tr>
              ) : (
                filteredOvertimes.map((o) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                      {new Date(o.date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Link
                        href={`/hr/employees/${o.employee?.id}`}
                        style={{ textDecoration: 'none', color: '#0f172a', fontWeight: 600 }}
                      >
                        {o.employee?.fullName}
                      </Link>
                      <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>
                        {o.employee?.employeeNumber} &bull; {o.employee?.jobTitle}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                      {o.employee?.station?.name || 'HQ Deployment'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                      {o.scheduledHours} hrs
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#0f172a', fontWeight: 600 }}>
                      {o.actualHours} hrs
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ color: '#7c3aed', fontWeight: 800, fontSize: '0.875rem' }}>
                        +{o.overtimeHours} hrs
                      </span>
                      <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>
                        ({o.overtimeMinutes} mins)
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                      <span>{o.reason}</span>
                      {o.comments && (
                        <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>
                          HR Review: {o.comments}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge
                        variant={
                          o.approvalStatus === 'APPROVED'
                            ? 'success'
                            : o.approvalStatus === 'REJECTED'
                            ? 'danger'
                            : 'neutral'
                        }
                        size="sm"
                      >
                        {o.approvalStatus}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      {o.approvalStatus === 'PENDING' ? (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem' }}>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleUpdateStatus(o.id, 'APPROVE')}
                            leftIcon={<CheckCircle2 size={13} />}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUpdateStatus(o.id, 'REJECT')}
                            style={{ color: '#dc2626' }}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>
                          {o.approvedBy ? `By ${o.approvedBy.firstName}` : 'Processed'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Log Overtime Claim Modal */}
      {showClaimModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              maxWidth: '520px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.25rem' }}>
              Log Overtime Claim
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1.25rem' }}>
              Record extra hours for field deployment or night patrol extension.
            </p>

            <form onSubmit={handleClaimSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                    Select Guard / Employee *
                  </label>
                  <select
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#ffffff' }}
                    required
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} ({emp.employeeNumber}) &bull; {emp.jobTitle}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Duty Date *
                    </label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Overtime Hours *
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      min="0.25"
                      max="12"
                      value={formData.overtimeHours}
                      onChange={(e) => {
                        const ot = parseFloat(e.target.value) || 0;
                        setFormData({
                          ...formData,
                          overtimeHours: ot,
                          actualHours: formData.scheduledHours + ot,
                        });
                      }}
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Scheduled Hours
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={formData.scheduledHours}
                      onChange={(e) => {
                        const sch = parseFloat(e.target.value) || 0;
                        setFormData({
                          ...formData,
                          scheduledHours: sch,
                          actualHours: sch + formData.overtimeHours,
                        });
                      }}
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Total Actual Worked Hours
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={formData.actualHours}
                      readOnly
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#f8fafc' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                    Reason for Overtime *
                  </label>
                  <input
                    type="text"
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="e.g. VIP client container escort beyond standard shift"
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                    required
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowClaimModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
                    {isSubmitting ? 'Logging...' : 'Submit Overtime Claim'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
