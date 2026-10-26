'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  MapPin,
  Building2,
  Clock,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  Award,
  ChevronRight,
} from 'lucide-react';

interface Vacancy {
  id: string;
  vacancyNumber: string;
  title: string;
  employmentType: string;
  openingsCount: number;
  description: string;
  skillsRequired?: string;
  experienceYears?: number;
  minSalary?: number;
  maxSalary?: number;
  showSalaryPublicly: boolean;
  applicationDeadline?: string;
  publishedAt?: string;
  department: { id: string; name: string };
  station?: { id: string; name: string; townCity?: string };
  branch?: { id: string; name: string; townCity?: string };
}

export default function PublicCareersPage() {
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  useEffect(() => {
    fetchVacancies();
  }, [deptFilter, typeFilter]);

  const fetchVacancies = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (deptFilter !== 'ALL') params.append('departmentId', deptFilter);
      if (typeFilter !== 'ALL') params.append('employmentType', typeFilter);
      if (search) params.append('search', search);

      const res = await fetch(`/api/careers?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setVacancies(json.data.vacancies || []);
      }
    } catch (e) {
      console.error('Failed to load careers:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchVacancies();
  };

  const filteredVacancies = vacancies.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      v.title.toLowerCase().includes(q) ||
      v.description.toLowerCase().includes(q) ||
      (v.skillsRequired && v.skillsRequired.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-amber-500 selection:text-slate-900 font-sans">
      {/* Header Banner */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <ShieldCheck className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white">CORPSEC</span>
              <span className="text-xs uppercase tracking-wider block text-amber-400 font-semibold">
                Careers & Opportunities
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              href="/login"
              className="text-xs font-semibold text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition"
            >
              Employee & HR Portal
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 border-b border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium mb-6">
            <Award className="w-3.5 h-3.5" />
            <span>Join Kenya's Premier Security & Guarding Force</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight">
            Build Your Career with{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500">
              CorpSec Security
            </span>
          </h1>

          <p className="mt-6 text-lg text-slate-400 max-w-2xl mx-auto">
            Discover opportunities across static guarding, rapid mobile patrols, surveillance operations, tactical
            security, and corporate administration.
          </p>

          {/* Search & Filter Bar */}
          <form onSubmit={handleSearchSubmit} className="mt-10 max-w-3xl mx-auto">
            <div className="bg-slate-900/90 p-2.5 rounded-2xl border border-slate-800 shadow-2xl flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1 flex items-center">
                <Search className="w-5 h-5 text-slate-400 absolute left-4" />
                <input
                  type="text"
                  placeholder="Search by job title, skills, or keyword..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter by Employment Type"
                className="bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-amber-500"
              >
                <option value="ALL">All Types</option>
                <option value="PERMANENT">Permanent</option>
                <option value="CONTRACT">Fixed-Term Contract</option>
                <option value="CASUAL">Casual Relief</option>
              </select>

              <button
                type="submit"
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-6 py-3 rounded-xl text-sm transition flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/20"
              >
                <span>Find Jobs</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Vacancy Listings */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Current Openings</h2>
            <p className="text-sm text-slate-400 mt-1">
              Showing {filteredVacancies.length} active opportunities available for application
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-52 bg-slate-900/50 rounded-2xl animate-pulse border border-slate-800" />
            ))}
          </div>
        ) : filteredVacancies.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800">
            <Briefcase className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-300">No matching vacancies found</h3>
            <p className="text-sm text-slate-500 mt-1">
              Try adjusting your search criteria or check back later for new openings.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredVacancies.map((vacancy) => (
              <div
                key={vacancy.id}
                className="group bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-6 transition-all duration-300 shadow-lg flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {vacancy.employmentType.replace('_', ' ')}
                      </span>
                      <h3 className="text-xl font-bold text-white mt-3 group-hover:text-amber-400 transition">
                        {vacancy.title}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 font-mono">{vacancy.vacancyNumber}</p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {vacancy.openingsCount} {vacancy.openingsCount === 1 ? 'Opening' : 'Openings'}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-slate-400 mt-4 line-clamp-2">{vacancy.description}</p>

                  <div className="mt-6 flex flex-wrap gap-4 text-xs text-slate-400">
                    <div className="flex items-center space-x-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-500" />
                      <span>{vacancy.department.name}</span>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      <span>{vacancy.station?.name || vacancy.branch?.townCity || 'Nairobi'}</span>
                    </div>

                    {vacancy.experienceYears && (
                      <div className="flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{vacancy.experienceYears}+ years exp</span>
                      </div>
                    )}
                  </div>

                  {vacancy.minSalary && vacancy.maxSalary && (
                    <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Gross Salary Range:</span>
                      <span className="text-amber-400 font-semibold">
                        KES {vacancy.minSalary.toLocaleString()} - {vacancy.maxSalary.toLocaleString()} / mo
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {vacancy.applicationDeadline
                      ? `Deadline: ${new Date(vacancy.applicationDeadline).toLocaleDateString('en-KE', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}`
                      : 'Open until filled'}
                  </span>

                  <Link
                    href={`/careers/${vacancy.id}`}
                    className="inline-flex items-center space-x-1 text-sm font-semibold text-amber-400 hover:text-amber-300 transition"
                  >
                    <span>View & Apply</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-12 text-center text-xs text-slate-500">
        <p>© 2026 CorpSec Investigations & Guarding Services Ltd. All rights reserved.</p>
        <p className="mt-1">P.O. Box 45678 - 00100 Nairobi, Kenya | Equal Opportunity Employer</p>
      </footer>
    </div>
  );
}
