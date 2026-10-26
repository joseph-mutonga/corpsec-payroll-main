'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Clock,
  Search,
  Filter,
  CheckCircle2,
  Award,
  ChevronRight,
  Shield,
  FileCheck,
} from 'lucide-react';

interface ReviewHistoryItem {
  id: string;
  reviewNumber: string;
  overallScore?: number;
  overallRating?: string;
  isCalibrated: boolean;
  calibratedScore?: number;
  acknowledgedAt?: string;
  createdAt: string;
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
    department?: { name: string };
  };
  reviewer?: {
    fullName: string;
  };
  cycle: {
    code: string;
    name: string;
  };
}

export default function PerformanceHistoryPage() {
  const [reviews, setReviews] = useState<ReviewHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/performance/reviews?status=COMPLETED');
      const json = await res.json();
      if (json.success) setReviews(json.data.reviews);
    } catch (e) {
      console.error('Failed to load performance history:', e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = reviews.filter((r) => {
    const term = searchTerm.toLowerCase();
    return (
      r.reviewNumber.toLowerCase().includes(term) ||
      r.employee.fullName.toLowerCase().includes(term) ||
      r.cycle.name.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <Clock className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Performance History Vault</h1>
              <p className="text-sm text-zinc-400 mt-0.5">
                Immutable, read-only ledger of past finalized appraisals and multi-year rating records
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60 max-w-md">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search completed appraisals..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-amber-500/20 border-t-amber-500"></div>
          <p className="text-sm text-zinc-500 mt-3 font-medium">Loading history...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-zinc-900/60 p-12 rounded-2xl border border-zinc-800 text-center">
          <FileCheck className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white">No Finalized Reviews Yet</h3>
          <p className="text-sm text-zinc-400 mt-1 max-w-md mx-auto">
            Once appraisal cycles reach completed status and are acknowledged, their immutable records will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 overflow-hidden">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="bg-zinc-950/40 text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
              <tr>
                <th className="px-6 py-3.5">Review #</th>
                <th className="px-6 py-3.5">Cycle</th>
                <th className="px-6 py-3.5">Employee</th>
                <th className="px-6 py-3.5">Reviewer</th>
                <th className="px-6 py-3.5 text-center">Final Score</th>
                <th className="px-6 py-3.5 text-center">Rating Tier</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-800/30 transition">
                  <td className="px-6 py-4 font-mono text-xs text-amber-400 font-semibold">{r.reviewNumber}</td>
                  <td className="px-6 py-4 text-xs text-zinc-300 font-medium">{r.cycle.name}</td>
                  <td className="px-6 py-4">
                    <div className="text-white font-medium">{r.employee.fullName}</div>
                    <div className="text-xs text-zinc-500">{r.employee.employeeNumber}</div>
                  </td>
                  <td className="px-6 py-4 text-xs text-zinc-400">{r.reviewer?.fullName || 'Unassigned'}</td>
                  <td className="px-6 py-4 text-center font-mono font-bold text-amber-400 text-base">
                    {r.isCalibrated && r.calibratedScore ? r.calibratedScore : r.overallScore ?? 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-center text-xs font-semibold text-zinc-300">
                    {r.overallRating || 'Meets Expectations'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/performance/reviews/${r.id}`}
                      className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
                    >
                      View Dossier <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
