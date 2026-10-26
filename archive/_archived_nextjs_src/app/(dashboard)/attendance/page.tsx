'use client';

import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  UserX,
  Shield,
  Search,
  Filter,
  Plus,
  Lock,
  Download,
  Upload,
  Check,
  X,
  FileCheck,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  MapPin,
  Building2,
  GitFork,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { AttendanceRecordData, AttendanceStatsData, BranchData, StationData, ShiftData } from '@/types';
import Link from 'next/link';

export default function AttendanceDashboardPage() {
  const [records, setRecords] = useState<AttendanceRecordData[]>([]);
  const [stats, setStats] = useState<AttendanceStatsData | null>(null);
  const [branches, setBranches] = useState<BranchData[]>([]);
  const [stations, setStations] = useState<StationData[]>([]);
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [todayStatus, setTodayStatus] = useState<any>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isClocking, setIsClocking] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [isApproving, setIsApproving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterApproval, setFilterApproval] = useState('ALL');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterStation, setFilterStation] = useState('');
  const [filterShift, setFilterShift] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modals
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockYear, setLockYear] = useState(new Date().getFullYear());
  const [lockMonth, setLockMonth] = useState(new Date().getMonth() + 1);
  const [lockReason, setLockReason] = useState('Finalized for Payroll Verification');
  const [isLocking, setIsLocking] = useState(false);

  useEffect(() => {
    loadMetadata();
    fetchTodayClockStatus();
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [page, filterDate, filterStatus, filterApproval, filterBranch, filterStation, filterShift, search]);

  const loadMetadata = async () => {
    try {
      const [statsRes, brRes, stRes, shRes] = await Promise.all([
        fetch('/api/attendance/stats'),
        fetch('/api/branches'),
        fetch('/api/stations'),
        fetch('/api/attendance/shifts'),
      ]);

      const [statsData, brData, stData, shData] = await Promise.all([
        statsRes.json(),
        brRes.json(),
        stRes.json(),
        shRes.json(),
      ]);

      if (statsData.success) setStats(statsData.data);
      if (brData.success) setBranches(brData.data);
      if (stData.success) setStations(stData.data);
      if (shData.success) setShifts(shData.data);
    } catch (err) {
      console.error('Error loading attendance metadata:', err);
    }
  };

  const fetchTodayClockStatus = async () => {
    try {
      const res = await fetch('/api/attendance/clock/today');
      const data = await res.json();
      if (data.success) {
        setTodayStatus(data.data);
      }
    } catch (err) {
      console.error('Error loading today clock status:', err);
    }
  };

  const fetchRecords = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '25');
      if (search) params.append('search', search);
      if (filterDate) params.append('date', filterDate);
      if (filterStatus && filterStatus !== 'ALL') params.append('status', filterStatus);
      if (filterApproval && filterApproval !== 'ALL') params.append('approvalStatus', filterApproval);
      if (filterBranch) params.append('branchId', filterBranch);
      if (filterStation) params.append('stationId', filterStation);
      if (filterShift) params.append('shiftId', filterShift);

      const res = await fetch(`/api/attendance/records?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setRecords(data.data.records);
        setTotalPages(data.data.pagination.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to load attendance records:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickClock = async (eventType: 'CLOCK_IN' | 'CLOCK_OUT') => {
    try {
      setIsClocking(true);
      setNotification(null);
      const res = await fetch('/api/attendance/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType,
          source: 'PORTAL',
          deviceInfo: navigator.userAgent,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setNotification({ type: 'success', message: data.message });
        await fetchTodayClockStatus();
        await loadMetadata();
        await fetchRecords();
      } else {
        setNotification({ type: 'error', message: data.error?.message || 'Clock event failed' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Clock error' });
    } finally {
      setIsClocking(false);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedRecordIds.length === 0) return;
    try {
      setIsApproving(true);
      const res = await fetch('/api/attendance/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordIds: selectedRecordIds,
          action: 'APPROVE',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ type: 'success', message: data.message });
        setSelectedRecordIds([]);
        await fetchRecords();
        await loadMetadata();
      } else {
        setNotification({ type: 'error', message: data.error?.message || 'Approval failed' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error processing approvals' });
    } finally {
      setIsApproving(false);
    }
  };

  const handleLockPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLocking(true);
      const res = await fetch('/api/attendance/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: lockYear,
          month: lockMonth,
          reason: lockReason,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ type: 'success', message: data.message });
        setShowLockModal(false);
        await fetchRecords();
        await loadMetadata();
      } else {
        setNotification({ type: 'error', message: data.error?.message || 'Failed to lock period' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Lock period error' });
    } finally {
      setIsLocking(false);
    }
  };

  const toggleSelectRecord = (id: string) => {
    setSelectedRecordIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllVisible = () => {
    const selectable = records.filter((r) => r.approvalStatus !== 'LOCKED').map((r) => r.id);
    if (selectedRecordIds.length === selectable.length) {
      setSelectedRecordIds([]);
    } else {
      setSelectedRecordIds(selectable);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PRESENT':
      case 'PRESENT_WITH_OVERTIME':
        return <Badge variant="success" size="sm">{status === 'PRESENT_WITH_OVERTIME' ? 'Present + OT' : 'Present'}</Badge>;
      case 'LATE':
        return <Badge variant="warning" size="sm">Late Arrival</Badge>;
      case 'EARLY_DEPARTURE':
        return <Badge variant="warning" size="sm">Early Exit</Badge>;
      case 'ABSENT':
        return <Badge variant="danger" size="sm">Absent</Badge>;
      case 'ON_LEAVE':
      case 'SICK_LEAVE':
        return <Badge variant="info" size="sm">On Leave</Badge>;
      case 'OFF_DAY':
      case 'REST_DAY':
        return <Badge variant="neutral" size="sm">Off Day</Badge>;
      case 'PUBLIC_HOLIDAY':
        return <Badge variant="gold" size="sm">Holiday</Badge>;
      case 'MISSING_CLOCK_OUT':
        return <Badge variant="danger" size="sm">Missing Clock Out</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{status}</Badge>;
    }
  };

  const getApprovalBadge = (approval: string) => {
    switch (approval) {
      case 'APPROVED':
        return <Badge variant="success" size="sm">Approved</Badge>;
      case 'LOCKED':
        return <Badge variant="gold" size="sm">Locked</Badge>;
      case 'SUBMITTED':
        return <Badge variant="neutral" size="sm">Submitted</Badge>;
      case 'REJECTED':
        return <Badge variant="danger" size="sm">Rejected</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{approval}</Badge>;
    }
  };

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'HR Management', href: '/hr/employees' },
          { label: 'Attendance & Time Management' },
        ]}
      />

      {/* Notification */}
      {notification && (
        <div
          style={{
            padding: '0.875rem 1.25rem',
            borderRadius: '8px',
            marginBottom: '1.25rem',
            backgroundColor: notification.type === 'success' ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${notification.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
            color: notification.type === 'success' ? '#065f46' : '#991b1b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Header Banner */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0f1c3f' }}>
              Attendance &amp; Time Management
            </h1>
            <Badge variant="gold" size="sm">
              Phase 4 Live
            </Badge>
          </div>
          <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Accurate daily logs, overnight guard shifts, late arrival calculations, and payroll-verified approval workflow.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link href="/attendance/roster" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm" leftIcon={<Calendar size={14} />}>
              Visual Roster
            </Button>
          </Link>
          <Link href="/attendance/shifts" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm" leftIcon={<Clock size={14} />}>
              Shift Catalog
            </Button>
          </Link>
          <Link href="/attendance/import" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm" leftIcon={<Upload size={14} />}>
              CSV Import
            </Button>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Lock size={14} />}
            onClick={() => setShowLockModal(true)}
          >
            Lock Period
          </Button>
        </div>
      </div>

      {/* Quick Clock-In / Out Action Card & Live Status */}
      <div
        style={{
          backgroundColor: '#0f1c3f',
          color: '#ffffff',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              backgroundColor: 'rgba(212, 163, 75, 0.2)',
              color: 'var(--corp-gold-400)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Clock size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
              Duty Station Clocking Terminal &bull; {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
            <div style={{ fontSize: '1.125rem', fontWeight: 800, marginTop: '0.15rem' }}>
              {todayStatus?.employee ? `${todayStatus.employee.fullName} (${todayStatus.employee.employeeNumber})` : 'Guard Station Terminal'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.15rem' }}>
              Assigned Shift: <strong>{todayStatus?.activeShift?.name || 'Standard Day Shift (06:00 - 18:00)'}</strong> &bull; Status:{' '}
              <span style={{ color: todayStatus?.isClockedIn ? '#34d399' : '#f59e0b', fontWeight: 600 }}>
                {todayStatus?.isClockedIn ? `Clocked IN at ${new Date(todayStatus.record.actualClockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : todayStatus?.isClockedOut ? `Shift Completed` : 'Not Clocked In'}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button
            variant="primary"
            size="md"
            disabled={isClocking || todayStatus?.isClockedIn}
            onClick={() => handleQuickClock('CLOCK_IN')}
            leftIcon={<CheckCircle2 size={16} />}
          >
            {isClocking ? 'Logging...' : 'Clock In'}
          </Button>
          <Button
            variant="outline"
            size="md"
            disabled={isClocking || !todayStatus?.isClockedIn || todayStatus?.isClockedOut}
            onClick={() => handleQuickClock('CLOCK_OUT')}
            leftIcon={<Clock size={16} />}
            style={{ color: '#ffffff', borderColor: 'rgba(255,255,255,0.3)' }}
          >
            {isClocking ? 'Logging...' : 'Clock Out'}
          </Button>
        </div>
      </div>

      {/* Real Today's Live Attendance Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <Card noPadding>
          <div style={{ padding: '1rem 1.25rem' }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Present Today
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669', marginTop: '0.2rem' }}>
              {stats?.today.present ?? 0}
            </div>
            <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.15rem' }}>
              Active on post
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1rem 1.25rem' }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Late Arrivals
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#d97706', marginTop: '0.2rem' }}>
              {stats?.today.late ?? 0}
            </div>
            <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.15rem' }}>
              Exceeded grace threshold
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1rem 1.25rem' }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Unexcused Absent
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#dc2626', marginTop: '0.2rem' }}>
              {stats?.today.absent ?? 0}
            </div>
            <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.15rem' }}>
              No clock recorded
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1rem 1.25rem' }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              On Leave / Rest
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2563eb', marginTop: '0.2rem' }}>
              {(stats?.today.onLeave ?? 0) + (stats?.today.offDay ?? 0)}
            </div>
            <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.15rem' }}>
              Authorized off days
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1rem 1.25rem' }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Period Overtime
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#7c3aed', marginTop: '0.2rem' }}>
              {stats?.period.totalOvertimeHours ?? 0} hrs
            </div>
            <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.15rem' }}>
              Verified extra hours
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1rem 1.25rem' }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Pending Approvals
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', marginTop: '0.2rem' }}>
              {stats?.period.pendingApprovals ?? 0}
            </div>
            <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.15rem' }}>
              Awaiting HR verification
            </div>
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card noPadding>
        <div style={{ padding: '1.25rem', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'center' }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search guard or employee..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                  fontSize: '0.8125rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  outline: 'none',
                }}
              />
              <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
            </div>

            {/* Date filter */}
            <div>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => {
                  setFilterDate(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.6rem',
                  fontSize: '0.8125rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  outline: 'none',
                }}
              />
            </div>

            {/* Branch Filter */}
            <div>
              <select
                value={filterBranch}
                onChange={(e) => {
                  setFilterBranch(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.6rem',
                  fontSize: '0.8125rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Station Filter */}
            <div>
              <select
                value={filterStation}
                onChange={(e) => {
                  setFilterStation(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.6rem',
                  fontSize: '0.8125rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="">All Stations</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Shift Filter */}
            <div>
              <select
                value={filterShift}
                onChange={(e) => {
                  setFilterShift(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.6rem',
                  fontSize: '0.8125rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="">All Shifts</option>
                {shifts.map((sh) => (
                  <option key={sh.id} value={sh.id}>
                    {sh.name} ({sh.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Attendance Status */}
            <div>
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.6rem',
                  fontSize: '0.8125rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="PRESENT">Present</option>
                <option value="PRESENT_WITH_OVERTIME">Present + Overtime</option>
                <option value="LATE">Late Arrival</option>
                <option value="EARLY_DEPARTURE">Early Departure</option>
                <option value="ABSENT">Absent</option>
                <option value="ON_LEAVE">On Leave</option>
                <option value="OFF_DAY">Off Day</option>
                <option value="MISSING_CLOCK_OUT">Missing Clock Out</option>
              </select>
            </div>

            {/* Approval Status */}
            <div>
              <select
                value={filterApproval}
                onChange={(e) => {
                  setFilterApproval(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.6rem',
                  fontSize: '0.8125rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="ALL">All Approvals</option>
                <option value="SUBMITTED">Submitted (Pending Review)</option>
                <option value="APPROVED">Approved (Payroll Ready)</option>
                <option value="LOCKED">Locked</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedRecordIds.length > 0 && (
          <div
            style={{
              padding: '0.75rem 1.25rem',
              backgroundColor: '#f0fdf4',
              borderBottom: '1px solid #bbf7d0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#166534' }}>
              {selectedRecordIds.length} attendance record(s) selected
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button
                variant="primary"
                size="sm"
                disabled={isApproving}
                onClick={handleBulkApprove}
                leftIcon={<CheckCircle2 size={14} />}
              >
                {isApproving ? 'Approving...' : 'Approve Selected for Payroll'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedRecordIds([])}
              >
                Clear Selection
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700 }}>
                <th style={{ padding: '0.75rem 1rem', width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={
                      records.length > 0 &&
                      selectedRecordIds.length === records.filter((r) => r.approvalStatus !== 'LOCKED').length
                    }
                    onChange={selectAllVisible}
                  />
                </th>
                <th style={{ padding: '0.75rem 1rem' }}>Work Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Employee</th>
                <th style={{ padding: '0.75rem 1rem' }}>Deployment Station</th>
                <th style={{ padding: '0.75rem 1rem' }}>Scheduled Shift</th>
                <th style={{ padding: '0.75rem 1rem' }}>Clock In</th>
                <th style={{ padding: '0.75rem 1rem' }}>Clock Out</th>
                <th style={{ padding: '0.75rem 1rem' }}>Worked Time</th>
                <th style={{ padding: '0.75rem 1rem' }}>Late / OT</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Approval</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={12} style={{ padding: '3rem 1rem', textAlign: 'center' }}>
                    <Spinner size="md" message="Loading attendance records..." />
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748b' }}>
                    No attendance records found matching the current filters.
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const isSelected = selectedRecordIds.includes(r.id);
                  const isLocked = r.approvalStatus === 'LOCKED';
                  const workedHours = Math.round((r.workedMinutes / 60) * 10) / 10;
                  const otHours = Math.round((r.overtimeMinutes / 60) * 10) / 10;

                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: isSelected ? '#f0fdf4' : 'transparent',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <input
                          type="checkbox"
                          disabled={isLocked}
                          checked={isSelected}
                          onChange={() => toggleSelectRecord(r.id)}
                        />
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                        {new Date(r.date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <Link
                          href={`/hr/employees/${r.employee?.id}`}
                          style={{ textDecoration: 'none', color: '#0f172a', fontWeight: 600 }}
                        >
                          {r.employee?.fullName || 'N/A'}
                        </Link>
                        <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>
                          {r.employee?.employeeNumber} &bull; {r.employee?.jobTitle}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                        {r.employee?.station?.name || 'HQ Deployment'}
                        <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>
                          {r.employee?.branch?.name}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                        {r.scheduledShift ? (
                          <>
                            <span>{r.scheduledShift.name}</span>
                            <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>
                              {r.scheduledShift.startTime} - {r.scheduledShift.endTime} {r.scheduledShift.isOvernight && '(Overnight)'}
                            </span>
                          </>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Unscheduled</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: r.actualClockIn ? '#0f172a' : '#94a3b8' }}>
                        {r.actualClockIn
                          ? new Date(r.actualClockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: r.actualClockOut ? '#0f172a' : '#94a3b8' }}>
                        {r.actualClockOut
                          ? new Date(r.actualClockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                        {workedHours > 0 ? `${workedHours} hrs` : '0 hrs'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {r.lateMinutes > 0 && (
                          <span style={{ color: '#d97706', fontSize: '0.6875rem', display: 'block', fontWeight: 600 }}>
                            +{r.lateMinutes}m Late
                          </span>
                        )}
                        {r.overtimeMinutes > 0 && (
                          <span style={{ color: '#059669', fontSize: '0.6875rem', display: 'block', fontWeight: 600 }}>
                            +{otHours}h OT
                          </span>
                        )}
                        {r.lateMinutes === 0 && r.overtimeMinutes === 0 && (
                          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>{getStatusBadge(r.attendanceStatus)}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{getApprovalBadge(r.approvalStatus)}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <Link
                          href={`/attendance/corrections?recordId=${r.id}`}
                          style={{ textDecoration: 'none' }}
                        >
                          <Button variant="ghost" size="sm">
                            Adjust
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Page <strong>{page}</strong> of <strong>{totalPages}</strong>
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              leftIcon={<ChevronLeft size={14} />}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              rightIcon={<ChevronRight size={14} />}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Lock Attendance Period Modal */}
      {showLockModal && (
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
              maxWidth: '480px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
              <div style={{ color: '#d97706' }}>
                <ShieldAlert size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0f172a' }}>
                  Lock Attendance Period
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Lock approved records to prevent modifications for payroll processing
                </span>
              </div>
            </div>

            <form onSubmit={handleLockPeriod}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Year
                    </label>
                    <input
                      type="number"
                      value={lockYear}
                      onChange={(e) => setLockYear(parseInt(e.target.value, 10))}
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Month (1 - 12)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={lockMonth}
                      onChange={(e) => setLockMonth(parseInt(e.target.value, 10))}
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                    Lock Reason / Reference
                  </label>
                  <input
                    type="text"
                    value={lockReason}
                    onChange={(e) => setLockReason(e.target.value)}
                    placeholder="e.g. August 2026 Payroll Run Finalized"
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                    required
                  />
                </div>

                <div
                  style={{
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fef3c7',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    color: '#92400e',
                  }}
                >
                  <strong>Note:</strong> Locking will seal all <strong>APPROVED</strong> attendance records for this month. Once locked, ordinary edits are disabled and any corrections will require formal adjustment approval.
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowLockModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={isLocking}
                    leftIcon={<Lock size={14} />}
                  >
                    {isLocking ? 'Locking...' : 'Confirm & Lock Period'}
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
