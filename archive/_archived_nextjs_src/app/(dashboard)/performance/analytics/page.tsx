'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Award,
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
} from 'lucide-react';

interface AnalyticsData {
  kpis: {
    totalEmployeesInReview: number;
    reviewsCompleted: number;
    reviewsPending: number;
    selfAssessmentsPending: number;
    managerReviewsPending: number;
    averagePerformanceScore: number;
    employeesRequiringPips: number;
    overdueReviews: number;
    completionRate: number;
    goalCompletionRate: number;
  };
  ratingDistribution: Record<string, number>;
  departmentSummary: Array<{
    id: string;
    code: string;
    name: string;
    totalEmployees: number;
    employeesReviewed: number;
    averageScore: number;
    reviewCompletionPercentage: number;
    goalCompletionPercentage: number;
  }>;
}

export default function PerformanceAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/performance/dashboard');
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (e) {
      console.error('Failed to load analytics:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <BarChart3 className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Workforce Performance Analytics</h1>
              <p className="text-sm text-zinc-400 mt-0.5">
                Appraisal score distributions, operational unit comparisons & competency trends
              </p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-amber-500/20 border-t-amber-500"></div>
          <p className="text-sm text-zinc-500 mt-3 font-medium">Aggregating performance metrics...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top KPI Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80">
              <p className="text-xs font-semibold text-zinc-400 uppercase">Average Score</p>
              <p className="text-2xl font-bold text-amber-400 mt-1 font-mono">
                {data?.kpis.averagePerformanceScore ? `${data.kpis.averagePerformanceScore} / 5.0` : 'N/A'}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Across all completed reviews</p>
            </div>

            <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80">
              <p className="text-xs font-semibold text-zinc-400 uppercase">Review Completion</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1 font-mono">
                {data?.kpis.completionRate ?? 0}%
              </p>
              <p className="text-xs text-zinc-500 mt-1">{data?.kpis.reviewsCompleted} of {data?.kpis.totalEmployeesInReview} finished</p>
            </div>

            <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80">
              <p className="text-xs font-semibold text-zinc-400 uppercase">Goal Success Rate</p>
              <p className="text-2xl font-bold text-blue-400 mt-1 font-mono">
                {data?.kpis.goalCompletionRate ?? 0}%
              </p>
              <p className="text-xs text-zinc-500 mt-1">SMART goals marked complete</p>
            </div>

            <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80">
              <p className="text-xs font-semibold text-zinc-400 uppercase">PIP Intervention</p>
              <p className="text-2xl font-bold text-rose-400 mt-1 font-mono">
                {data?.kpis.employeesRequiringPips ?? 0}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Underactive scores requiring plans</p>
            </div>
          </div>

          {/* Bell Curve Rating Distribution */}
          <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 space-y-4">
            <h3 className="text-base font-bold text-white">Workforce Rating Distribution (1–5 Bell Curve)</h3>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-2">
              {[
                { label: '5 — Outstanding', key: 'Outstanding', color: 'from-emerald-600 to-emerald-400', bg: 'bg-emerald-950/20 border-emerald-800/40' },
                { label: '4 — Exceeds', key: 'Exceeds Expectations', color: 'from-teal-600 to-teal-400', bg: 'bg-teal-950/20 border-teal-800/40' },
                { label: '3 — Meets', key: 'Meets Expectations', color: 'from-blue-600 to-blue-400', bg: 'bg-blue-950/20 border-blue-800/40' },
                { label: '2 — Needs Imp.', key: 'Needs Improvement', color: 'from-amber-600 to-amber-400', bg: 'bg-amber-950/20 border-amber-800/40' },
                { label: '1 — Does Not Meet', key: 'Does Not Meet Expectations', color: 'from-rose-600 to-rose-400', bg: 'bg-rose-950/20 border-rose-800/40' },
              ].map((tier) => {
                const count = data?.ratingDistribution[tier.key] || 0;
                const total = data?.kpis.reviewsCompleted || 1;
                const pct = Math.round((count / (total > 0 ? total : 1)) * 100);

                return (
                  <div key={tier.key} className={`p-4 rounded-xl border ${tier.bg} text-center space-y-2`}>
                    <p className="text-xs font-semibold text-zinc-300">{tier.label}</p>
                    <p className="text-2xl font-bold text-white font-mono">{count}</p>
                    <p className="text-xs text-zinc-400 font-mono">{pct}% of total</p>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full bg-gradient-to-r ${tier.color} rounded-full`} style={{ width: `${Math.max(pct, count > 0 ? 5 : 0)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
