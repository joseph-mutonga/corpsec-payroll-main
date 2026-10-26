'use client';

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  BarChart3,
  Users,
  Clock,
  Briefcase,
  Building2,
  Award,
  CheckCircle2,
  Download,
  Filter,
} from 'lucide-react';

interface ReportData {
  vacancyPerformance: Array<{
    id: string;
    vacancyNumber: string;
    title: string;
    department: string;
    station: string;
    openingsCount: number;
    status: string;
    applications: number;
    shortlisted: number;
    interviews: number;
    offers: number;
    hires: number;
    fillRate: number;
  }>;
  sourceAnalysis: Array<{
    source: string;
    total: number;
    hired: number;
    conversionRate: number;
  }>;
  avgDaysToHire: number;
  totalHires: number;
}

export default function RecruitmentReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState('ALL');

  useEffect(() => {
    fetchReport();
    fetch('/api/departments')
      .then((r) => r.json())
      .then((d) => d.success && setDepartments(d.data || []));
  }, [deptFilter]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (deptFilter !== 'ALL') params.append('departmentId', deptFilter);

      const res = await fetch(`/api/recruitment/reports?${params.toString()}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (e) {
      console.error('Failed to load recruitment reports:', e);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!data) return;
    const headers = ['Vacancy No', 'Title', 'Department', 'Station', 'Openings', 'Applications', 'Hires', 'Fill Rate %'];
    const rows = data.vacancyPerformance.map((v) => [
      v.vacancyNumber,
      `"${v.title}"`,
      `"${v.department}"`,
      `"${v.station}"`,
      v.openingsCount,
      v.applications,
      v.hires,
      `${v.fillRate}%`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `CorpSec_Recruitment_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading || !data) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="h-8 bg-slate-800/40 rounded-xl w-64 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-32 bg-slate-800/30 rounded-3xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-amber-500 mb-1">
            <BarChart3 className="w-4 h-4" />
            <span>Recruitment Analytics & Insights</span>
          </div>
          <h1 className="text-2xl font-black text-white">Talent Acquisition Reports</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitor vacancy fill rates, candidate conversion funnels, source attribution, and hiring cycle duration.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <button
            onClick={exportCSV}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition flex items-center space-x-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Top Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Average Time to Hire</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-3xl font-black text-white">{data.avgDaysToHire}</span>
            <span className="text-xs text-slate-400 font-semibold">Days (Application to Conversion)</span>
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Successful Conversions</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-3xl font-black text-emerald-400">{data.totalHires}</span>
            <span className="text-xs text-slate-400 font-semibold">Candidates Hired & Onboarded</span>
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Tracked Requisitions</span>
            <Briefcase className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-3xl font-black text-white">{data.vacancyPerformance.length}</span>
            <span className="text-xs text-slate-400 font-semibold">Active & Archived Vacancies</span>
          </div>
        </div>
      </div>

      {/* Vacancy Performance Table */}
      <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Vacancy Requisition Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">Vacancy Number & Title</th>
                <th className="py-3 px-3">Department</th>
                <th className="py-3 px-3 text-center">Openings</th>
                <th className="py-3 px-3 text-center">Applied</th>
                <th className="py-3 px-3 text-center">Shortlisted</th>
                <th className="py-3 px-3 text-center">Interviews</th>
                <th className="py-3 px-3 text-center">Hires</th>
                <th className="py-3 px-3 text-right">Fill Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {data.vacancyPerformance.map((v) => (
                <tr key={v.id} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-3">
                    <div className="font-bold text-white">{v.title}</div>
                    <div className="font-mono text-slate-500 text-[10px]">{v.vacancyNumber}</div>
                  </td>
                  <td className="py-3 px-3">{v.department}</td>
                  <td className="py-3 px-3 text-center font-bold">{v.openingsCount}</td>
                  <td className="py-3 px-3 text-center">{v.applications}</td>
                  <td className="py-3 px-3 text-center">{v.shortlisted}</td>
                  <td className="py-3 px-3 text-center">{v.interviews}</td>
                  <td className="py-3 px-3 text-center font-bold text-emerald-400">{v.hires}</td>
                  <td className="py-3 px-3 text-right">
                    <span className="font-mono font-bold text-amber-400">{v.fillRate}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Source Analysis */}
      <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Candidate Source Attribution</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          {data.sourceAnalysis.map((src) => (
            <div key={src.source} className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80">
              <span className="text-slate-400 font-semibold block mb-1">{src.source}</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-lg font-black text-white">{src.total} applicants</span>
                <span className="text-emerald-400 font-bold">{src.hired} hired</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">Conversion Rate: {src.conversionRate}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
