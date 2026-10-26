'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Download,
  Building2,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import Link from 'next/link';

export default function EmployeeAttendancePage() {
  const [records, setRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchAttendance();
  }, [startDate, endDate, statusFilter]);

  const fetchAttendance = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/attendance/employees?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setRecords(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching attendance:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PRESENT':
      case 'PRESENT_WITH_OVERTIME':
        return <Badge variant="success">PRESENT</Badge>;
      case 'LATE':
        return <Badge variant="warning">LATE</Badge>;
      case 'EARLY_DEPARTURE':
        return <Badge variant="warning">EARLY DEPARTURE</Badge>;
      case 'ON_LEAVE':
      case 'SICK_LEAVE':
        return <Badge variant="info">ON LEAVE</Badge>;
      case 'HOLIDAY':
        return <Badge variant="info">HOLIDAY</Badge>;
      case 'REST_DAY':
        return <Badge variant="neutral">REST DAY</Badge>;
      case 'REMOTE':
        return <Badge variant="info">REMOTE</Badge>;
      case 'ABSENT':
        return <Badge variant="danger">ABSENT</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const filtered = records.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.employee?.fullName?.toLowerCase().includes(q) ||
      r.employee?.employeeNumber?.toLowerCase().includes(q) ||
      r.employee?.station?.name?.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ padding: '2rem' }}>
      <Breadcrumb
        items={[
          { label: 'Attendance', href: '/attendance' },
          { label: 'Employee Attendance Directory' },
        ]}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Employee Attendance Directory
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
            Live daily attendance logs, working hours, tardiness, early departure, and shift allocations.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/attendance/clock-in">
            <Button variant="primary" leftIcon={<Clock size={16} />}>Clock Terminal</Button>
          </Link>
          <Link href="/attendance/reports?type=ATTENDANCE_REGISTER&format=csv">
            <Button variant="outline" leftIcon={<Download size={16} />}>Export CSV</Button>
          </Link>
        </div>
      </div>

      {/* Filters Bar */}
      <Card style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
              Search Personnel / Station
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Name, Emp #, Station..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #cbd5e1',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #cbd5e1',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
              Status Filter
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #cbd5e1',
                fontSize: '0.875rem',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PRESENT">PRESENT</option>
              <option value="LATE">LATE</option>
              <option value="EARLY_DEPARTURE">EARLY DEPARTURE</option>
              <option value="ON_LEAVE">ON LEAVE</option>
              <option value="HOLIDAY">HOLIDAY</option>
              <option value="REST_DAY">REST DAY</option>
              <option value="REMOTE">REMOTE</option>
              <option value="ABSENT">ABSENT</option>
            </select>
          </div>

          <div>
            <Button variant="outline" onClick={fetchAttendance} leftIcon={<RefreshCw size={16} />} style={{ width: '100%' }}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* Attendance Table */}
      <Card>
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="lg" />
            <p style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.875rem' }}>Loading attendance records...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            <Users size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
            <p style={{ margin: 0, fontWeight: 600 }}>No attendance records found.</p>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem' }}>Try adjusting your date range or status filters.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Employee</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Station / Dept</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Shift</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Clock In</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Clock Out</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Worked (Hrs)</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Late (Mins)</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Overtime (Hrs)</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {new Date(r.date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Link href={`/hr/employees/${r.employee?.id}`} style={{ color: '#0f172a', fontWeight: 600, textDecoration: 'none' }}>
                        {r.employee?.fullName}
                      </Link>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{r.employee?.employeeNumber}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 500 }}>{r.employee?.station?.name || 'HQ Office'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{r.employee?.department?.name}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {r.scheduledShift?.name || 'Standard 8h'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>
                      {r.actualClockIn ? new Date(r.actualClockIn).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>
                      {r.actualClockOut ? new Date(r.actualClockOut).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                      {(r.workedMinutes / 60).toFixed(2)}h
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: r.lateMinutes > 0 ? '#b45309' : '#64748b' }}>
                      {r.lateMinutes > 0 ? `${r.lateMinutes}m` : '0m'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: r.overtimeMinutes > 0 ? '#047857' : '#64748b' }}>
                      {(r.overtimeMinutes / 60).toFixed(2)}h
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {getStatusBadge(r.attendanceStatus)}
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
