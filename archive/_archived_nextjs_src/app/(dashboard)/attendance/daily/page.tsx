'use client';

import React, { useState, useEffect } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import {
  Calendar,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  AlertTriangle,
  UserX,
  Building2,
  MapPin,
  ArrowRight,
  Shield,
  Edit2,
  Download,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';

export default function DailyAttendanceBoardPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [stationFilter, setStationFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [departments, setDepartments] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [page, setPage] = useState(1);

  // Status override modal
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [overrideStatus, setOverrideStatus] = useState('PRESENT');
  const [overrideNotes, setOverrideNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchOrgUnits();
  }, []);

  useEffect(() => {
    fetchDailyRecords();
  }, [selectedDate, departmentFilter, stationFilter, statusFilter, page]);

  const fetchOrgUnits = async () => {
    try {
      const [dRes, sRes] = await Promise.all([fetch('/api/departments'), fetch('/api/stations')]);
      const dData = await dRes.json();
      const sData = await sRes.json();
      if (dData.success) setDepartments(dData.data || []);
      if (sData.success) setStations(sData.data || []);
    } catch (err) {
      console.error('Error fetching org units:', err);
    }
  };

  const fetchDailyRecords = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        date: selectedDate,
        page: page.toString(),
        pageSize: '50',
      });
      if (departmentFilter !== 'ALL') params.append('departmentId', departmentFilter);
      if (stationFilter !== 'ALL') params.append('stationId', stationFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (search) params.append('search', search);

      const res = await fetch(`/api/attendance/daily?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (err) {
      console.error('Error fetching daily attendance:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchDailyRecords();
  };

  const handleOpenOverride = (r: any) => {
    setSelectedRecord(r);
    setOverrideStatus(r.attendanceStatus);
    setOverrideNotes(r.notes || '');
    setIsOverrideOpen(true);
  };

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await fetch('/api/attendance/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendanceRecordId: selectedRecord.id,
          attendanceStatus: overrideStatus,
          notes: overrideNotes,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast({ type: 'success', title: 'Attendance status successfully updated' });
        setIsOverrideOpen(false);
        fetchDailyRecords();
      } else {
        showToast({ type: 'error', title: json.error || 'Failed to update attendance' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Network error updating attendance' });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'PRESENT':
        return <Badge variant="success">Present</Badge>;
      case 'PRESENT_WITH_OVERTIME':
        return <Badge variant="gold">Present + OT</Badge>;
      case 'LATE':
        return <Badge variant="warning">Late Arrival</Badge>;
      case 'EARLY_DEPARTURE':
        return <Badge variant="warning">Early Departure</Badge>;
      case 'ABSENT':
        return <Badge variant="danger">Absent</Badge>;
      case 'ON_LEAVE':
      case 'SICK_LEAVE':
        return <Badge variant="info">On Leave</Badge>;
      case 'OFF_DAY':
      case 'REST_DAY':
        return <Badge variant="neutral">Off Duty</Badge>;
      case 'MISSING_CLOCK_OUT':
        return <Badge variant="danger">Missing Clock-Out</Badge>;
      case 'PUBLIC_HOLIDAY':
        return <Badge variant="gold">Holiday</Badge>;
      case 'EXCUSED_ABSENCE':
      case 'EXCUSED':
        return <Badge variant="neutral">Excused</Badge>;
      default:
        return <Badge variant="neutral">{st}</Badge>;
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Breadcrumb items={[{ label: 'Attendance', href: '/attendance' }, { label: 'Daily Attendance Board' }]} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={28} color="#0f1c3f" />
            Daily Attendance Board
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
            Real-time daily muster roll, guard station deployments, and clock status records.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setPage(1);
            }}
            style={{ width: '180px' }}
          />
          <Link href="/attendance/reports">
            <Button variant="outline" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Download size={14} /> Printable Report
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <Card noPadding>
        <div style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: '1 1 220px' }}>
            <Input
              placeholder="Search employee name or number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%' }}
            />
            <Button variant="primary" type="submit">
              <Search size={14} />
            </Button>
          </form>

          <select
            value={departmentFilter}
            onChange={(e) => {
              setDepartmentFilter(e.target.value);
              setPage(1);
            }}
            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8125rem' }}
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            value={stationFilter}
            onChange={(e) => {
              setStationFilter(e.target.value);
              setPage(1);
            }}
            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8125rem' }}
          >
            <option value="ALL">All Stations</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8125rem' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="PRESENT">Present</option>
            <option value="PRESENT_WITH_OVERTIME">Present + OT</option>
            <option value="LATE">Late Arrival</option>
            <option value="EARLY_DEPARTURE">Early Departure</option>
            <option value="ABSENT">Absent</option>
            <option value="ON_LEAVE">On Leave</option>
            <option value="OFF_DAY">Off Duty</option>
            <option value="MISSING_CLOCK_OUT">Missing Clock-Out</option>
            <option value="PUBLIC_HOLIDAY">Public Holiday</option>
          </select>
        </div>

        {/* Attendance Table */}
        {loading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" />
          </div>
        ) : !data || data.records.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No attendance records logged for {selectedDate}.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 600 }}>Employee</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 600 }}>Department & Station</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 600 }}>Shift / Scheduled</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 600 }}>Clock In</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 600 }}>Clock Out</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 600 }}>Worked</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 600 }}>Late / OT</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((r: any) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 700, color: '#0f1c3f' }}>{r.employeeName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{r.employeeNumber}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem' }}>
                      <div>{r.department}</div>
                      <div style={{ color: '#64748b' }}>{r.station}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem' }}>
                      <div style={{ fontWeight: 600 }}>{r.shiftName}</div>
                      <div style={{ color: '#64748b' }}>
                        {r.scheduledStart} - {r.scheduledEnd}
                      </div>
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
                    <td style={{ padding: '0.75rem 1rem' }}>{getStatusBadge(r.attendanceStatus)}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.75rem' }}>
                      {r.lateMinutes > 0 && <span style={{ color: '#d97706', display: 'block' }}>Late: {r.lateMinutes}m</span>}
                      {r.overtimeMinutes > 0 && <span style={{ color: '#16a34a', display: 'block' }}>OT: {r.overtimeHours}h</span>}
                      {r.earlyDepartureMinutes > 0 && <span style={{ color: '#ea580c', display: 'block' }}>Early: {r.earlyDepartureMinutes}m</span>}
                      {r.lateMinutes === 0 && r.overtimeMinutes === 0 && r.earlyDepartureMinutes === 0 && <span style={{ color: '#94a3b8' }}>--</span>}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Button size="sm" variant="outline" onClick={() => handleOpenOverride(r)}>
                        <Edit2 size={12} style={{ marginRight: '4px' }} /> Edit Status
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Manual Status Override Modal */}
      {selectedRecord && (
        <Modal
          isOpen={isOverrideOpen}
          onClose={() => setIsOverrideOpen(false)}
          title={`Override Attendance — ${selectedRecord.employeeName}`}
        >
          <form onSubmit={handleOverrideSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, color: '#0f1c3f' }}>
                {selectedRecord.employeeName} ({selectedRecord.employeeNumber})
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Date: {selectedDate} • Shift: {selectedRecord.shiftName} ({selectedRecord.scheduledStart} - {selectedRecord.scheduledEnd})
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Attendance Status *
              </label>
              <select
                value={overrideStatus}
                onChange={(e) => setOverrideStatus(e.target.value)}
                style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              >
                <option value="PRESENT">PRESENT (On Duty)</option>
                <option value="PRESENT_WITH_OVERTIME">PRESENT_WITH_OVERTIME</option>
                <option value="LATE">LATE (Late Arrival)</option>
                <option value="EARLY_DEPARTURE">EARLY_DEPARTURE</option>
                <option value="ABSENT">ABSENT (Unexcused)</option>
                <option value="EXCUSED_ABSENCE">EXCUSED_ABSENCE (Authorized Exception)</option>
                <option value="OFF_DAY">OFF_DAY (Scheduled Rest Day)</option>
                <option value="ON_LEAVE">ON_LEAVE</option>
                <option value="PUBLIC_HOLIDAY">PUBLIC_HOLIDAY</option>
                <option value="MISSING_CLOCK_OUT">MISSING_CLOCK_OUT</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                HR / Supervisor Remarks
              </label>
              <textarea
                rows={3}
                value={overrideNotes}
                onChange={(e) => setOverrideNotes(e.target.value)}
                placeholder="e.g. Reliever dispatched from Westlands station; biometric sync error verified."
                style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button variant="outline" type="button" onClick={() => setIsOverrideOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : 'Confirm Override'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
