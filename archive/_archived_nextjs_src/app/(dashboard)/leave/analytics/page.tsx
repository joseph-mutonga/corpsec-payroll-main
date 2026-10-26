'use client';

import React, { useState, useEffect } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { TrendingUp, Users, CheckCircle2, AlertTriangle, ShieldCheck, PieChart, Activity } from 'lucide-react';

export default function LeaveAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    fetchAnalytics();
  }, [year]);

  const fetchAnalytics = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/leave/analytics?year=${year}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) {
      console.error('Failed to load leave analytics', err);
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

  const { kpis, departmentSummary, leaveTypeBreakdown } = data;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <Breadcrumb
          items={[
            { label: 'Leave Management', href: '/leave' },
            { label: 'Leave Analytics & Insights' },
          ]}
        />
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
          Leave &amp; Absence Analytics
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
          Corporate absenteeism metrics, departmental utilization benchmarks, and leave liability forecasts
        </p>
      </div>

      {/* Analytics KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <Card style={{ borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>APPROVAL RATE</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981', marginTop: '0.25rem' }}>
            {kpis.rates.approvalRate}%
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            {kpis.approvedThisMonth} approved this month
          </div>
        </Card>

        <Card style={{ borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>REJECTION RATE</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ef4444', marginTop: '0.25rem' }}>
            {kpis.rates.rejectionRate}%
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Out of {kpis.rates.totalRequestsYear} submissions
          </div>
        </Card>

        <Card style={{ borderLeft: '4px solid #3b82f6' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>TOTAL DAYS UTILIZED</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#3b82f6', marginTop: '0.25rem' }}>
            {kpis.totalLeaveDaysTaken}d
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Across all personnel
          </div>
        </Card>

        <Card style={{ borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>OUTSTANDING LIABILITY</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#8b5cf6', marginTop: '0.25rem' }}>
            {kpis.totalLeaveDaysRemaining}d
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Unutilized leave balance pool
          </div>
        </Card>
      </div>

      {/* Breakdown Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem' }}>
        <Card title="Department Utilization Rates">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
            {departmentSummary.map((d: any) => (
              <div key={d.departmentId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{d.departmentName}</span>
                  <span style={{ color: '#475569', fontWeight: 600 }}>{d.daysTaken}d taken ({d.utilizationRate}%)</span>
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, d.utilizationRate)}%`,
                      height: '100%',
                      backgroundColor: d.utilizationRate > 75 ? '#ef4444' : d.utilizationRate > 50 ? '#f59e0b' : '#3b82f6',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Leave Volume by Category">
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
                  borderRadius: '0.375rem',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{lt.leaveTypeName}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {lt.approvedRequestsCount} Approved Applications
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>
                  {lt.daysTaken} Days
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
