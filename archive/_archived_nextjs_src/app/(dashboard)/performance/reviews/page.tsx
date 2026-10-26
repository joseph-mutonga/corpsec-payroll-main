'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileCheck,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ChevronRight,
  User,
  Award,
  Layers,
  Sliders,
  AlertTriangle,
} from 'lucide-react';

interface Review {
  id: string;
  reviewNumber: string;
  status: string;
  goalsScore?: number;
  kpisScore?: number;
  competenciesScore?: number;
  overallScore?: number;
  overallRating?: string;
  isCalibrated: boolean;
  calibratedScore?: number;
  hasConcern: boolean;
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
    department?: { name: string };
    station?: { name: string };
  };
  reviewer?: {
    id: string;
    fullName: string;
    jobTitle: string;
  };
  cycle: {
    id: string;
    code: string;
    name: string;
    status: string;
  };
  _count: { concerns: number; developmentPlans: number };
}

export default function ReviewsAppraisalDeskPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [cycleFilter, setCycleFilter] = useState('ALL');
  const [cycles, setCycles] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    fetchReviews();
    fetchCycles();
  }, [statusFilter, cycleFilter]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (cycleFilter !== 'ALL') params.append('cycleId', cycleFilter);

      const res = await fetch(`/api/performance/reviews?${params.toString()}`);
      const json = await res.json();
      if (json.success) setReviews(json.data.reviews);
    } catch (e) {
      console.error('Failed to load reviews:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCycles = async () => {
    try {
      const res = await fetch('/api/performance/cycles');
      const json = await res.json();
      if (json.success) setCycles(json.data.cycles);
    } catch (e) {
      console.error('Failed to load cycles:', e);
    }
  };

  const filteredReviews = reviews.filter((r) => {
    const term = searchTerm.toLowerCase();
    return (
      r.reviewNumber.toLowerCase().includes(term) ||
      r.employee.fullName.toLowerCase().includes(term) ||
      r.employee.employeeNumber.toLowerCase().includes(term) ||
      (r.employee.department?.name && r.employee.department.name.toLowerCase().includes(term))
    );
  });

  const getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string }> = {
      SELF_ASSESSMENT: { bg: 'bg-blue-950/60 border border-blue-800 text-blue-400', text: 'Self Assessment' },
      MANAGER_REVIEW: { bg: 'bg-purple-950/60 border border-purple-800 text-purple-400', text: 'Manager Review' },
      CALIBRATION: { bg: 'bg-amber-950/60 border border-amber-800 text-amber-400', text: 'Calibration' },
      EMPLOYEE_ACKNOWLEDGEMENT: { bg: 'bg-cyan-950/60 border border-cyan-800 text-cyan-400', text: 'Awaiting Ack' },
      COMPLETED: { bg: 'bg-emerald-950/60 border border-emerald-800 text-emerald-400', text: 'Completed' },
      DRAFT: { bg: 'bg-zinc-800 text-zinc-400', text: 'Draft' },
    };
    const s = map[status] || { bg: 'bg-zinc-800 text-zinc-300', text: status };
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${s.bg}`}>
        {s.text}
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
              <FileCheck className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Appraisal Reviews Desk</h1>
              <p className="text-sm text-zinc-400 mt-0.5">
                Multi-stage performance appraisals, weighted composite scores & manager ratings
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/performance/cycles"
          className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-sm rounded-xl border border-zinc-700 transition"
        >
          <Layers className="w-4 h-4 text-zinc-400" />
          Cycles Overview
        </Link>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by review number, employee name, or department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400" />
          <select
            value={cycleFilter}
            onChange={(e) => setCycleFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Cycles</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="SELF_ASSESSMENT">Self Assessment</option>
            <option value="MANAGER_REVIEW">Manager Review</option>
            <option value="CALIBRATION">Calibration</option>
            <option value="EMPLOYEE_ACKNOWLEDGEMENT">Awaiting Acknowledgement</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
      </div>

      {/* Reviews Table */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-amber-500/20 border-t-amber-500"></div>
          <p className="text-sm text-zinc-500 mt-3 font-medium">Loading appraisals...</p>
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="bg-zinc-900/60 p-12 rounded-2xl border border-zinc-800 text-center">
          <FileCheck className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white">No Appraisal Records Found</h3>
          <p className="text-sm text-zinc-400 mt-1 max-w-md mx-auto">
            Reviews are initialized automatically when a performance cycle opens.
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="bg-zinc-950/40 text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="px-6 py-3.5">Review #</th>
                  <th className="px-6 py-3.5">Employee</th>
                  <th className="px-6 py-3.5">Department</th>
                  <th className="px-6 py-3.5">Supervisor Reviewer</th>
                  <th className="px-6 py-3.5 text-center">Status</th>
                  <th className="px-6 py-3.5 text-center">Goals / KPIs / Comp</th>
                  <th className="px-6 py-3.5 text-center">Composite Score</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredReviews.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-800/30 transition">
                    <td className="px-6 py-4 font-mono text-xs text-amber-400 font-semibold">
                      {r.reviewNumber}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-white font-medium">{r.employee.fullName}</div>
                      <div className="text-xs text-zinc-500">{r.employee.employeeNumber} • {r.employee.jobTitle}</div>
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-300">
                      {r.employee.department?.name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-400">
                      {r.reviewer?.fullName || 'Unassigned'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        {getStatusBadge(r.status)}
                        {r.hasConcern && (
                          <span className="p-1 bg-rose-500/20 text-rose-400 rounded-full" title="Dispute raised">
                            <AlertTriangle className="w-3 h-3" />
                          </span>
                        )}
                        {r.isCalibrated && (
                          <span className="p-1 bg-amber-500/20 text-amber-400 rounded-full" title="Calibrated by HR">
                            <Sliders className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center font-mono text-xs text-zinc-400">
                      <span>{r.goalsScore ?? '—'}</span> / <span>{r.kpisScore ?? '—'}</span> / <span>{r.competenciesScore ?? '—'}</span>
                    </td>
                    <td className="px-6 py-4 text-center font-mono">
                      {r.overallScore ? (
                        <div>
                          <span className="text-base font-bold text-amber-400">
                            {r.isCalibrated && r.calibratedScore ? r.calibratedScore : r.overallScore}
                          </span>
                          <span className="text-xs text-zinc-500"> / 5.0</span>
                          <div className="text-[10px] text-zinc-400 font-sans">{r.overallRating}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-600">Pending</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/performance/reviews/${r.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg transition"
                      >
                        Evaluate Dossier <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
