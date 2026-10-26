'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Award,
  Target,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  ChevronRight,
  TrendingUp,
  FileCheck,
  PlusCircle,
  Briefcase,
  ShieldCheck,
  Layers,
  ArrowUpRight,
} from 'lucide-react';

interface PerformanceData {
  activeCycle: {
    id: string;
    code: string;
    name: string;
    status: string;
    startDate: string;
    endDate: string;
    selfAssessmentDeadline: string;
    managerReviewDeadline: string;
    reviewDeadline: string;
  } | null;
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

export default function PerformanceCommandCenterPage() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/performance/dashboard');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (e) {
      console.error('Failed to load performance dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string }> = {
      DRAFT: { bg: 'bg-zinc-800', text: 'text-zinc-400' },
      OPEN: { bg: 'bg-emerald-950/60 border border-emerald-800/60', text: 'text-emerald-400' },
      SELF_ASSESSMENT: { bg: 'bg-blue-950/60 border border-blue-800/60', text: 'text-blue-400' },
      MANAGER_REVIEW: { bg: 'bg-purple-950/60 border border-purple-800/60', text: 'text-purple-400' },
      CALIBRATION: { bg: 'bg-amber-950/60 border border-amber-800/60', text: 'text-amber-400' },
      COMPLETED: { bg: 'bg-teal-950/60 border border-teal-800/60', text: 'text-teal-400' },
      ARCHIVED: { bg: 'bg-zinc-900 border border-zinc-700', text: 'text-zinc-500' },
    };
    const s = map[status] || { bg: 'bg-zinc-800', text: 'text-zinc-300' };
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${s.bg} ${s.text}`}>
        {status.replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <Award className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Performance Command Center
              </h1>
              <p className="text-sm text-zinc-400 mt-0.5">
                Strategic workforce appraisals, SMART goals, KPI tracking & talent development
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/performance/cycles"
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-xl border border-zinc-700 transition"
          >
            <Calendar className="w-4 h-4 text-zinc-400" />
            Manage Cycles
          </Link>
          <Link
            href="/performance/reviews"
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition"
          >
            <CheckCircle2 className="w-4 h-4" />
            Appraisal Desk
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-amber-500/20 border-t-amber-500"></div>
          <p className="text-sm text-zinc-500 mt-3 font-medium">Aggregating workforce performance metrics...</p>
        </div>
      ) : (
        <>
          {/* Active Cycle Banner */}
          {data?.activeCycle ? (
            <div className="bg-gradient-to-br from-zinc-900/90 via-zinc-900/50 to-zinc-900/90 rounded-2xl border border-zinc-800/80 p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                      {data.activeCycle.code}
                    </span>
                    {getStatusBadge(data.activeCycle.status)}
                  </div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    {data.activeCycle.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-6 text-xs text-zinc-400 pt-1">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                      Cycle Window: {new Date(data.activeCycle.startDate).toLocaleDateString()} —{' '}
                      {new Date(data.activeCycle.endDate).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-400" />
                      Self-Assessment Due: {new Date(data.activeCycle.selfAssessmentDeadline).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-purple-400" />
                      Manager Review Due: {new Date(data.activeCycle.managerReviewDeadline).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-6 bg-black/40 p-4 rounded-xl border border-zinc-800">
                  <div className="text-center">
                    <p className="text-xs text-zinc-400 font-medium">Completion</p>
                    <p className="text-2xl font-bold text-emerald-400 mt-0.5">
                      {data.kpis.completionRate}%
                    </p>
                  </div>
                  <div className="h-10 w-px bg-zinc-800" />
                  <div className="text-center">
                    <p className="text-xs text-zinc-400 font-medium">Goal Success</p>
                    <p className="text-2xl font-bold text-blue-400 mt-0.5">
                      {data.kpis.goalCompletionRate}%
                    </p>
                  </div>
                  <div className="h-10 w-px bg-zinc-800" />
                  <div className="text-center">
                    <p className="text-xs text-zinc-400 font-medium">Avg Score</p>
                    <p className="text-2xl font-bold text-amber-400 mt-0.5">
                      {data.kpis.averagePerformanceScore > 0 ? `${data.kpis.averagePerformanceScore} / 5` : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 text-center">
              <p className="text-zinc-400 text-sm">No active performance appraisal cycle is currently running.</p>
              <Link
                href="/performance/cycles"
                className="inline-flex items-center gap-2 mt-3 text-sm text-amber-400 hover:text-amber-300 font-semibold"
              >
                Create or open a cycle <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}

          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">In Review</p>
                <Users className="w-4 h-4 text-zinc-500" />
              </div>
              <p className="text-2xl font-bold text-white mt-2">
                {data?.kpis.totalEmployeesInReview ?? 0}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Total active personnel in appraisal</p>
            </div>

            <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Completed</p>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-emerald-400 mt-2">
                {data?.kpis.reviewsCompleted ?? 0}
              </p>
              <p className="text-xs text-emerald-500/70 mt-1">
                {data?.kpis.completionRate ?? 0}% workflow completion
              </p>
            </div>

            <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Pending Self-Assess</p>
                <Clock className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-blue-400 mt-2">
                {data?.kpis.selfAssessmentsPending ?? 0}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Awaiting employee submission</p>
            </div>

            <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Pending Manager</p>
                <Layers className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-2xl font-bold text-purple-400 mt-2">
                {data?.kpis.managerReviewsPending ?? 0}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Awaiting supervisor evaluation</p>
            </div>
          </div>

          {/* Middle Row: Rating Distribution & Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Rating Distribution */}
            <div className="lg:col-span-2 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800/80">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base font-semibold text-white">Rating Distribution</h3>
                  <p className="text-xs text-zinc-400">Bell curve evaluation breakdown for active workforce</p>
                </div>
                <Link
                  href="/performance/analytics"
                  className="text-xs font-medium text-amber-400 hover:text-amber-300 flex items-center gap-1"
                >
                  View Full Analytics <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="space-y-4">
                {[
                  { key: 'Outstanding', label: '5 — Outstanding', color: 'bg-emerald-500' },
                  { key: 'Exceeds Expectations', label: '4 — Exceeds Expectations', color: 'bg-teal-500' },
                  { key: 'Meets Expectations', label: '3 — Meets Expectations', color: 'bg-blue-500' },
                  { key: 'Needs Improvement', label: '2 — Needs Improvement', color: 'bg-amber-500' },
                  { key: 'Does Not Meet Expectations', label: '1 — Does Not Meet Expectations', color: 'bg-rose-500' },
                ].map((tier) => {
                  const count = data?.ratingDistribution[tier.key] || 0;
                  const total = data?.kpis.reviewsCompleted || 1;
                  const pct = Math.round((count / (total > 0 ? total : 1)) * 100);

                  return (
                    <div key={tier.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300 font-medium">{tier.label}</span>
                        <span className="text-zinc-400 font-mono">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${tier.color} transition-all duration-500 rounded-full`}
                          style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Actions & Action Needed */}
            <div className="space-y-6">
              {/* Overdue / PIP Warnings */}
              <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800/80 space-y-4">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" /> Action Required
                </h3>

                <div className="space-y-3">
                  <div className="p-3 bg-rose-950/30 border border-rose-900/40 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-rose-300">Overdue Appraisals</p>
                      <p className="text-xs text-rose-400/80">Reviews past configured deadlines</p>
                    </div>
                    <span className="text-lg font-bold text-rose-400 font-mono">
                      {data?.kpis.overdueReviews ?? 0}
                    </span>
                  </div>

                  <div className="p-3 bg-amber-950/30 border border-amber-900/40 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-amber-300">Active PIPs</p>
                      <p className="text-xs text-amber-400/80">Performance Improvement Plans in progress</p>
                    </div>
                    <span className="text-lg font-bold text-amber-400 font-mono">
                      {data?.kpis.employeesRequiringPips ?? 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Module Directory Links */}
              <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800/80">
                <h3 className="text-sm font-semibold text-zinc-300 mb-3">Performance Hubs</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Link
                    href="/performance/goals"
                    className="p-2.5 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 rounded-xl border border-zinc-700/50 flex items-center justify-between transition"
                  >
                    <span>SMART Goals</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/performance/kpis"
                    className="p-2.5 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 rounded-xl border border-zinc-700/50 flex items-center justify-between transition"
                  >
                    <span>KPI Catalog</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/performance/competencies"
                    className="p-2.5 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 rounded-xl border border-zinc-700/50 flex items-center justify-between transition"
                  >
                    <span>Competencies</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/performance/development"
                    className="p-2.5 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 rounded-xl border border-zinc-700/50 flex items-center justify-between transition"
                  >
                    <span>PIP & Dev Plans</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/performance/history"
                    className="p-2.5 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 rounded-xl border border-zinc-700/50 flex items-center justify-between transition"
                  >
                    <span>Review History</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/performance/reports"
                    className="p-2.5 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 rounded-xl border border-zinc-700/50 flex items-center justify-between transition"
                  >
                    <span>Reports & CSV</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Department Breakdown Table */}
          <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 overflow-hidden">
            <div className="p-6 border-b border-zinc-800">
              <h3 className="text-base font-semibold text-white">Departmental Performance Summary</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Aggregated appraisal completion, average ratings, and target goal achievement by operational unit
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-zinc-300">
                <thead className="bg-zinc-950/40 text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                  <tr>
                    <th className="px-6 py-3.5">Department</th>
                    <th className="px-6 py-3.5 text-center">Personnel</th>
                    <th className="px-6 py-3.5 text-center">Reviewed</th>
                    <th className="px-6 py-3.5 text-center">Average Score</th>
                    <th className="px-6 py-3.5 text-center">Review Completion</th>
                    <th className="px-6 py-3.5 text-center">Goal Completion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {data?.departmentSummary && data.departmentSummary.length > 0 ? (
                    data.departmentSummary.map((dept) => (
                      <tr key={dept.id} className="hover:bg-zinc-800/30 transition">
                        <td className="px-6 py-4 font-medium text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          {dept.name}
                          <span className="text-xs text-zinc-500 font-mono">({dept.code})</span>
                        </td>
                        <td className="px-6 py-4 text-center font-mono">{dept.totalEmployees}</td>
                        <td className="px-6 py-4 text-center font-mono">{dept.employeesReviewed}</td>
                        <td className="px-6 py-4 text-center font-semibold">
                          <span
                            className={
                              dept.averageScore >= 4.0
                                ? 'text-emerald-400'
                                : dept.averageScore >= 3.0
                                ? 'text-blue-400'
                                : dept.averageScore > 0
                                ? 'text-amber-400'
                                : 'text-zinc-500'
                            }
                          >
                            {dept.averageScore > 0 ? `${dept.averageScore} / 5.0` : 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center font-mono">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              dept.reviewCompletionPercentage === 100
                                ? 'bg-emerald-950/60 text-emerald-400'
                                : 'bg-zinc-800 text-zinc-300'
                            }`}
                          >
                            {dept.reviewCompletionPercentage}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center font-mono">
                          <span className="text-xs font-medium text-zinc-300">
                            {dept.goalCompletionPercentage}%
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">
                        No department performance records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
