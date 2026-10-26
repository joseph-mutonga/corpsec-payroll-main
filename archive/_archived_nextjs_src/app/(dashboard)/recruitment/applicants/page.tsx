'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  Search,
  Filter,
  Briefcase,
  ChevronRight,
  UserCheck,
  Building2,
  Calendar,
  Eye,
} from 'lucide-react';

interface ApplicantItem {
  id: string;
  applicationNumber: string;
  fullName: string;
  email: string;
  phone: string;
  location?: string;
  currentOccupation?: string;
  experienceYears?: number;
  currentStage: string;
  screeningStatus: string;
  screeningScore?: number;
  createdAt: string;
  vacancy: {
    id: string;
    title: string;
    vacancyNumber: string;
    department: { name: string };
    station?: { name: string };
  };
  assignedRecruiter?: { id: string; firstName: string; lastName: string };
  offers?: Array<{ id: string; status: string; proposedSalary: number }>;
}

export default function ApplicantDirectoryPage() {
  const [applicants, setApplicants] = useState<ApplicantItem[]>([]);
  const [vacancies, setVacancies] = useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('ALL');
  const [vacancyFilter, setVacancyFilter] = useState('ALL');

  useEffect(() => {
    fetchApplicants();
    fetchVacanciesList();
  }, [stageFilter, vacancyFilter]);

  const fetchApplicants = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (stageFilter !== 'ALL') params.append('stage', stageFilter);
      if (vacancyFilter !== 'ALL') params.append('vacancyId', vacancyFilter);
      if (search) params.append('search', search);

      const res = await fetch(`/api/recruitment/applicants?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setApplicants(json.data.applicants || []);
      }
    } catch (e) {
      console.error('Failed to load applicants:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchVacanciesList = async () => {
    try {
      const res = await fetch('/api/recruitment/vacancies');
      const json = await res.json();
      if (json.success) {
        setVacancies(json.data.vacancies || []);
      }
    } catch (e) {
      console.error('Failed to load vacancies filter list:', e);
    }
  };

  const stages = [
    'ALL',
    'APPLIED',
    'SCREENING',
    'SHORTLISTED',
    'INTERVIEW',
    'ASSESSMENT',
    'OFFER',
    'HIRED',
    'REJECTED',
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-amber-500 mb-1">
            <Users className="w-4 h-4" />
            <span>Applicant Tracking & Talent Pool</span>
          </div>
          <h1 className="text-2xl font-black text-white">Applicant Master Directory</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            View, search, filter, and track all candidates through recruitment stages.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/recruitment/pipeline"
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition flex items-center space-x-2"
          >
            <span>Kanban Pipeline</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search candidate name, email, app no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchApplicants()}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select
            value={vacancyFilter}
            onChange={(e) => setVacancyFilter(e.target.value)}
            aria-label="Filter by Vacancy Position"
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Vacancies</option>
            {vacancies.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>

          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            aria-label="Filter by Pipeline Stage"
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            {stages.map((st) => (
              <option key={st} value={st}>
                {st === 'ALL' ? 'All Stages' : st}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Applicants Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Application Reference & Candidate</th>
                <th className="py-3.5 px-4">Target Vacancy</th>
                <th className="py-3.5 px-4">Current Stage</th>
                <th className="py-3.5 px-4">Screening Status</th>
                <th className="py-3.5 px-4">Applied Date</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Loading applicant records...
                  </td>
                </tr>
              ) : applicants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    No applicants found matching filter criteria.
                  </td>
                </tr>
              ) : (
                applicants.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white text-sm">{app.fullName}</div>
                      <div className="font-mono text-slate-500 text-[11px]">{app.applicationNumber}</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">
                        {app.email} • {app.phone}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-white">{app.vacancy.title}</div>
                      <div className="text-slate-500 text-[11px]">{app.vacancy.department.name}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-md font-mono text-[11px] font-semibold ${
                          app.currentStage === 'HIRED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : app.currentStage === 'OFFER'
                            ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                            : app.currentStage === 'INTERVIEW'
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            : app.currentStage === 'SHORTLISTED'
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                            : app.currentStage === 'REJECTED'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {app.currentStage}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                          app.screeningStatus === 'PASS'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : app.screeningStatus === 'FAIL'
                            ? 'bg-rose-500/10 text-rose-400'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {app.screeningStatus} {app.screeningScore ? `(${app.screeningScore} pts)` : ''}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-400">
                      {new Date(app.createdAt).toLocaleDateString('en-KE', { dateStyle: 'medium' })}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <Link
                        href={`/recruitment/applicants/${app.id}`}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold text-xs transition inline-flex items-center space-x-1"
                      >
                        <span>Profile</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
