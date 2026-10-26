'use client';

import React, { useState, useEffect } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import {
  Shield,
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Building2,
  Calendar,
  Check,
  X,
} from 'lucide-react';

export default function ManagerAttendancePage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  // Overtime Approval Modal
  const [selectedOvertime, setSelectedOvertime] = useState<any>(null);
  const [reviewComments, setReviewComments] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchManagerAttendance();
  }, []);

  const fetchManagerAttendance = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/manager/attendance');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        showToast({ type: 'error', title: json.error || 'Failed to load manager roster' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Network error fetching manager roster' });
    } finally {
      setLoading(false);
    }
  };

  const handleReviewOvertime = async (action: 'APPROVE' | 'REJECT') => {
    if (!selectedOvertime) return;

    try {
      setSubmitting(true);
      const res = await fetch('/api/attendance/overtime', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overtimeId: selectedOvertime.id,
          action,
          comments: reviewComments,
        }),
      });

      const json = await res.json();
      if (json.success) {
        showToast({
          type: 'success',
          title: `Overtime claim ${action === 'APPROVE' ? 'approved' : 'rejected'} successfully`,
        });
        setSelectedOvertime(null);
        setReviewComments('');
        fetchManagerAttendance();
      } else {
        showToast({ type: 'error', title: json.error || 'Failed to review overtime' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Network error processing overtime review' });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PRESENT':
      case 'PRESENT_WITH_OVERTIME':
        return <Badge variant="success">On Duty</Badge>;
      case 'LATE':
        return <Badge variant="warning">Late</Badge>;
      case 'ON_LEAVE':
        return <Badge variant="info">On Leave</Badge>;
      case 'ABSENT':
        return <Badge variant="danger">Absent</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spinner size="lg" message="Loading your station muster roll and subordinate attendance..." />
      </div>
    );
  }

  const metrics = data?.metrics || { totalStaff: 0, present: 0, absent: 0, late: 0, onLeave: 0, pendingOvertimeCount: 0 };
  const subordinates = data?.subordinates || [];
  const pendingOvertime = data?.pendingOvertime || [];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Breadcrumb items={[{ label: 'Station Commander & Manager', href: '/manager' }, { label: 'Subordinate Attendance' }]} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={28} color="#0f1c3f" />
            Station / Department Workforce Attendance
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
            Scoped muster roll for <strong>{data?.managerScope || 'Assigned Station'}</strong>.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        <Card noPadding>
          <div style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>TOTAL SUBORDINATES</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f1c3f', marginTop: '0.25rem' }}>
              {metrics.totalStaff}
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>ON DUTY TODAY</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#16a34a', marginTop: '0.25rem' }}>
              {metrics.present}
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: 700 }}>LATE ARRIVALS</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#d97706', marginTop: '0.25rem' }}>
              {metrics.late}
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 700 }}>ABSENT TODAY</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#dc2626', marginTop: '0.25rem' }}>
              {metrics.absent}
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 700 }}>PENDING OVERTIME</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2563eb', marginTop: '0.25rem' }}>
              {metrics.pendingOvertimeCount}
            </div>
          </div>
        </Card>
      </div>

      {/* Pending Overtime Section */}
      {pendingOvertime.length > 0 && (
        <Card title={`Pending Overtime Claims Requiring Authorization (${pendingOvertime.length})`} noPadding>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Employee</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Claimed OT Hours</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Reason</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingOvertime.map((ot: any) => (
                  <tr key={ot.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 700 }}>{ot.employee.fullName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{ot.employee.employeeNumber}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{new Date(ot.date).toLocaleDateString()}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 800, color: '#2563eb' }}>
                      {ot.overtimeHours} hrs
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{ot.reason}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Button size="sm" variant="primary" onClick={() => setSelectedOvertime(ot)}>
                        Review Claim
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Subordinates Today Muster Roll */}
      <Card title="Station Muster Roll — Today's Duty Status" noPadding>
        {subordinates.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No subordinates assigned to your station or department.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Employee</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Job Title</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Shift / Hours</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Clock In</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Clock Out</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Hours</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {subordinates.map((emp: any) => (
                  <tr key={emp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 700, color: '#0f1c3f' }}>{emp.fullName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{emp.employeeNumber}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem' }}>{emp.jobTitle}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem' }}>
                      <div>{emp.currentShift}</div>
                      <div style={{ color: '#64748b' }}>{emp.scheduledStart} - {emp.scheduledEnd}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: emp.clockIn ? '#16a34a' : '#94a3b8' }}>
                      {emp.clockIn || '--:--'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: emp.clockOut ? '#0f1c3f' : '#94a3b8' }}>
                      {emp.clockOut || '--:--'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>{emp.workedHours} hrs</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{getStatusBadge(emp.todayStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Review Overtime Modal */}
      {selectedOvertime && (
        <Modal
          isOpen={Boolean(selectedOvertime)}
          onClose={() => setSelectedOvertime(null)}
          title={`Review Overtime Claim — ${selectedOvertime.employee.fullName}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700 }}>{selectedOvertime.employee.fullName} ({selectedOvertime.employee.employeeNumber})</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Date: {new Date(selectedOvertime.date).toLocaleDateString()} • Claimed OT: <strong>{selectedOvertime.overtimeHours} hours</strong>
              </div>
              <div style={{ fontSize: '0.8125rem', marginTop: '0.5rem', color: '#334155' }}>
                <strong>Reason:</strong> {selectedOvertime.reason}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Supervisor Remarks
              </label>
              <textarea
                rows={3}
                value={reviewComments}
                onChange={(e) => setReviewComments(e.target.value)}
                placeholder="e.g. Guard stayed 2 hours past shift awaiting reliever on post. Verified by station logbook."
                style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button variant="danger" disabled={submitting} onClick={() => handleReviewOvertime('REJECT')}>
                Reject Claim
              </Button>
              <Button variant="primary" disabled={submitting} onClick={() => handleReviewOvertime('APPROVE')}>
                Approve & Link to Payroll
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
