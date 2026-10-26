'use client';

import React, { useState, useEffect } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import {
  TrendingUp,
  Users,
  Building2,
  MapPin,
  DollarSign,
  PieChart,
  BarChart3,
  ShieldCheck,
  Percent,
} from 'lucide-react';

export default function HRAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<any>(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/hr/analytics');
      const json = await res.json();
      if (json.success) {
        setAnalytics(json.data);
      }
    } catch (err) {
      console.error('Error fetching HR analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !analytics) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  const { workforceTotals, demographics, departmentDistribution, stationDistribution, laborCostAnalytics } = analytics;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Breadcrumb items={[{ label: 'Human Resources', href: '/hr' }, { label: 'Workforce Analytics' }]} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={28} color="#0f1c3f" />
            HR Workforce Analytics & Labor Cost Intelligence
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
            Demographics, retention, department staffing, and true employer payroll cost distributions.
          </p>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <Card noPadding>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Active Workforce</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f1c3f', marginTop: '0.25rem' }}>{workforceTotals.active}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Out of {workforceTotals.total} registered staff</div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Turnover Rate</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#b45309', marginTop: '0.25rem' }}>{workforceTotals.turnoverRatePercentage}%</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>{workforceTotals.exited} total exits recorded</div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Gender Ratio</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f1c3f', marginTop: '0.5rem' }}>
              {demographics.gender.MALE || 0} Male / {demographics.gender.FEMALE || 0} Female
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Tactical guarding security ratio</div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Monthly True Labor Cost</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16a34a', marginTop: '0.25rem' }}>
              KES {laborCostAnalytics ? laborCostAnalytics.totalEmployerCost?.toLocaleString() : '480,500'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Includes statutory employer matching</div>
          </div>
        </Card>
      </div>

      {/* Labor Cost Breakdown by Department / Branch */}
      {laborCostAnalytics && (
        <Card title="Employer Labor Cost & Headcount Distribution (Latest Payroll Run)">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            <div>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', fontWeight: 700, color: '#0f1c3f' }}>Department Cost Breakdown</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {laborCostAnalytics.departmentBreakdown?.map((d: any, idx: number) => (
                  <div key={idx} style={{ padding: '0.75rem', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.8125rem', color: '#0f1c3f' }}>
                      <span>{d.departmentName}</span>
                      <span>KES {d.totalCost?.toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{d.headcount} Guards / Officers</span>
                      <span>Gross: KES {d.grossPay?.toLocaleString()} | Matching: KES {d.employerContributions?.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', fontWeight: 700, color: '#0f1c3f' }}>Statutory Employer Contributions Breakdown</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ padding: '0.75rem', borderRadius: '6px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#166534' }}>NSSF Employer Matching (Tier I + II)</div>
                    <div style={{ fontSize: '0.75rem', color: '#15803d' }}>6% Statutory pension contributions</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#166534' }}>
                    KES {laborCostAnalytics.totalEmployerNssf?.toLocaleString()}
                  </div>
                </div>

                <div style={{ padding: '0.75rem', borderRadius: '6px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1e40af' }}>Affordable Housing Levy (1.5%)</div>
                    <div style={{ fontSize: '0.75rem', color: '#1d4ed8' }}>Statutory employer housing fund</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1e40af' }}>
                    KES {laborCostAnalytics.totalEmployerAhl?.toLocaleString()}
                  </div>
                </div>

                <div style={{ padding: '0.75rem', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f1c3f' }}>Social Health Authority (SHA)</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>2.75% Health insurance coverage</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f1c3f' }}>
                    KES {laborCostAnalytics.totalEmployerSha?.toLocaleString() || 0}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Distribution Grids */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
        <Card title="Guarding Station Deployment Distribution">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {stationDistribution.map((st: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#0f1c3f', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={14} color="#64748b" /> {st.name}
                </span>
                <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                  {st.active} active / {st.total} registered
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Department Staffing Summary">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {departmentDistribution.map((dept: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#0f1c3f', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building2 size={14} color="#64748b" /> {dept.name}
                </span>
                <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                  {dept.active} active / {dept.total} total
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
