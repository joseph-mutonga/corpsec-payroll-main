'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import {
  CalendarDays,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Users,
  TrendingUp,
  FileText,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  Building2,
  UserCheck,
  AlertTriangle,
  RotateCcw,
  CheckSquare,
  FileSpreadsheet,
  Activity,
  Award,
} from 'lucide-react';

export default function LeaveDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    fetchDashboardData();
  }, [year]);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/leave/dashboard?year=${year}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (err) {
      console.error('Error loading leave dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  const { kpis, departmentSummary, leaveTypeBreakdown, returningSoon } = data;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <Breadcrumb
            items={[
              { label: 'HR Management', href: '/hr' },
              { label: 'Leave, Time-Off & Absence', href: '/leave' },
            ]}
          />
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
            Leave &amp; Absence Command Center
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
            Centralized Kenyan corporate leave management, automated working-day arithmetic, attendance synchronization &amp; compliance
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link href="/leave/requests">
            <Button variant="outline" size="sm">
              <FileText size={16} style={{ marginRight: '0.5rem' }} /> All Requests
            </Button>
          </Link>
          <Link href="/leave/approvals">
            <Button variant="outline" size="sm">
              <CheckSquare size={16} style={{ marginRight: '0.5rem' }} /> Approvals Desk
              {kpis.pendingRequests > 0 && (
                <Badge variant="warning" size="sm" style={{ marginLeft: '0.5rem' }}>
                  {kpis.pendingRequests}
                </Badge>
              )}
            </Button>
          </Link>
          <Link href="/leave/calendar">
            <Button variant="outline" size="sm">
              <Calendar size={16} style={{ marginRight: '0.5rem' }} /> Leave Calendar
            </Button>
          </Link>
          <Link href="/employee/leave/request">
            <Button variant="primary" size="sm">
              <Plus size={16} style={{ marginRight: '0.5rem' }} /> Apply for Leave
            </Button>
          </Link>
        </div>
      </div>

      {/* Top 8 KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        {/* 1. On Leave Today */}
        <Card style={{ borderLeft: '4px solid #3b82f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                On Leave Today
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                {kpis.employeesOnLeaveToday}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Activity size={12} /> Active workforce off-duty
              </div>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: '#eff6ff', borderRadius: '50%', color: '#3b82f6' }}>
              <Users size={24} />
            </div>
          </div>
        </Card>

        {/* 2. Pending Approvals */}
        <Card style={{ borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Pending Requests
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                {kpis.pendingRequests}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.25rem' }}>
                {kpis.requestsRequiringHrAction} requiring HR action
              </div>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: '#fffbeb', borderRadius: '50%', color: '#f59e0b' }}>
              <Clock size={24} />
            </div>
          </div>
        </Card>

        {/* 3. Approved This Month */}
        <Card style={{ borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Approved This Month
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                {kpis.approvedThisMonth}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '0.25rem' }}>
                {kpis.rates.approvalRate}% approval rate
              </div>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: '#ecfdf5', borderRadius: '50%', color: '#10b981' }}>
              <CheckCircle2 size={24} />
            </div>
          </div>
        </Card>

        {/* 4. Upcoming Leave (14d) */}
        <Card style={{ borderLeft: '4px solid #6366f1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Upcoming Leave (14d)
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                {kpis.upcomingLeave}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6366f1', marginTop: '0.25rem' }}>
                Scheduled shift covers
              </div>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: '#eef2ff', borderRadius: '50%', color: '#6366f1' }}>
              <CalendarDays size={24} />
            </div>
          </div>
        </Card>

        {/* 5. Returning Soon (7d) */}
        <Card style={{ borderLeft: '4px solid #06b6d4' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Returning Soon (7d)
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                {kpis.employeesReturningSoon}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#06b6d4', marginTop: '0.25rem' }}>
                Expected back on duty
              </div>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: '#ecfeff', borderRadius: '50%', color: '#06b6d4' }}>
              <UserCheck size={24} />
            </div>
          </div>
        </Card>

        {/* 6. Leave Days Taken */}
        <Card style={{ borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Days Taken (YTD)
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                {kpis.totalLeaveDaysTaken}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#8b5cf6', marginTop: '0.25rem' }}>
                Year {year} aggregate
              </div>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: '#f5f3ff', borderRadius: '50%', color: '#8b5cf6' }}>
              <TrendingUp size={24} />
            </div>
          </div>
        </Card>

        {/* 7. Days Remaining */}
        <Card style={{ borderLeft: '4px solid #14b8a6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Days Remaining
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                {kpis.totalLeaveDaysRemaining}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#14b8a6', marginTop: '0.25rem' }}>
                Unutilized balance pool
              </div>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: '#f0fdfa', borderRadius: '50%', color: '#14b8a6' }}>
              <ShieldCheck size={24} />
            </div>
          </div>
        </Card>

        {/* 8. Open / Unclosed Absences */}
        <Card style={{ borderLeft: `4px solid ${kpis.unclosedAbsences > 0 ? '#ef4444' : '#10b981'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Unclosed Absences
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: kpis.unclosedAbsences > 0 ? '#ef4444' : '#0f172a', marginTop: '0.25rem' }}>
                {kpis.unclosedAbsences}
              </div>
              <div style={{ fontSize: '0.75rem', color: kpis.unclosedAbsences > 0 ? '#ef4444' : '#10b981', marginTop: '0.25rem' }}>
                {kpis.unclosedAbsences > 0 ? 'Action required' : 'All incidents resolved'}
              </div>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: kpis.unclosedAbsences > 0 ? '#fef2f2' : '#ecfdf5', borderRadius: '50%', color: kpis.unclosedAbsences > 0 ? '#ef4444' : '#10b981' }}>
              <AlertTriangle size={24} />
            </div>
          </div>
        </Card>
      </div>

      {/* Main Grid Sections */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '1.5rem' }}>
        {/* Department Utilization Breakdown */}
        <Card
          title="Department Leave Utilization &amp; Balances"
          subtitle={`Workforce leave consumption across departments for Leave Year ${year}`}
          action={
            <Link href="/leave/reports">
              <Button variant="outline" size="sm">
                Full Report <ArrowRight size={14} style={{ marginLeft: '0.25rem' }} />
              </Button>
            </Link>
          }
        >
          <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 700 }}>Department</th>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 700, textAlign: 'center' }}>Staff</th>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 700, textAlign: 'right' }}>Days Taken</th>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 700, textAlign: 'right' }}>Remaining</th>
                  <th style={{ padding: '0.625rem 0.75rem', fontWeight: 700, textAlign: 'right' }}>Utilization</th>
                </tr>
              </thead>
              <tbody>
                {departmentSummary.map((d: any) => (
                  <tr key={d.departmentId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: '#0f172a' }}>
                      {d.departmentName}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', textAlign: 'center', color: '#64748b' }}>
                      {d.employeeCount}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                      {d.daysTaken}d
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', color: '#059669', fontWeight: 600 }}>
                      {d.daysRemaining}d
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <div style={{ width: '60px', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(100, d.utilizationRate)}%`,
                              height: '100%',
                              backgroundColor: d.utilizationRate > 75 ? '#ef4444' : d.utilizationRate > 50 ? '#f59e0b' : '#3b82f6',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>
                          {d.utilizationRate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Leave Type Breakdown */}
        <Card
          title="Leave Type Distribution"
          subtitle="Approved leave volume and days consumed by category"
          action={
            <Link href="/leave/types">
              <Button variant="outline" size="sm">
                Manage Types <ArrowRight size={14} style={{ marginLeft: '0.25rem' }} />
              </Button>
            </Link>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
            {leaveTypeBreakdown.map((lt: any) => (
              <div
                key={lt.leaveTypeId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: lt.color || '#3b82f6',
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>{lt.leaveTypeName}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {lt.isPaid ? 'Paid Leave' : 'Unpaid Leave'} &bull; {lt.approvedRequestsCount} Approved Request(s)
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>{lt.daysTaken}d</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Days Taken</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Returning Soon / Overdue Absences Table */}
      <Card
        title="Staff Returning to Duty (Next 7 Days)"
        subtitle="Expected return schedule for personnel currently off-duty"
        action={
          <Link href="/leave/team">
            <Button variant="outline" size="sm">
              Team Availability <ArrowRight size={14} style={{ marginLeft: '0.25rem' }} />
            </Button>
          </Link>
        }
      >
        {returningSoon.length === 0 ? (
          <p style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic', padding: '1rem 0' }}>
            No staff scheduled to return from leave within the next 7 days.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700 }}>Request #</th>
                  <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700 }}>Department</th>
                  <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700 }}>Leave Type</th>
                  <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700 }}>Expected Return</th>
                  <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {returningSoon.map((r: any) => (
                  <tr key={r.requestId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.625rem 0.875rem', fontFamily: 'monospace', fontWeight: 700, color: '#3b82f6' }}>
                      {r.requestNumber}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', fontWeight: 600, color: '#0f172a' }}>
                      {r.employee.fullName}
                      <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b' }}>
                        {r.employee.employeeNumber}
                      </span>
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', color: '#64748b' }}>
                      {r.employee.department?.name || 'General'}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem' }}>
                      <Badge variant="neutral" size="sm">
                        {r.leaveType.name}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', fontWeight: 600, color: '#0f172a' }}>
                      {new Date(r.expectedReturnDate).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', textAlign: 'center' }}>
                      <Badge variant={r.returnStatus === 'LATE' ? 'danger' : r.returnStatus === 'RETURNED' ? 'success' : 'info'} size="sm">
                        {r.returnStatus}
                      </Badge>
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
