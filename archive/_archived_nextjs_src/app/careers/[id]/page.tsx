'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ShieldCheck,
  Building2,
  MapPin,
  Clock,
  Briefcase,
  CheckCircle2,
  ArrowLeft,
  Calendar,
  Share2,
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
  publishedAt?: string;
  department: { id: string; name: string };
  station?: { id: string; name: string; townCity?: string; physicalLocation?: string };
  branch?: { id: string; name: string; townCity?: string };
}

export default function PublicVacancyDetailPage() {
  const params = useParams();
  const vacancyId = params?.id as string;
  const [vacancy, setVacancy] = useState<VacancyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (vacancyId) {
      fetchVacancyDetail();
    }
  }, [vacancyId]);

  const fetchVacancyDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/careers/${vacancyId}`);
      const json = await res.json();
      if (json.success && json.data.vacancy) {
        setVacancy(json.data.vacancy);
      } else {
        setError(json.error || 'Job opportunity not found or closed.');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load vacancy');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !vacancy) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <h2 className="text-xl font-bold text-rose-400 mb-2">Vacancy Unavailable</h2>
        <p className="text-sm text-slate-400 mb-6">{error || 'This job is no longer accepting applications.'}</p>
        <Link
          href="/careers"
          className="inline-flex items-center space-x-2 text-sm text-amber-400 hover:text-amber-300 font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to All Openings</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/careers"
            className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>All Openings</span>
          </Link>

          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="text-sm font-bold text-white tracking-tight">CorpSec Careers</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 lg:p-10 shadow-2xl">
          {/* Header metadata */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-8 border-b border-slate-800">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-xs font-semibold px-3 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {vacancy.employmentType.replace('_', ' ')}
                </span>
                <span className="text-xs font-mono text-slate-500 bg-slate-800/80 px-2.5 py-1 rounded-md">
                  {vacancy.vacancyNumber}
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {vacancy.openingsCount} {vacancy.openingsCount === 1 ? 'Opening' : 'Openings'}
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-extrabold text-white">{vacancy.title}</h1>

              <div className="mt-4 flex flex-wrap gap-6 text-sm text-slate-400">
                <div className="flex items-center space-x-2">
                  <Building2 className="w-4 h-4 text-slate-500" />
                  <span>{vacancy.department.name}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <MapPin className="w-4 h-4 text-slate-500" />
                  <span>{vacancy.station?.name || vacancy.branch?.townCity || 'Nairobi'}</span>
                </div>
                {vacancy.experienceYears && (
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-slate-500" />
                    <span>{vacancy.experienceYears}+ Years Experience</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row md:flex-col gap-3 min-w-[200px]">
              <Link
                href={`/careers/${vacancy.id}/apply`}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-8 py-3.5 rounded-xl text-center shadow-lg shadow-amber-500/20 transition duration-200"
              >
                Apply for this Position
              </Link>
            </div>
          </div>

          {/* Salary Banner if public */}
          {vacancy.minSalary && vacancy.maxSalary && (
            <div className="my-6 p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                Offered Gross Remuneration:
              </span>
              <span className="text-amber-400 font-bold text-base">
                KES {vacancy.minSalary.toLocaleString()} - {vacancy.maxSalary.toLocaleString()} / Month
              </span>
            </div>
          )}

          {/* Job Description */}
          <div className="mt-8 space-y-8 text-slate-300 text-sm leading-relaxed">
            <section>
              <h3 className="text-lg font-bold text-white mb-3 flex items-center space-x-2">
                <Briefcase className="w-5 h-5 text-amber-400" />
                <span>Job Overview</span>
              </h3>
              <p className="whitespace-pre-line text-slate-300">{vacancy.description}</p>
            </section>

            {vacancy.responsibilities && (
              <section className="pt-6 border-t border-slate-800">
                <h3 className="text-lg font-bold text-white mb-3">Key Responsibilities</h3>
                <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-800/80 whitespace-pre-line">
                  {vacancy.responsibilities}
                </div>
              </section>
            )}

            {vacancy.requirements && (
              <section className="pt-6 border-t border-slate-800">
                <h3 className="text-lg font-bold text-white mb-3">Requirements & Skills</h3>
                <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-800/80 whitespace-pre-line">
                  {vacancy.requirements}
                </div>
              </section>
            )}

            {vacancy.qualifications && (
              <section className="pt-6 border-t border-slate-800">
                <h3 className="text-lg font-bold text-white mb-3">Desired Qualifications</h3>
                <p className="text-slate-300">{vacancy.qualifications}</p>
              </section>
            )}
          </div>

          {/* Bottom Action Footer */}
          <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-500 flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>
                {vacancy.applicationDeadline
                  ? `Application Deadline: ${new Date(vacancy.applicationDeadline).toLocaleDateString('en-KE', {
                      dateStyle: 'long',
                    })}`
                  : 'Applications accepted on a rolling basis'}
              </span>
            </div>

            <Link
              href={`/careers/${vacancy.id}/apply`}
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-10 py-3.5 rounded-xl text-center shadow-lg shadow-amber-500/20 transition duration-200"
            >
              Submit Application
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
