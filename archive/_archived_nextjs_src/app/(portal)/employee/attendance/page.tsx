'use client';

import React, { useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Coffee,
  LogIn,
  LogOut,
  Calendar,
  FileText,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';

export default function EmployeeAttendancePortalPage() {
  const { showToast } = useToast();
  const [portalData, setPortalData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClocking, setIsClocking] = useState(false);
  const [notes, setNotes] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Correction Modal
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionRecordId, setCorrectionRecordId] = useState('');
  const [correctionField, setCorrectionField] = useState('CLOCK_IN');
  const [correctionValue, setCorrectionValue] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');

  useEffect(() => {
    fetchPortalData();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchPortalData = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/portal/attendance');
      const json = await res.json();
      if (json.success) {
        setPortalData(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (action: 'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_START' | 'BREAK_END') => {
    try {
      setIsClocking(true);
      const res = await fetch('/api/portal/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes: notes || undefined }),
      });
      const json = await res.json();
      if (json.success) {
        showToast({ type: 'success', title: `Success: ${action.replace('_', ' ')} recorded!` });
        setNotes('');
        fetchPortalData();
      } else {
        showToast({ type: 'error', title: json.error || 'Clocking action failed' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Network error during punch' });
    } finally {
      setIsClocking(false);
    }
  };

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionReason) {
      showToast({ type: 'error', title: 'Reason is required' });
      return;
    }
    try {
      const res = await fetch('/api/attendance/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendanceRecordId: correctionRecordId,
          employeeId: portalData?.employee?.id,
          fieldChanged: correctionField,
          requestedValue: correctionValue,
          reason: correctionReason,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast({ type: 'success', title: 'Correction request submitted for supervisor review' });
        setShowCorrectionModal(false);
        setCorrectionReason('');
        setCorrectionValue('');
        fetchPortalData();
      } else {
        showToast({ type: 'error', title: json.error || 'Failed to submit correction' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Error submitting correction request' });
    }
  };

  const activeRecord = portalData?.todayStatus;
  const isClockedIn = !!activeRecord?.actualClockIn && !activeRecord?.actualClockOut;
  const isBreakActive = activeRecord?.isBreakActive ?? false;
  const history = portalData?.history || [];

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Employee Attendance & Timesheets
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
            Record live shift arrival, manage breaks, view verified timesheets, and submit punch corrections.
          </p>
        </div>
        <Button variant="outline" onClick={fetchPortalData} leftIcon={<RefreshCw size={16} />}>Refresh</Button>
      </div>

      {isLoading ? (
        <div style={{ padding: '4rem', textAlign: 'center' }}>
          <Spinner size="lg" />
          <p style={{ marginTop: '0.5rem', color: '#64748b' }}>Loading your attendance profile...</p>
        </div>
      ) : (
        <>
          {/* Live Clock Card */}
          <Card style={{ padding: '2rem', marginBottom: '2rem', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.8125rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  CURRENT TIME (EAT)
                </span>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'monospace', color: '#38bdf8', marginTop: '0.25rem' }}>
                  {currentTime.toLocaleTimeString('en-KE', { hour12: false })}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#cbd5e1', marginTop: '0.25rem' }}>
                  {currentTime.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.8125rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  MY SHIFT STATUS
                </span>
                <div style={{ marginTop: '0.5rem' }}>
                  {isBreakActive ? (
                    <Badge variant="warning">ON BREAK</Badge>
                  ) : isClockedIn ? (
                    <Badge variant="success">ON DUTY / CLOCKED IN</Badge>
                  ) : (
                    <Badge variant="neutral">OFF DUTY</Badge>
                  )}
                </div>
                {activeRecord?.actualClockIn && (
                  <div style={{ fontSize: '0.8125rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                    Clocked In: {new Date(activeRecord.actualClockIn).toLocaleTimeString('en-KE')}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginTop: '2rem' }}>
              {!isClockedIn ? (
                <Button
                  variant="primary"
                  onClick={() => handleAction('CLOCK_IN')}
                  disabled={isClocking}
                  leftIcon={<LogIn size={18} />}
                  style={{ padding: '0.875rem', fontSize: '1rem', fontWeight: 700 }}
                >
                  {isClocking ? 'Processing...' : 'CLOCK IN'}
                </Button>
              ) : (
                <>
                  <Button
                    variant="danger"
                    onClick={() => handleAction('CLOCK_OUT')}
                    disabled={isClocking || isBreakActive}
                    leftIcon={<LogOut size={18} />}
                    style={{ padding: '0.875rem', fontSize: '1rem', fontWeight: 700 }}
                  >
                    {isClocking ? 'Processing...' : 'CLOCK OUT'}
                  </Button>

                  {!isBreakActive ? (
                    <Button
                      variant="outline"
                      onClick={() => handleAction('BREAK_START')}
                      disabled={isClocking}
                      leftIcon={<Coffee size={18} />}
                      style={{ padding: '0.875rem', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
                    >
                      START BREAK
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => handleAction('BREAK_END')}
                      disabled={isClocking}
                      leftIcon={<Coffee size={18} />}
                      style={{ padding: '0.875rem', fontWeight: 700 }}
                    >
                      END BREAK
                    </Button>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* Attendance History */}
          <Card style={{ padding: '1.5rem', marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>
              My Recent Attendance Logs (Last 30 Days)
            </h3>
            {history.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No attendance records found yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Shift</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Clock In</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Clock Out</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Worked (Hrs)</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((r: any) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                          {new Date(r.date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>{r.scheduledShift?.name || 'Standard 8h'}</td>
                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>
                          {r.actualClockIn ? new Date(r.actualClockIn).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>
                          {r.actualClockOut ? new Date(r.actualClockOut).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{(r.workedMinutes / 60).toFixed(2)}h</td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <Badge variant={r.attendanceStatus === 'PRESENT' ? 'success' : r.attendanceStatus === 'LATE' ? 'warning' : 'neutral'}>
                            {r.attendanceStatus}
                          </Badge>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setCorrectionRecordId(r.id);
                              setShowCorrectionModal(true);
                            }}
                          >
                            Request Fix
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Request Correction Modal */}
      {showCorrectionModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '0.75rem', width: '100%', maxWidth: '500px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1rem 0' }}>Request Attendance Correction</h2>
            <form onSubmit={handleCorrectionSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Field to Correct *</label>
                <select value={correctionField} onChange={(e) => setCorrectionField(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}>
                  <option value="CLOCK_IN">Clock In Timestamp</option>
                  <option value="CLOCK_OUT">Clock Out Timestamp</option>
                  <option value="STATUS">Attendance Status</option>
                </select>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Corrected Value *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. 2026-08-15T06:00:00.000Z or PRESENT"
                  value={correctionValue}
                  onChange={(e) => setCorrectionValue(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Reason for Correction *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain why this punch was missed or recorded incorrectly..."
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <Button variant="outline" type="button" onClick={() => setShowCorrectionModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit">Submit Request</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
