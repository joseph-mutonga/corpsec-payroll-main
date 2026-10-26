'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Briefcase,
  Building2,
  MapPin,
  Calendar,
  Users,
  Clock,
  ArrowLeft,
  Edit,
  PlayCircle,
  PauseCircle,
  XCircle,
  Copy,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

interface VacancyDetail {
  id: string;
  vacancyNumber: string;
  title: string;
  employmentType: string;
  openingsCount: number;
  description: string;
  responsibilities?: string;
  requirements?: string;
  qualifications?: string;
  skillsRequired?: string;
  experienceYears?: number;
  minSalary?: number;
  maxSalary?: number;
  showSalaryPublicly: boolean;
  applicationDeadline?: string;
  status: string;
  publishedAt?: string;
  createdAt: string;
  department: { id: string; name: string };
  station?: { id: string; name: string };
  branch?: { id: string; name: string };
  assignedRecruiter?: { id: string; firstName: string; lastName: string };
  candidates: Array<{
    id: string;
    applicationNumber: string;
    fullName: string;
    email: string;
    phone: string;
    currentStage: string;
    screeningStatus: string;
    screeningScore?: number;
    createdAt: string;
  }>;
  _count: { candidates: number; interviews: number; jobOffers: number };
}

export default function VacancyDetailPage() {
  const params = useParams();
  const vacancyId = params?.id as string;

  const [vacancy, setVacancy] = useState<VacancyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'applicants' | 'overview'>('applicants');

  useEffect(() => {
    if (vacancyId) fetchDetail();
  }, [vacancyId]);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/recruitment/vacancies/${vacancyId}`);
      const json = await res.json();
      if (json.success && json.data.vacancy) {
        setVacancy(json.data.vacancy);
      }
    } catch (e) {
      console.error('Error loading vacancy detail:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const res = await fetch(`/api/recruitment/vacancies/${vacancyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        fetchDetail();
      }
    } catch (e) {
      console.error('Error changing status:', e);
    }
  };

  if (loading || !vacancy) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="h-8 bg-slate-800/40 rounded-xl w-64 animate-pulse" />
        <div className="h-48 bg-slate-800/30 rounded-3xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Back Button */}
      <Link
        href="/recruitment/vacancies"
        className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-400 hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Vacancies</span>
      </Link>

      {/* Vacancy Header Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/70 border border-slate-800 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-mono text-amber-400 font-semibold">{vacancy.vacancyNumber}</span>
              <span className="text-xs px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300 font-semibold">
                {vacancy.employmentType}
              </span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  vacancy.status === 'OPEN'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : vacancy.status === 'DRAFT'
                    ? 'bg-slate-800 text-slate-400'
                    : vacancy.status === 'PAUSED'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}
              >
                {vacancy.status}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white">{vacancy.title}</h1>

            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-400">
              <div className="flex items-center space-x-1.5">
                <Building2 className="w-4 h-4 text-slate-500" />
                <span>{vacancy.department.name}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <MapPin className="w-4 h-4 text-slate-500" />
                <span>{vacancy.station?.name || 'All Stations'}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <Users className="w-4 h-4 text-slate-500" />
                <span>{vacancy.openingsCount} Openings</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {vacancy.status === 'OPEN' ? (
              <button
                onClick={() => handleStatusChange('PAUSED')}
                className="px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold text-xs flex items-center space-x-1.5 transition"
              >
                <PauseCircle className="w-4 h-4" />
                <span>Pause Requisition</span>
              </button>
            ) : vacancy.status === 'PAUSED' || vacancy.status === 'DRAFT' ? (
              <button
                onClick={() => handleStatusChange('OPEN')}
                className="px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-xs flex items-center space-x-1.5 transition"
              >
                <PlayCircle className="w-4 h-4" />
                <span>Publish Open</span>
              </button>
            ) : null}

            <Link
              href={`/careers/${vacancy.id}`}
              target="_blank"
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center space-x-1.5 transition"
            >
              <span>Public View</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </Link>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="mt-8 pt-6 border-t border-slate-800 grid grid-cols-3 sm:grid-cols-4 gap-4 text-center">
          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-xs text-slate-500 block">Total Applicants</span>
            <span className="text-xl font-bold text-white mt-1 block">{vacancy._count.candidates}</span>
          </div>
          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-xs text-slate-500 block">Interviews</span>
            <span className="text-xl font-bold text-purple-400 mt-1 block">{vacancy._count.interviews}</span>
          </div>
          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-xs text-slate-500 block">Job Offers</span>
            <span className="text-xl font-bold text-amber-400 mt-1 block">{vacancy._count.jobOffers}</span>
          </div>
          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 hidden sm:block">
            <span className="text-xs text-slate-500 block">Recruiter</span>
            <span className="text-xs font-semibold text-slate-300 mt-1 block truncate">
              {vacancy.assignedRecruiter ? `${vacancy.assignedRecruiter.firstName} ${vacancy.assignedRecruiter.lastName}` : 'Unassigned'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-4">
        <button
          onClick={() => setActiveTab('applicants')}
          className={`pb-3 text-xs font-bold transition border-b-2 ${
            activeTab === 'applicants'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          Applicants ({vacancy.candidates.length})
        </button>
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 text-xs font-bold transition border-b-2 ${
            activeTab === 'overview'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          Requisition Details & Criteria
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'applicants' ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Application No & Candidate</th>
                <th className="py-3.5 px-4">Contact</th>
                <th className="py-3.5 px-4">Current Stage</th>
                <th className="py-3.5 px-4">Screening Result</th>
                <th className="py-3.5 px-4">Date Applied</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {vacancy.candidates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    No applications received for this vacancy yet.
                  </td>
                </tr>
              ) : (
                vacancy.candidates.map((cand) => (
                  <tr key={cand.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white text-sm">{cand.fullName}</div>
                      <div className="font-mono text-slate-500 text-[11px]">{cand.applicationNumber}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div>{cand.email}</div>
                      <div className="text-slate-500 text-[11px]">{cand.phone}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono text-[11px] border border-amber-500/20">
                        {cand.currentStage}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                          cand.screeningStatus === 'PASS'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : cand.screeningStatus === 'FAIL'
                            ? 'bg-rose-500/10 text-rose-400'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {cand.screeningStatus} {cand.screeningScore ? `(${cand.screeningScore}/100)` : ''}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-400">
                      {new Date(cand.createdAt).toLocaleDateString('en-KE', { dateStyle: 'medium' })}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <Link
                        href={`/recruitment/applicants/${cand.id}`}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold text-xs transition inline-flex items-center space-x-1"
                      >
                        <span>Review</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-6 text-sm text-slate-300">
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Description</h3>
            <p className="whitespace-pre-line text-slate-200">{vacancy.description}</p>
          </div>

          {vacancy.responsibilities && (
            <div className="pt-4 border-t border-slate-800">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Responsibilities</h3>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 whitespace-pre-line font-mono text-xs">
                {vacancy.responsibilities}
              </div>
            </div>
          )}

          {vacancy.requirements && (
            <div className="pt-4 border-t border-slate-800">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Requirements</h3>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 whitespace-pre-line font-mono text-xs">
                {vacancy.requirements}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
