'use client';

import React, { useState, useEffect } from 'react';
import {
  FileCheck,
  Download,
  Filter,
  BarChart3,
  Calendar,
  CheckCircle2,
  Layers,
} from 'lucide-react';

export default function PerformanceReportsPage() {
  const [reportType, setReportType] = useState('PERFORMANCE_SUMMARY');
  const [cycleId, setCycleId] = useState('ALL');
  const [cycles, setCycles] = useState<Array<{ id: string; name: string }>>([]);
  const [reportData, setReportData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCycles();
  }, []);

  useEffect(() => {
    fetchReport();
  }, [reportType, cycleId]);

  const fetchCycles = async () => {
    try {
      const res = await fetch('/api/performance/cycles');
      const json = await res.json();
      if (json.success) setCycles(json.data.cycles);
    } catch (e) {
      console.error('Failed to load cycles:', e);
    }
  };

  const fetchReport = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('type', reportType);
      if (cycleId !== 'ALL') params.append('cycleId', cycleId);

      const res = await fetch(`/api/performance/reports?${params.toString()}`);
      const json = await res.json();
      if (json.success) setReportData(json.data.records);
    } catch (e) {
      console.error('Failed to load report data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCsv = () => {
    const params = new URLSearchParams();
    params.append('type', reportType);
    if (cycleId !== 'ALL') params.append('cycleId', cycleId);
    params.append('format', 'csv');

    window.open(`/api/performance/reports?${params.toString()}`, '_blank');
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
              <h1 className="text-2xl font-bold text-white tracking-tight">Performance Reports & Export</h1>
              <p className="text-sm text-zinc-400 mt-0.5">
                Generate and export appraisal summaries, goal completions, and departmental performance CSVs
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleDownloadCsv}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition"
        >
          <Download className="w-4 h-4" />
          Export CSV Ledger
        </button>
      </div>

      {/* Control Filters */}
      <div className="flex flex-wrap items-center gap-4 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-400">Report Category</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white"
          >
            <option value="PERFORMANCE_SUMMARY">Comprehensive Performance Summary</option>
            <option value="GOALS_COMPLETION">SMART Goals Completion Report</option>
            <option value="DEPARTMENT_RANKING">Departmental Performance Ranking</option>
            <option value="DEVELOPMENT_PLANS">PIPs & Development Action Tracker</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-400">Performance Cycle</label>
          <select
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
            className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white"
          >
            <option value="ALL">All Recorded Cycles</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Report Table */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-amber-500/20 border-t-amber-500"></div>
          <p className="text-sm text-zinc-500 mt-3 font-medium">Generating report data...</p>
        </div>
      ) : reportData.length === 0 ? (
        <div className="p-12 text-center bg-zinc-900/60 rounded-2xl border border-zinc-800">
          <p className="text-zinc-500 text-sm">No report rows found for the selected parameters.</p>
        </div>
      ) : (
        <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="bg-zinc-950/40 text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                <tr>
                  {Object.keys(reportData[0]).map((h) => (
                    <th key={h} className="px-6 py-3.5 whitespace-nowrap">{h.replace(/([A-Z])/g, ' $1')}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {reportData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-zinc-800/30 transition">
                    {Object.values(row).map((val: any, cIdx) => (
                      <td key={cIdx} className="px-6 py-4 whitespace-nowrap text-xs font-mono">
                        {val !== null && val !== undefined ? String(val) : '—'}
                      </td>
                    ))}
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
