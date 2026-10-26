'use client';

import React, { useState, useEffect } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import {
  Users,
  UserCheck,
  CalendarDays,
  UserPlus,
  FileSignature,
  Cake,
  ClipboardList,
  AlertTriangle,
  Building2,
  MapPin,
  ArrowRight,
  ShieldCheck,
  Clock,
  Briefcase,
  UserMinus,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';

export default function HRCommandCenterPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/hr/dashboard');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (err) {
      console.error('Failed to load HR dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  const { kpis, upcomingBirthdays, departmentDistribution, stationDistribution, recentActivity } = data;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Breadcrumb items={[{ label: 'Human Resources' }, { label: 'Command Center' }]} />

      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={28} color="#0f1c3f" />
            HR Command Center & Workforce Operations
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
            Real-time workforce intelligence, lifecycle orchestration, contracts, and guard deployments.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/hr/onboarding">
            <Button variant="primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <UserPlus size={16} /> Onboard New Staff
            </Button>
          </Link>
          <Link href="/hr/analytics">
            <Button variant="secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <TrendingUp size={16} /> HR Analytics
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}
      >
        <Card noPadding>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Workforce</span>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#e0e7ff', color: '#3730a3' }}>
                <Users size={18} />
              </div>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f1c3f' }}>{kpis.totalEmployees}</div>
            <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <UserCheck size={14} /> {kpis.activeEmployees} active on duty
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>On Probation</span>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#fef3c7', color: '#b45309' }}>
                <Clock size={18} />
              </div>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f1c3f' }}>{kpis.onProbationEmployees}</div>
            <Link href="/hr/probation" style={{ fontSize: '0.75rem', color: '#b45309', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '0.25rem' }}>
              Review probation pipeline <ArrowRight size={12} />
            </Link>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Expiring Contracts</span>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#fee2e2', color: '#b91c1c' }}>
                <FileSignature size={18} />
              </div>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f1c3f' }}>{kpis.expiringContractsCount}</div>
            <Link href="/hr/contracts" style={{ fontSize: '0.75rem', color: '#b91c1c', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '0.25rem' }}>
              Action renewals in 90d <ArrowRight size={12} />
            </Link>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Pending HR Tickets</span>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#ede9fe', color: '#6d28d9' }}>
                <ClipboardList size={18} />
              </div>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f1c3f' }}>{kpis.pendingHRRequests}</div>
            <Link href="/hr/requests" style={{ fontSize: '0.75rem', color: '#6d28d9', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '0.25rem' }}>
              Open HR Service Desk <ArrowRight size={12} />
            </Link>
          </div>
        </Card>
      </div>

      {/* Second Row KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        <div style={{ padding: '1rem', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <CalendarDays size={22} color="#0284c7" />
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Employees on Leave</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f1c3f' }}>{kpis.onLeaveEmployees}</div>
          </div>
        </div>

        <div style={{ padding: '1rem', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <UserMinus size={22} color="#ea580c" />
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Notice / Exiting Cases</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f1c3f' }}>{kpis.exitingEmployees}</div>
          </div>
        </div>

        <div style={{ padding: '1rem', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <UserPlus size={22} color="#16a34a" />
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>New Hires This Month</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f1c3f' }}>{kpis.newEmployeesThisMonth}</div>
          </div>
        </div>

        <div style={{ padding: '1rem', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AlertTriangle size={22} color="#dc2626" />
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Attendance Exceptions</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f1c3f' }}>{kpis.attendanceExceptionsCount}</div>
          </div>
        </div>
      </div>

      {/* Main Grid: Department & Station Manning + Birthdays & Timeline */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
        {/* Left Column: Department Distribution & Station Manning */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card title="Department Workforce Distribution">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {departmentDistribution.map((dept: any) => {
                const percentage = kpis.totalEmployees > 0 ? Math.round((dept.count / kpis.totalEmployees) * 100) : 0;
                return (
                  <div key={dept.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      <span style={{ color: '#0f1c3f', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Building2 size={14} color="#64748b" /> {dept.name}
                      </span>
                      <span style={{ color: '#64748b' }}>
                        {dept.count} staff ({percentage}%)
                      </span>
                    </div>
                    <div style={{ height: '8px', width: '100%', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${percentage}%`, backgroundColor: '#0f1c3f', borderRadius: '4px' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Guarding Stations & Manning Quota">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {stationDistribution.slice(0, 6).map((st: any) => {
                const isUnderstaffed = st.requiredStaffing > 0 && st.actualCount < st.requiredStaffing;
                return (
                  <div
                    key={st.id}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '8px',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f1c3f', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin size={14} color="#0f1c3f" /> {st.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                        Quota: {st.requiredStaffing} Guards | Deployed: {st.actualCount}
                      </div>
                    </div>
                    <div>
                      {isUnderstaffed ? (
                        <Badge variant="danger" size="sm">Understaffed</Badge>
                      ) : (
                        <Badge variant="success" size="sm">Optimal Manning</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right Column: Upcoming Birthdays & Recent Lifecycle Activity */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card title="Upcoming Employee Birthdays (Next 30 Days)">
            {upcomingBirthdays.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
                No employee birthdays within the next 30 days.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {upcomingBirthdays.map((b: any) => (
                  <div
                    key={b.id}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '8px',
                      backgroundColor: '#fdf4ff',
                      border: '1px solid #f5d0fe',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ padding: '6px', borderRadius: '50%', backgroundColor: '#fae8ff', color: '#c026d3' }}>
                        <Cake size={16} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f1c3f' }}>{b.fullName}</div>
                        <div style={{ fontSize: '0.75rem', color: '#86198f' }}>
                          {b.employeeNumber} • Date: {b.dateOfBirth}
                        </div>
                      </div>
                    </div>
                    <Badge variant="gold" size="sm">
                      {b.daysUntil === 0 ? 'Today! 🎉' : `In ${b.daysUntil} days`}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Recent HR Lifecycle Audit Trail">
            {recentActivity.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
                No recent HR events logged.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {recentActivity.map((act: any) => (
                  <div
                    key={act.id}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '8px',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#0f1c3f' }}>
                        {act.employeeName} ({act.employeeNumber})
                      </span>
                      <Badge variant="neutral" size="sm">{act.changeType}</Badge>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: '0.25rem' }}>
                      {act.description}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                      By {act.performedBy} • {new Date(act.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
