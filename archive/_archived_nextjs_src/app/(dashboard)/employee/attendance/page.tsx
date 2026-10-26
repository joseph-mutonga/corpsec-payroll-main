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
  Calendar,
  CheckCircle2,
  AlertCircle,
  Plus,
  Send,
  ShieldCheck,
  MapPin,
  Building2,
  ArrowRight,
  TrendingUp,
  RotateCw,
} from 'lucide-react';

export default function EmployeeAttendancePage() {
  const { showToast } = useToast();
  const [attendanceData, setAttendanceData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClocking, setIsClocking] = useState(false);

  // Month & Year Filter
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  // Today's Clock State
  const [currentTime, setCurrentTime] = useState<string>('');

  // Correction Request Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [correctionDate, setCorrectionDate] = useState('');
  const [requestedClockIn, setRequestedClockIn] = useState('06:00');
  const [requestedClockOut, setRequestedClockOut] = useState('18:00');
  const [requestedStatus, setRequestedStatus] = useState('PRESENT');
  const [correctionReason, setCorrectionReason] = useState('');

  useEffect(() => {
    fetchAttendance();
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchAttendance = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/portal/attendance?month=${selectedMonth}&year=${selectedYear}`);
      const data = await res.json();
      if (data.success) {
        setAttendanceData(data.data);
      } else {
        showToast({ type: 'error', title: data.message || 'Failed to load attendance records' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Unable to connect to attendance service' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClockEvent = async (eventType: 'CLOCK_IN' | 'CLOCK_OUT') => {
    try {
      setIsClocking(true);
      const res = await fetch('/api/portal/attendance/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType }),
      });

      const json = await res.json();
      if (json.success) {
        showToast({
          type: 'success',
          title: `Clock ${eventType === 'CLOCK_IN' ? 'In' : 'Out'} recorded successfully`,
        });
        fetchAttendance();
      } else {
        showToast({ type: 'error', title: json.error || 'Failed to record clock event' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Network error processing clock' });
    } finally {
      setIsClocking(false);
    }
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionDate || !correctionReason.trim()) {
      showToast({ type: 'error', title: 'Please select date and provide an explanation' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/portal/attendance/correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: correctionDate,
          requestedClockIn,
          requestedClockOut,
          requestedStatus,
          reason: correctionReason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit correction request');
      }

      showToast({ type: 'success', title: 'Attendance correction request submitted to HR' });
      setIsModalOpen(false);
      setCorrectionReason('');
    } catch (err: any) {
      showToast({ type: 'error', title: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PRESENT':
      case 'ON_DUTY':
        return <Badge variant="success">Present</Badge>;
      case 'PRESENT_WITH_OVERTIME':
        return <Badge variant="gold">Present + OT</Badge>;
      case 'LATE':
        return <Badge variant="warning">Late Arrival</Badge>;
      case 'EARLY_DEPARTURE':
        return <Badge variant="warning">Early Departure</Badge>;
      case 'ABSENT':
        return <Badge variant="danger">Absent</Badge>;
      case 'OFF_DUTY':
      case 'OFF_DAY':
      case 'REST_DAY':
        return <Badge variant="neutral">Off Duty</Badge>;
      case 'ON_LEAVE':
      case 'SICK_LEAVE':
        return <Badge variant="info">On Leave</Badge>;
      case 'MISSING_CLOCK_OUT':
        return <Badge variant="danger">Missing Clock-Out</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  if (isLoading && !attendanceData) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spinner size="lg" message="Retrieving duty logs and biometric records..." />
      </div>
    );
  }

  const summary = attendanceData?.summary || { totalDays: 0, presentDays: 0, lateDays: 0, absentDays: 0, overtimeHours: 0, attendanceRate: 100 };
  const records = attendanceData?.records || [];
  const todayRecord = attendanceData?.todayRecord || null;

  const hasClockedInToday = Boolean(todayRecord?.clockIn);
  const hasClockedOutToday = Boolean(todayRecord?.clockOut);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Breadcrumb items={[{ label: 'Employee Portal', href: '/employee' }, { label: 'My Attendance & Clocking' }]} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={28} color="#0f1c3f" />
            Duty Attendance, Clock-In & Timesheet
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
            Station check-in records, shift hours worked, overtime, and attendance adjustments.
          </p>
        </div>

        <Button variant="outline" onClick={() => setIsModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Plus size={14} /> Request Attendance Correction
        </Button>
      </div>

      {/* Interactive Clock-In / Clock-Out Station Card */}
      <Card noPadding>
        <div
          style={{
            padding: '1.5rem',
            background: 'linear-gradient(135deg, #0f1c3f 0%, #1e293b 100%)',
            color: '#ffffff',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1.5rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.8125rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              TODAY'S WORKFORCE ROSTER & TIME CLOCK
            </div>
            <div style={{ fontSize: '2.25rem', fontWeight: 800, fontFamily: 'monospace', marginTop: '0.25rem' }}>
              {currentTime || '--:--:--'}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#cbd5e1', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span>Date: {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
              <span>•</span>
              <span>Shift: Standard Day (08:00 - 17:00)</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {!hasClockedInToday ? (
              <Button
                variant="primary"
                size="lg"
                disabled={isClocking}
                onClick={() => handleClockEvent('CLOCK_IN')}
                style={{
                  backgroundColor: '#16a34a',
                  borderColor: '#15803d',
                  fontSize: '1.125rem',
                  padding: '0.875rem 2rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <CheckCircle2 size={22} />
                {isClocking ? 'Clocking In...' : 'CLOCK IN NOW'}
              </Button>
            ) : !hasClockedOutToday ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div style={{ fontSize: '0.8125rem', color: '#86efac', fontWeight: 600 }}>
                  ✓ Clocked In at {todayRecord.clockIn}
                </div>
                <Button
                  variant="danger"
                  size="lg"
                  disabled={isClocking}
                  onClick={() => handleClockEvent('CLOCK_OUT')}
                  style={{
                    backgroundColor: '#dc2626',
                    fontSize: '1.125rem',
                    padding: '0.875rem 2rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <Clock size={22} />
                  {isClocking ? 'Clocking Out...' : 'CLOCK OUT'}
                </Button>
              </div>
            ) : (
              <div style={{ padding: '0.75rem 1.25rem', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', textAlign: 'right' }}>
                <div style={{ fontSize: '0.8125rem', color: '#86efac', fontWeight: 700 }}>✓ SHIFT COMPLETED FOR TODAY</div>
                <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '2px' }}>
                  In: {todayRecord.clockIn} • Out: {todayRecord.clockOut} • {todayRecord.workedHours || 0} hrs worked
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Monthly KPI Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <Card noPadding>
          <div style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>ATTENDANCE RATE</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#16a34a', marginTop: '0.25rem' }}>
              {summary.attendanceRate}%
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
              {summary.presentDays} of {summary.totalDays} scheduled days
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>DAYS PRESENT</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f1c3f', marginTop: '0.25rem' }}>
              {summary.presentDays}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>On duty this month</div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>LATE ARRIVALS</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: summary.lateDays > 0 ? '#d97706' : '#0f1c3f', marginTop: '0.25rem' }}>
              {summary.lateDays}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Past grace period</div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>OVERTIME LOGGED</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2563eb', marginTop: '0.25rem' }}>
              {summary.overtimeHours} hrs
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Ready for monthly payroll</div>
          </div>
        </Card>
      </div>

      {/* Monthly History Table */}
      <Card title="Monthly Duty Attendance History" noPadding>
        <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
            style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8125rem' }}
          >
            {[
              { v: 1, l: 'January' },
              { v: 2, l: 'February' },
              { v: 3, l: 'March' },
              { v: 4, l: 'April' },
              { v: 5, l: 'May' },
              { v: 6, l: 'June' },
              { v: 7, l: 'July' },
              { v: 8, l: 'August' },
              { v: 9, l: 'September' },
              { v: 10, l: 'October' },
              { v: 11, l: 'November' },
              { v: 12, l: 'December' },
            ].map((m) => (
              <option key={m.v} value={m.v}>
                {m.l}
              </option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8125rem' }}
          >
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>
        </div>

        {records.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No attendance entries logged for this period.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 600 }}>Shift / Scheduled</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 600 }}>Clock In</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 600 }}>Clock Out</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 600 }}>Worked</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 600 }}>Exceptions / OT</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f1c3f' }}>{r.date}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem' }}>
                      <div style={{ fontWeight: 600 }}>{r.shiftName || 'Standard Shift'}</div>
                      <div style={{ color: '#64748b' }}>{r.scheduledStart} - {r.scheduledEnd}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: r.clockIn ? '#16a34a' : '#94a3b8' }}>
                      {r.clockIn || '--:--'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: r.clockOut ? '#0f1c3f' : '#94a3b8' }}>
                      {r.clockOut || '--:--'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f1c3f' }}>
                      {r.workedHours} hrs
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{getStatusBadge(r.status || r.attendanceStatus)}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.75rem' }}>
                      {r.lateMinutes > 0 && <span style={{ color: '#d97706', display: 'block' }}>Late: {r.lateMinutes}m</span>}
                      {r.overtimeHours > 0 && <span style={{ color: '#16a34a', display: 'block' }}>OT: {r.overtimeHours}h</span>}
                      {(!r.lateMinutes && !r.overtimeHours) && <span style={{ color: '#94a3b8' }}>--</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Attendance Correction Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Submit Attendance Correction Request"
      >
        <form onSubmit={handleSubmitCorrection} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Input
            label="Attendance Date *"
            type="date"
            required
            value={correctionDate}
            onChange={(e) => setCorrectionDate(e.target.value)}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Input
              label="Actual Clock In"
              type="time"
              value={requestedClockIn}
              onChange={(e) => setRequestedClockIn(e.target.value)}
            />
            <Input
              label="Actual Clock Out"
              type="time"
              value={requestedClockOut}
              onChange={(e) => setRequestedClockOut(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              Correction Reason & Station Details *
            </label>
            <textarea
              required
              rows={3}
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="e.g. Biometric scanner offline at Westlands checkpoint; clocked manually on paper muster roll."
              style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Send Request to HR'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
