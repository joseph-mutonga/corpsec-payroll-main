'use client';

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Building2,
  Download,
  RefreshCw,
  PieChart,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function AttendanceAnalyticsPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchAnalytics();
  }, [selectedDate]);

  const fetchAnalytics = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/attendance/analytics?date=${selectedDate}`);
      const json = await res.json();
      if (json.success) {
        setAnalytics(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const kpis = analytics?.kpis;
  const deptSummary = analytics?.departmentSummary || [];

  return (
    <div style={{ padding: '2rem' }}>
      <Breadcrumb
        items={[
          { label: 'Attendance', href: '/attendance' },
          { label: 'Attendance Analytics & Trends' },
        ]}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Attendance Analytics & Punctuality Trends
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
            Workforce attendance ratios, tardiness distributions, overtime metrics, and department breakdowns.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
          />
          <Button variant="outline" onClick={fetchAnalytics} leftIcon={<RefreshCw size={16} />}>Refresh</Button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: '4rem', textAlign: 'center' }}>
          <Spinner size="lg" />
          <p style={{ marginTop: '0.5rem', color: '#64748b' }}>Aggregating analytics...</p>
        </div>
      ) : (
        <>
          {/* Top 4 KPI Highlights */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <Card style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 600 }}>ATTENDANCE RATE</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981', marginTop: '0.25rem' }}>
                {kpis?.attendanceRate ?? 100}%
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                {kpis?.presentToday ?? 0} / {kpis?.totalActiveEmployees ?? 0} Active Staff
              </div>
            </Card>

            <Card style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 600 }}>TARDINESS TODAY</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f59e0b', marginTop: '0.25rem' }}>
                {kpis?.lateToday ?? 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Exceeded grace period</div>
            </Card>

            <Card style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 600 }}>TOTAL OVERTIME</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#3b82f6', marginTop: '0.25rem' }}>
                {kpis?.overtimeHoursToday ?? 0}h
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Approved & pending extra hours</div>
            </Card>

            <Card style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 600 }}>UNCLOSED PUNCHES</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ef4444', marginTop: '0.25rem' }}>
                {kpis?.missingClockOut ?? 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Clocked in with no departure</div>
            </Card>
          </div>

          {/* Department Breakdown Matrix */}
          <Card style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>
              Department Attendance & Compliance Breakdown
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Department</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Total Personnel</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Present</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Absent</th>
                    <th style={{ padding: '0.75rem 1rem' }}>On Leave</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Late</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Attendance Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {deptSummary.map((d: any) => (
                    <tr key={d.departmentId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>{d.departmentName}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{d.totalEmployees}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#047857', fontWeight: 600 }}>{d.present}</td>
                      <td style={{ padding: '0.75rem 1rem', color: d.absent > 0 ? '#b91c1c' : '#64748b' }}>{d.absent}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#2563eb' }}>{d.onLeave}</td>
                      <td style={{ padding: '0.75rem 1rem', color: d.late > 0 ? '#b45309' : '#64748b' }}>{d.late}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <Badge variant={d.attendanceRate >= 90 ? 'success' : d.attendanceRate >= 75 ? 'warning' : 'danger'}>
                          {d.attendanceRate}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
