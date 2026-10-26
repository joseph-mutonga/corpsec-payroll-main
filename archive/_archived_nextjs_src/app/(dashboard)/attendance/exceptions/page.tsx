'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Search,
  Filter,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import Link from 'next/link';

export default function AttendanceExceptionsPage() {
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState('ALL');

  useEffect(() => {
    fetchExceptions();
  }, []);

  const fetchExceptions = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/attendance/employees?pageSize=100');
      const json = await res.json();
      if (json.success) {
        // Filter records that have anomalies
        const anomalous = (json.data || []).filter((r: any) => {
          const missingOut = r.actualClockIn && !r.actualClockOut;
          const isLate = r.lateMinutes > 0 || r.attendanceStatus === 'LATE';
          const isEarly = r.earlyDepartureMinutes > 0 || r.attendanceStatus === 'EARLY_DEPARTURE';
          const isAbsent = r.attendanceStatus === 'ABSENT';
          return missingOut || isLate || isEarly || isAbsent;
        });
        setExceptions(anomalous);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const getExceptionBadge = (r: any) => {
    if (r.actualClockIn && !r.actualClockOut) {
      return <Badge variant="danger">MISSING CLOCK OUT</Badge>;
    }
    if (r.lateMinutes > 0) {
      return <Badge variant="warning">LATE ({r.lateMinutes}m)</Badge>;
    }
    if (r.earlyDepartureMinutes > 0) {
      return <Badge variant="warning">EARLY DEPARTURE ({r.earlyDepartureMinutes}m)</Badge>;
    }
    if (r.attendanceStatus === 'ABSENT') {
      return <Badge variant="danger">UNEXPLAINED ABSENCE</Badge>;
    }
    return <Badge variant="neutral">{r.attendanceStatus}</Badge>;
  };

  return (
    <div style={{ padding: '2rem' }}>
      <Breadcrumb
        items={[
          { label: 'Attendance', href: '/attendance' },
          { label: 'Attendance Exceptions & Missed Punches' },
        ]}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Attendance Exceptions & Missed Punches
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
            Flagged punctuality violations, unclosed shift punches, and potential scheduling conflicts.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/attendance/corrections">
            <Button variant="primary">Corrections Desk</Button>
          </Link>
          <Button variant="outline" onClick={fetchExceptions} leftIcon={<RefreshCw size={16} />}>Refresh</Button>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="lg" />
            <p style={{ marginTop: '0.5rem', color: '#64748b' }}>Analyzing attendance anomalies...</p>
          </div>
        ) : exceptions.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            <CheckCircle2 size={36} style={{ color: '#10b981', margin: '0 auto 0.75rem' }} />
            <p style={{ fontWeight: 600, color: '#0f172a', margin: 0 }}>Zero Attendance Exceptions!</p>
            <p style={{ fontSize: '0.8125rem', margin: '0.25rem 0 0 0' }}>All scheduled shifts and clockings are reconciled properly.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Employee</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Station</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Scheduled</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Actual Punch</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Exception Type</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {new Date(r.date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.employee?.fullName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{r.employee?.employeeNumber}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {r.employee?.station?.name || 'HQ Office'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem' }}>
                      {r.scheduledStartTime || '08:00'} → {r.scheduledEndTime || '17:00'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                      {r.actualClockIn ? new Date(r.actualClockIn).toLocaleTimeString('en-KE') : 'No Clock In'} / {r.actualClockOut ? new Date(r.actualClockOut).toLocaleTimeString('en-KE') : 'No Clock Out'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {getExceptionBadge(r)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Link href={`/attendance/corrections?recordId=${r.id}`}>
                        <Button size="sm" variant="outline">Submit Correction</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
