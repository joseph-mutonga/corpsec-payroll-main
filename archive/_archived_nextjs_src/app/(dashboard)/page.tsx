'use client';

import React, { useEffect, useState } from 'react';
import {
  Users,
  Building2,
  Calendar,
  ShieldCheck,
  ArrowRight,
  Settings,
  UserCheck,
  UserX,
  Clock,
  Briefcase,
  GitFork,
  MapPin,
  FileCheck,
  Shield,
  Layers,
  AlertTriangle,
  CalendarDays,
  DollarSign,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import Link from 'next/link';

interface DashboardStats {
  foundationMetrics: {
    totalUsers: number;
    activeUsers: number;
    totalBranches: number;
    activeBranches: number;
    totalDepartments: number;
    activeDepartments: number;
    totalStations: number;
    activeStations: number;
    totalPositions: number;
    activePositions: number;
    unassignedEmployees: number;
    systemStatus: string;
    databaseEngine: string;
    authRegime: string;
  };
  employeeMetrics?: {
    totalEmployees: number;
    activeEmployees: number;
    onLeaveEmployees: number;
    inactiveEmployees: number;
    unassignedEmployees: number;
    totalRequiredGuardQuota: number;
    totalDeployedGuards: number;
    guardingShortage: number;
    departments: Array<{ name: string; code: string; count: number }>;
    branches: Array<{ name: string; code: string; count: number }>;
  };
  attendanceMetrics?: {
    presentToday: number;
    lateToday: number;
    absentToday: number;
    totalRecordedToday: number;
    totalOvertimeHoursToday: number;
    pendingOvertimeClaims: number;
    pendingAttendanceApprovals: number;
  };
  payrollStatus: {
    currentPeriod: string;
    phaseStatus: string;
    statutoryRegime: string;
  };
  company: {
    name: string;
    currency: string;
    timezone: string;
  };
  recentLogs: Array<{
    id: string;
    action: string;
    module: string;
    userEmail: string | null;
    createdAt: string;
  }>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/dashboard/stats');
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <Spinner fullHeight message="Loading system dashboard metrics..." />;
  }

  const f = stats?.foundationMetrics;
  const emp = stats?.employeeMetrics;
  const att = stats?.attendanceMetrics;

  return (
    <div className="animate-fade-in">
      <Breadcrumb items={[{ label: 'Corporate Operations & HR Dashboard' }]} />

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
              CorpSec HR &amp; Payroll Management
            </h1>
            <Badge variant="gold" size="sm">
              Phase 1 - 6 Live
            </Badge>
          </div>
          <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            {stats?.company.name} &bull; Default Currency: <strong>{stats?.company.currency}</strong> &bull; Timezone: <strong>{stats?.company.timezone}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
          <Link href="/payroll" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="sm" leftIcon={<DollarSign size={14} />}>
              Payroll Config
            </Button>
          </Link>
          <Link href="/leave" style={{ textDecoration: 'none' }}>
            <Button variant="secondary" size="sm" leftIcon={<CalendarDays size={14} />}>
              Leave Center
            </Button>
          </Link>
          <Link href="/attendance" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm" leftIcon={<Clock size={14} />}>
              Attendance
            </Button>
          </Link>
        </div>
      </div>

      {/* Phase 4 Live Attendance Operations Metrics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.25rem',
          marginBottom: '1.5rem',
        }}
      >
        {/* Present Today */}
        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Present Today
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#059669', marginTop: '0.25rem' }}>
                {att?.presentToday ?? 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                Active on post today
              </div>
            </div>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '10px',
                backgroundColor: '#ecfdf5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#059669',
              }}
            >
              <UserCheck size={24} />
            </div>
          </div>
        </Card>

        {/* Late Arrivals */}
        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Late Arrivals
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#d97706', marginTop: '0.25rem' }}>
                {att?.lateToday ?? 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                Exceeded grace period
              </div>
            </div>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '10px',
                backgroundColor: '#fffbeb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#d97706',
              }}
            >
              <Clock size={24} />
            </div>
          </div>
        </Card>

        {/* Unexcused Absences */}
        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Unexcused Absences
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#dc2626', marginTop: '0.25rem' }}>
                {att?.absentToday ?? 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                No clock-in recorded
              </div>
            </div>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '10px',
                backgroundColor: '#fef2f2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#dc2626',
              }}
            >
              <UserX size={24} />
            </div>
          </div>
        </Card>

        {/* Pending Approvals & Overtime */}
        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Pending Approvals
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#7c3aed', marginTop: '0.25rem' }}>
                {(att?.pendingAttendanceApprovals ?? 0) + (att?.pendingOvertimeClaims ?? 0)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                Attendance &amp; Overtime
              </div>
            </div>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '10px',
                backgroundColor: '#f5f3ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#7c3aed',
              }}
            >
              <FileCheck size={24} />
            </div>
          </div>
        </Card>
      </div>

      {/* Organizational Structure Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.25rem',
          marginBottom: '1.5rem',
        }}
      >
        {/* Card 1: Active Personnel */}
        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total Personnel
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f1c3f', marginTop: '0.25rem' }}>
                {emp?.activeEmployees ?? 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.25rem' }}>
                Total: {emp?.totalEmployees ?? 0} records
              </div>
            </div>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '10px',
                backgroundColor: '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563eb',
              }}
            >
              <Users size={24} />
            </div>
          </div>
        </Card>

        {/* Card 2: Operating Branches */}
        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Operating Branches
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f1c3f', marginTop: '0.25rem' }}>
                {f?.activeBranches ?? 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                Regional hubs
              </div>
            </div>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '10px',
                backgroundColor: '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#d97706',
              }}
            >
              <Building2 size={24} />
            </div>
          </div>
        </Card>

        {/* Card 3: Guarding Stations */}
        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Guarding Stations
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f1c3f', marginTop: '0.25rem' }}>
                {f?.activeStations ?? 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                Client deployment posts
              </div>
            </div>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '10px',
                backgroundColor: '#ecfdf5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#059669',
              }}
            >
              <MapPin size={24} />
            </div>
          </div>
        </Card>

        {/* Card 4: Guard Quota Deficit / Shortage */}
        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Guard Quota Shortage
              </span>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 800,
                  color: (emp?.guardingShortage ?? 0) > 0 ? '#d97706' : '#059669',
                  marginTop: '0.25rem',
                }}
              >
                {(emp?.guardingShortage ?? 0) > 0 ? `-${emp?.guardingShortage}` : 'Full Quota'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                Deployed: {emp?.totalDeployedGuards ?? 0} / Quota: {emp?.totalRequiredGuardQuota ?? 0}
              </div>
            </div>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '10px',
                backgroundColor: (emp?.guardingShortage ?? 0) > 0 ? '#fffbeb' : '#ecfdf5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: (emp?.guardingShortage ?? 0) > 0 ? '#d97706' : '#059669',
              }}
            >
              <Shield size={24} />
            </div>
          </div>
        </Card>
      </div>

      {/* Two Column Layout: Department & Branch Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Department Breakdown Card */}
        <Card
          title="Headcount by Department"
          subtitle="Real-time personnel deployment across business divisions"
          action={
            <Link href="/hr/departments" style={{ textDecoration: 'none' }}>
              <Button variant="ghost" size="sm" rightIcon={<ArrowRight size={13} />}>
                Departments
              </Button>
            </Link>
          }
        >
          {emp?.departments && emp.departments.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {emp.departments.map((dept, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <GitFork size={16} color="#0f1c3f" />
                    <div>
                      <strong style={{ fontSize: '0.8125rem', color: '#0f172a' }}>{dept.name}</strong>
                      <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>{dept.code}</span>
                    </div>
                  </div>
                  <Badge variant="gold" size="sm">
                    {dept.count} Staff
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#64748b', fontSize: '0.875rem', textAlign: 'center', padding: '1.5rem 0' }}>
              No department data available.
            </p>
          )}
        </Card>

        {/* Branch Breakdown Card */}
        <Card
          title="Headcount by Operating Branch"
          subtitle="Regional deployment across Kenya operational hubs"
          action={
            <Link href="/hr/branches" style={{ textDecoration: 'none' }}>
              <Button variant="ghost" size="sm" rightIcon={<ArrowRight size={13} />}>
                Branches
              </Button>
            </Link>
          }
        >
          {emp?.branches && emp.branches.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {emp.branches.map((br, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <Building2 size={16} color="#0f1c3f" />
                    <div>
                      <strong style={{ fontSize: '0.8125rem', color: '#0f172a' }}>{br.name}</strong>
                      <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>{br.code}</span>
                    </div>
                  </div>
                  <Badge variant="neutral" size="sm">
                    {br.count} Personnel
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#64748b', fontSize: '0.875rem', textAlign: 'center', padding: '1.5rem 0' }}>
              No branch deployment data available.
            </p>
          )}
        </Card>
      </div>

      {/* Two Column Layout: Architecture Status and Real-Time Audit Log */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
        {/* Left Card: Architecture & Attendance Status */}
        <Card
          title="Time & Attendance Engine Status"
          subtitle="Kenya statutory compliance, overnight guard shifts, & locked payroll readiness"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div style={{ marginTop: '2px', color: '#059669' }}>
                <ShieldCheck size={18} />
              </div>
              <div>
                <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>
                  Overnight Guard Shifts &amp; Time Calculation Engine
                </strong>
                <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                  Evaluates overnight shifts across midnight, grace periods, late arrivals, early exits, unpaid breaks, and verified overtime hours.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div style={{ marginTop: '2px', color: '#059669' }}>
                <ShieldCheck size={18} />
              </div>
              <div>
                <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>
                  Gazetted Kenya Public Holidays &amp; Absence Classification
                </strong>
                <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                  Distinguishes Off Days, Rest Days, Public Holidays, and Authorized Leaves from unexcused absences.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div style={{ marginTop: '2px', color: '#059669' }}>
                <ShieldCheck size={18} />
              </div>
              <div>
                <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>
                  Dual-Stage Approval &amp; Period Locking Workflow
                </strong>
                <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                  Attendance records transition from Draft &rarr; Approved &rarr; Locked. Locked records are sealed for payroll and require formal adjustment requests.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Right Card: Recent Audit Trail */}
        <Card
          title="Recent Administrative & Audit Trail"
          subtitle="Real-time security, attendance, and organizational events"
          action={
            <Link href="/audit-logs" style={{ textDecoration: 'none' }}>
              <Button variant="ghost" size="sm" rightIcon={<ArrowRight size={14} />}>
                View All
              </Button>
            </Link>
          }
        >
          {stats?.recentLogs && stats.recentLogs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {stats.recentLogs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    padding: '0.625rem 0.75rem',
                    backgroundColor: '#f8fafc',
                    borderRadius: '6px',
                    border: '1px solid #f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Badge variant="neutral" size="sm">
                        {log.module}
                      </Badge>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0f172a' }}>
                        {log.action}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem', display: 'block' }}>
                      By: {log.userEmail || 'System'}
                    </span>
                  </div>

                  <span style={{ fontSize: '0.6875rem', color: '#94a3b8', flexShrink: 0 }}>
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '0.875rem', color: '#64748b', textAlign: 'center', padding: '1.5rem 0' }}>
              No audit records found.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
