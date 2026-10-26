'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Users,
  UserCheck,
  Calendar,
  FileCheck,
  CheckCircle2,
  TrendingUp,
  Clock,
  ArrowRight,
  Filter,
  PlusCircle,
  Award,
  ChevronRight,
} from 'lucide-react';

interface RecruitmentStats {
  kpis: {
    openVacancies: number;
    draftVacancies: number;
    totalApplications: number;
    applicationsThisWeek: number;
    screeningCount: number;
    shortlistedCount: number;
    interviewsScheduled: number;
    offersPending: number;
    offersAccepted: number;
    hiresThisMonth: number;
  };
  funnel: Array<{ stage: string; count: number; color: string }>;
  recentApplications: Array<{
    id: string;
    applicationNumber: string;
    fullName: string;
    email: string;
    currentStage: string;
    createdAt: string;
    vacancy: { title: string; vacancyNumber: string };
  }>;
  activeVacancies: Array<{
    id: string;
    vacancyNumber: string;
    title: string;
    employmentType: string;
    openingsCount: number;
    department: { name: string };
    _count: { candidates: number };
  }>;
}

export default function RecruitmentDashboardPage() {
  const [data, setData] = useState<RecruitmentStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/recruitment/dashboard');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (e) {
      console.error('Error loading recruitment stats:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 bg-slate-800/40 rounded-xl w-64 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-28 bg-slate-800/30 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const kpis = data.kpis;

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-amber-500 mb-1">
            <Briefcase className="w-4 h-4" />
            <span>Talent Acquisition & ATS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Recruitment Command Center
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage vacancies, applicant screening pipeline, interviews, job offers, and hiring conversions.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/careers"
            target="_blank"
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition flex items-center space-x-1.5"
          >
            <span>Public Careers Site</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </Link>

          <Link
            href="/recruitment/vacancies"
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center space-x-1.5 shadow-lg shadow-amber-500/20"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Manage Vacancies</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Open Vacancies</span>
            <Briefcase className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-white">{kpis.openVacancies}</span>
            <span className="text-xs text-slate-500 font-mono">{kpis.draftVacancies} Drafts</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Applications</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-white">{kpis.totalApplications}</span>
            <span className="text-xs text-emerald-400 font-semibold">+{kpis.applicationsThisWeek} this week</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Shortlisted Staff</span>
            <UserCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-white">{kpis.shortlistedCount}</span>
            <span className="text-xs text-amber-400">{kpis.screeningCount} in screening</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Interviews</span>
            <Calendar className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-white">{kpis.interviewsScheduled}</span>
            <span className="text-xs text-slate-500 font-mono">Scheduled</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-lg col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Hires This Month</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-400">{kpis.hiresThisMonth}</span>
            <span className="text-xs text-slate-500 font-mono">{kpis.offersAccepted} Accepted</span>
          </div>
        </div>
      </div>

      {/* Recruitment Funnel Visualization */}
      <div className="p-6 rounded-3xl bg-slate-900/70 border border-slate-800 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <span>Candidate Recruitment Funnel</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Live distribution of applicants across pipeline stages</p>
          </div>

          <Link
            href="/recruitment/pipeline"
            className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center space-x-1"
          >
            <span>Interactive Kanban Pipeline</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {data.funnel.map((step) => (
            <div
              key={step.stage}
              className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-center flex flex-col justify-between"
            >
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">{step.stage}</span>
              <span className="text-2xl font-black text-white my-2">{step.count}</span>
              <div className="w-full bg-slate-800/50 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-amber-400 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      kpis.totalApplications > 0
                        ? Math.min(100, Math.max(10, (step.count / kpis.totalApplications) * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active Vacancies & Recent Applications split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Vacancies */}
        <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Active Job Vacancies</h3>
              <Link href="/recruitment/vacancies" className="text-xs text-amber-400 hover:underline font-semibold">
                View All ({kpis.openVacancies})
              </Link>
            </div>

            <div className="space-y-3">
              {data.activeVacancies.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No active open vacancies.</p>
              ) : (
                data.activeVacancies.map((v) => (
                  <Link
                    key={v.id}
                    href={`/recruitment/vacancies/${v.id}`}
                    className="block p-3.5 rounded-2xl bg-slate-950/50 hover:bg-slate-950 border border-slate-800/80 hover:border-amber-500/30 transition group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-white group-hover:text-amber-400 transition">{v.title}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {v.department.name} • {v.openingsCount} Openings
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {v._count.candidates} Applicants
                        </span>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500">Need to hire security personnel?</span>
            <Link
              href="/recruitment/vacancies"
              className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center space-x-1"
            >
              <span>Create Vacancy</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Recent Applications */}
        <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Recent Applicants</h3>
              <Link href="/recruitment/applicants" className="text-xs text-amber-400 hover:underline font-semibold">
                Applicant Directory
              </Link>
            </div>

            <div className="space-y-3">
              {data.recentApplications.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No applications received yet.</p>
              ) : (
                data.recentApplications.map((app) => (
                  <Link
                    key={app.id}
                    href={`/recruitment/applicants/${app.id}`}
                    className="block p-3.5 rounded-2xl bg-slate-950/50 hover:bg-slate-950 border border-slate-800/80 hover:border-amber-500/30 transition group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-white group-hover:text-amber-400 transition">
                          {app.fullName}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">{app.vacancy.title}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                          {app.currentStage}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500">Pipeline throughput</span>
            <Link
              href="/recruitment/reports"
              className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center space-x-1"
            >
              <span>Analytics & Reports</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
