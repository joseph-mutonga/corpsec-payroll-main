'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Plus,
  Search,
  Filter,
  Building2,
  MapPin,
  Calendar,
  Users,
  Eye,
  Copy,
  PauseCircle,
  PlayCircle,
  XCircle,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';

interface VacancyItem {
  id: string;
  vacancyNumber: string;
  title: string;
  employmentType: string;
  openingsCount: number;
  description: string;
  status: string;
  minSalary?: number;
  maxSalary?: number;
  showSalaryPublicly: boolean;
  applicationDeadline?: string;
  createdAt: string;
  department: { id: string; name: string };
  station?: { id: string; name: string };
  _count: { candidates: number };
}

export default function VacancyManagementPage() {
  const [vacancies, setVacancies] = useState<VacancyItem[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [stations, setStations] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form states for creating vacancy
  const [formTitle, setFormTitle] = useState('');
  const [formDeptId, setFormDeptId] = useState('');
  const [formStationId, setFormStationId] = useState('');
  const [formEmpType, setFormEmpType] = useState('PERMANENT');
  const [formOpenings, setFormOpenings] = useState('1');
  const [formDesc, setFormDesc] = useState('');
  const [formResp, setFormResp] = useState('');
  const [formReqs, setFormReqs] = useState('');
  const [formMinSalary, setFormMinSalary] = useState('');
  const [formMaxSalary, setFormMaxSalary] = useState('');
  const [formShowSalary, setFormShowSalary] = useState(false);
  const [formDeadline, setFormDeadline] = useState('');
  const [formStatus, setFormStatus] = useState('OPEN');

  useEffect(() => {
    fetchVacancies();
    fetchOrgMetadata();
  }, [statusFilter]);

  const fetchVacancies = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (search) params.append('search', search);

      const res = await fetch(`/api/recruitment/vacancies?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setVacancies(json.data.vacancies || []);
      }
    } catch (e) {
      console.error('Failed to load vacancies:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrgMetadata = async () => {
    try {
      const [deptRes, stnRes] = await Promise.all([
        fetch('/api/departments'),
        fetch('/api/stations'),
      ]);
      const deptJson = await deptRes.json();
      const stnJson = await stnRes.json();
      if (deptJson.success) setDepartments(deptJson.data || []);
      if (stnJson.success) setStations(stnJson.data || []);
    } catch (e) {
      console.error('Failed to load metadata:', e);
    }
  };

  const handleCreateVacancy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/recruitment/vacancies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle,
          departmentId: formDeptId || departments[0]?.id,
          stationId: formStationId || undefined,
          employmentType: formEmpType,
          openingsCount: parseInt(formOpenings, 10) || 1,
          description: formDesc,
          responsibilities: formResp,
          requirements: formReqs,
          minSalary: formMinSalary ? parseFloat(formMinSalary) : undefined,
          maxSalary: formMaxSalary ? parseFloat(formMaxSalary) : undefined,
          showSalaryPublicly: formShowSalary,
          applicationDeadline: formDeadline || undefined,
          status: formStatus,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to create vacancy');
      }

      setFeedback({ type: 'success', message: 'Vacancy created successfully.' });
      setShowCreateModal(false);
      // Reset form
      setFormTitle('');
      setFormDesc('');
      setFormResp('');
      setFormReqs('');
      fetchVacancies();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/recruitment/vacancies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        setFeedback({ type: 'success', message: `Vacancy updated to ${newStatus}.` });
        fetchVacancies();
      }
    } catch (e) {
      console.error('Error changing status:', e);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const res = await fetch(`/api/recruitment/vacancies/${id}/duplicate`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        setFeedback({ type: 'success', message: 'Vacancy duplicated to draft successfully.' });
        fetchVacancies();
      }
    } catch (e) {
      console.error('Error duplicating vacancy:', e);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-amber-500 mb-1">
            <Briefcase className="w-4 h-4" />
            <span>Job Positions & Openings</span>
          </div>
          <h1 className="text-2xl font-black text-white">Vacancy Management</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Create, publish, duplicate, and monitor recruitment requisitions across guarding stations.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center space-x-2 shadow-lg shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Vacancy</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search vacancies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchVacancies()}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open / Active</option>
            <option value="DRAFT">Draft</option>
            <option value="PAUSED">Paused</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      </div>

      {/* Vacancies Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Vacancy No & Title</th>
                <th className="py-3.5 px-4">Department & Station</th>
                <th className="py-3.5 px-4">Type & Openings</th>
                <th className="py-3.5 px-4">Applicants</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Deadline</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    Loading vacancies...
                  </td>
                </tr>
              ) : vacancies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    No vacancies found matching current filters.
                  </td>
                </tr>
              ) : (
                vacancies.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white text-sm">{v.title}</div>
                      <div className="font-mono text-slate-500 text-[11px]">{v.vacancyNumber}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div>{v.department.name}</div>
                      <div className="text-slate-500 text-[11px]">{v.station?.name || 'HQ / All Stations'}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">
                        {v.employmentType}
                      </span>
                      <div className="text-slate-500 text-[11px] mt-0.5">{v.openingsCount} Openings</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <Link
                        href={`/recruitment/applicants?vacancyId=${v.id}`}
                        className="font-bold text-blue-400 hover:underline"
                      >
                        {v._count.candidates} Candidates
                      </Link>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-full font-semibold text-[11px] ${
                          v.status === 'OPEN'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : v.status === 'DRAFT'
                            ? 'bg-slate-800 text-slate-400'
                            : v.status === 'PAUSED'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {v.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-400">
                      {v.applicationDeadline
                        ? new Date(v.applicationDeadline).toLocaleDateString('en-KE', {
                            dateStyle: 'medium',
                          })
                        : 'No deadline'}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <Link
                          href={`/recruitment/vacancies/${v.id}`}
                          title="View Details"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>

                        <button
                          onClick={() => handleDuplicate(v.id)}
                          title="Duplicate Vacancy"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                        >
                          <Copy className="w-4 h-4" />
                        </button>

                        {v.status === 'OPEN' ? (
                          <button
                            onClick={() => handleStatusChange(v.id, 'PAUSED')}
                            title="Pause Vacancy"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-900/40 text-amber-400"
                          >
                            <PauseCircle className="w-4 h-4" />
                          </button>
                        ) : v.status === 'PAUSED' || v.status === 'DRAFT' ? (
                          <button
                            onClick={() => handleStatusChange(v.id, 'OPEN')}
                            title="Publish / Open"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-emerald-900/40 text-emerald-400"
                          >
                            <PlayCircle className="w-4 h-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Vacancy Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
              <div>
                <h3 className="text-lg font-bold text-white">Create New Vacancy</h3>
                <p className="text-xs text-slate-400">Add a new job requisition to the Applicant Tracking System.</p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-500 hover:text-white text-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateVacancy} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Job Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Armed Escort Guard / CCTV Operator"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Department *</label>
                  <select
                    value={formDeptId}
                    onChange={(e) => setFormDeptId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Station / Site</label>
                  <select
                    value={formStationId}
                    onChange={(e) => setFormStationId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">All Stations (HQ)</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Employment Type</label>
                  <select
                    value={formEmpType}
                    onChange={(e) => setFormEmpType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="PERMANENT">Permanent</option>
                    <option value="CONTRACT">Fixed-Term Contract</option>
                    <option value="CASUAL">Casual Relief</option>
                    <option value="INTERN">Intern</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Openings Count</label>
                  <input
                    type="number"
                    min="1"
                    value={formOpenings}
                    onChange={(e) => setFormOpenings(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Initial Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="OPEN">Open (Live on Careers)</option>
                    <option value="DRAFT">Draft</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Job Description *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Primary overview of duties and responsibilities..."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Key Responsibilities (One per line)</label>
                <textarea
                  rows={2}
                  placeholder="- Access control at main gate&#10;- Daily patrol logs..."
                  value={formResp}
                  onChange={(e) => setFormResp(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Requirements & Qualifications</label>
                <textarea
                  rows={2}
                  placeholder="- Certificate of Good Conduct&#10;- Minimum KCSE D+..."
                  value={formReqs}
                  onChange={(e) => setFormReqs(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Min Gross Salary (KES)</label>
                  <input
                    type="number"
                    placeholder="e.g. 25000"
                    value={formMinSalary}
                    onChange={(e) => setFormMinSalary(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Max Gross Salary (KES)</label>
                  <input
                    type="number"
                    placeholder="e.g. 30000"
                    value={formMaxSalary}
                    onChange={(e) => setFormMaxSalary(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="showSalary"
                  checked={formShowSalary}
                  onChange={(e) => setFormShowSalary(e.target.checked)}
                  className="rounded border-slate-800 text-amber-500 focus:ring-0"
                />
                <label htmlFor="showSalary" className="text-slate-300 text-xs">
                  Display salary range publicly on Careers Portal
                </label>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Application Deadline</label>
                <input
                  type="date"
                  value={formDeadline}
                  onChange={(e) => setFormDeadline(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
                >
                  {saving ? 'Creating...' : 'Create Vacancy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
