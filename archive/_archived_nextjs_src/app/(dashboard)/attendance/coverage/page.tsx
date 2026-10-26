'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  MapPin,
  RefreshCw,
  Building2,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function StationCoveragePage() {
  const [coverageData, setCoverageData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchCoverage();
  }, [selectedDate]);

  const fetchCoverage = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/attendance/coverage?date=${selectedDate}`);
      const json = await res.json();
      if (json.success) {
        setCoverageData(json.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string, percentage: number) => {
    if (percentage >= 100) return <Badge variant="success">OPTIMAL (100%)</Badge>;
    if (percentage >= 80) return <Badge variant="warning">ADEQUATE ({percentage}%)</Badge>;
    if (percentage >= 50) return <Badge variant="warning">UNDERSTAFFED ({percentage}%)</Badge>;
    return <Badge variant="danger">CRITICAL ({percentage}%)</Badge>;
  };

  return (
    <div style={{ padding: '2rem' }}>
      <Breadcrumb
        items={[
          { label: 'Attendance', href: '/attendance' },
          { label: 'Guarding Station Coverage Matrix' },
        ]}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Guarding Station Coverage Matrix
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
            Real-time security post coverage calculation: Present guards vs contractual required staffing.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
          />
          <Button variant="outline" onClick={fetchCoverage} leftIcon={<RefreshCw size={16} />}>Refresh</Button>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="lg" />
            <p style={{ marginTop: '0.5rem', color: '#64748b' }}>Evaluating station coverage...</p>
          </div>
        ) : coverageData.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            <Building2 size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
            <p style={{ fontWeight: 600, margin: 0 }}>No active security stations configured.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Station Code</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Station Name</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Branch</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Required</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Scheduled</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Present</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Missing</th>
                  <th style={{ padding: '0.75rem 1rem' }}>On Leave</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Coverage Status</th>
                </tr>
              </thead>
              <tbody>
                {coverageData.map((c) => (
                  <tr key={c.stationId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600 }}>{c.stationCode}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>{c.stationName}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.branchName || 'N/A'}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>{c.requiredPersonnel}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.scheduledPersonnel}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#047857' }}>{c.presentPersonnel}</td>
                    <td style={{ padding: '0.75rem 1rem', color: c.missingPersonnel > 0 ? '#b91c1c' : '#64748b', fontWeight: c.missingPersonnel > 0 ? 700 : 400 }}>
                      {c.missingPersonnel}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.onLeavePersonnel}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {getStatusBadge(c.status, c.coveragePercentage)}
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
