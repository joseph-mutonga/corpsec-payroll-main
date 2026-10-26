'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  Layers,
  ChevronRight,
  Sliders,
  Archive,
  RefreshCw,
} from 'lucide-react';

interface Cycle {
  id: string;
  code: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  selfAssessmentDeadline: string;
  managerReviewDeadline: string;
  reviewDeadline: string;
  status: string;
  weightsConfig?: string;
  _count: {
    reviews: number;
    goals: number;
    kpiAssignments: number;
    developmentPlans: number;
  };
}

export default function PerformanceCyclesPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    selfAssessmentDeadline: '',
    managerReviewDeadline: '',
    reviewDeadline: '',
    goalsWeight: 50,
    kpisWeight: 30,
    competenciesWeight: 20,
  });
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchCycles();
  }, []);

  const fetchCycles = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/performance/cycles');
      const json = await res.json();
      if (json.success) {
        setCycles(json.data.cycles);
      }
    } catch (e) {
      console.error('Failed to load cycles:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setActionLoading(true);

    const totalWeight =
      Number(formData.goalsWeight) +
      Number(formData.kpisWeight) +
      Number(formData.competenciesWeight);

    if (totalWeight !== 100) {
      setError(`Component weights must sum to exactly 100% (Current sum: ${totalWeight}%).`);
      setActionLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/performance/cycles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          startDate: formData.startDate,
          endDate: formData.endDate,
          selfAssessmentDeadline: formData.selfAssessmentDeadline,
          managerReviewDeadline: formData.managerReviewDeadline,
          reviewDeadline: formData.reviewDeadline,
          weightsConfig: {
            goalsWeight: Number(formData.goalsWeight),
            kpisWeight: Number(formData.kpisWeight),
            competenciesWeight: Number(formData.competenciesWeight),
          },
        }),
      });

      const json = await res.json();
      if (!json.success) {
        setError(json.message || 'Failed to create performance cycle.');
      } else {
        setShowModal(false);
        setFormData({
          name: '',
          description: '',
          startDate: '',
          endDate: '',
          selfAssessmentDeadline: '',
          managerReviewDeadline: '',
          reviewDeadline: '',
          goalsWeight: 50,
          kpisWeight: 30,
          competenciesWeight: 20,
        });
        fetchCycles();
      }
    } catch (e: any) {
      setError(e.message || 'Network error occurred.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/performance/cycles/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!json.success) {
        alert(`Error: ${json.message}`);
      } else {
        fetchCycles();
      }
    } catch (e: any) {
      alert(`Error updating cycle: ${e.message}`);
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string }> = {
      DRAFT: { bg: 'bg-zinc-800 text-zinc-400', text: 'Draft' },
      OPEN: { bg: 'bg-emerald-950/60 border border-emerald-800/60 text-emerald-400', text: 'Open' },
      SELF_ASSESSMENT: { bg: 'bg-blue-950/60 border border-blue-800/60 text-blue-400', text: 'Self Assessment' },
      MANAGER_REVIEW: { bg: 'bg-purple-950/60 border border-purple-800/60 text-purple-400', text: 'Manager Review' },
      CALIBRATION: { bg: 'bg-amber-950/60 border border-amber-800/60 text-amber-400', text: 'Calibration' },
      COMPLETED: { bg: 'bg-teal-950/60 border border-teal-800/60 text-teal-400', text: 'Completed' },
      ARCHIVED: { bg: 'bg-zinc-900 border border-zinc-700 text-zinc-500', text: 'Archived' },
    };
    const s = map[status] || { bg: 'bg-zinc-800 text-zinc-300', text: status };
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${s.bg}`}>
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
              <Calendar className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Performance Cycles
              </h1>
              <p className="text-sm text-zinc-400 mt-0.5">
                Configure annual, mid-year, and probationary review timelines and scoring rubrics
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition"
        >
          <PlusCircle className="w-4 h-4" />
          Create Performance Cycle
        </button>
      </div>

      {/* Cycles List */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-amber-500/20 border-t-amber-500"></div>
          <p className="text-sm text-zinc-500 mt-3 font-medium">Loading performance cycles...</p>
        </div>
      ) : cycles.length === 0 ? (
        <div className="bg-zinc-900/60 p-12 rounded-2xl border border-zinc-800 text-center">
          <Calendar className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white">No Performance Cycles Found</h3>
          <p className="text-sm text-zinc-400 mt-1 max-w-md mx-auto">
            Create your first performance appraisal cycle to begin scheduling employee self-assessments and reviews.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 px-4 py-2 bg-amber-500 text-black font-semibold text-sm rounded-xl"
          >
            Create Cycle Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {cycles.map((cycle) => (
            <div
              key={cycle.id}
              className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800/80 hover:border-zinc-700/80 transition space-y-4"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                      {cycle.code}
                    </span>
                    {getStatusBadge(cycle.status)}
                  </div>
                  <h3 className="text-lg font-bold text-white">{cycle.name}</h3>
                  {cycle.description && (
                    <p className="text-xs text-zinc-400">{cycle.description}</p>
                  )}
                </div>

                {/* Workflow Transitions */}
                <div className="flex flex-wrap items-center gap-2">
                  {cycle.status === 'DRAFT' && (
                    <button
                      onClick={() => handleStatusChange(cycle.id, 'OPEN')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg transition"
                    >
                      Open Cycle
                    </button>
                  )}
                  {cycle.status === 'OPEN' && (
                    <button
                      onClick={() => handleStatusChange(cycle.id, 'SELF_ASSESSMENT')}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-lg transition"
                    >
                      Start Self-Assessment
                    </button>
                  )}
                  {cycle.status === 'SELF_ASSESSMENT' && (
                    <button
                      onClick={() => handleStatusChange(cycle.id, 'MANAGER_REVIEW')}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs rounded-lg transition"
                    >
                      Move to Manager Review
                    </button>
                  )}
                  {cycle.status === 'MANAGER_REVIEW' && (
                    <>
                      <button
                        onClick={() => handleStatusChange(cycle.id, 'CALIBRATION')}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-black font-medium text-xs rounded-lg transition"
                      >
                        Start Calibration
                      </button>
                      <button
                        onClick={() => handleStatusChange(cycle.id, 'COMPLETED')}
                        className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs rounded-lg transition"
                      >
                        Complete Cycle
                      </button>
                    </>
                  )}
                  {cycle.status === 'CALIBRATION' && (
                    <button
                      onClick={() => handleStatusChange(cycle.id, 'COMPLETED')}
                      className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs rounded-lg transition"
                    >
                      Finalize & Complete
                    </button>
                  )}
                  {cycle.status === 'COMPLETED' && (
                    <button
                      onClick={() => handleStatusChange(cycle.id, 'ARCHIVED')}
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-xs rounded-lg transition"
                    >
                      Archive Cycle
                    </button>
                  )}
                </div>
              </div>

              {/* Deadlines Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-black/40 p-3.5 rounded-xl border border-zinc-800/80 text-xs">
                <div>
                  <p className="text-zinc-500">Cycle Window</p>
                  <p className="text-zinc-300 font-medium mt-0.5">
                    {new Date(cycle.startDate).toLocaleDateString()} —{' '}
                    {new Date(cycle.endDate).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Self-Assessment Deadline</p>
                  <p className="text-blue-400 font-medium mt-0.5">
                    {new Date(cycle.selfAssessmentDeadline).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Manager Review Deadline</p>
                  <p className="text-purple-400 font-medium mt-0.5">
                    {new Date(cycle.managerReviewDeadline).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Final Review Close</p>
                  <p className="text-amber-400 font-medium mt-0.5">
                    {new Date(cycle.reviewDeadline).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Counts Badge */}
              <div className="flex items-center gap-4 text-xs text-zinc-400 pt-1">
                <span>
                  Reviews:{' '}
                  <strong className="text-white font-mono">{cycle._count.reviews}</strong>
                </span>
                <span>•</span>
                <span>
                  Goals:{' '}
                  <strong className="text-white font-mono">{cycle._count.goals}</strong>
                </span>
                <span>•</span>
                <span>
                  KPIs Assigned:{' '}
                  <strong className="text-white font-mono">{cycle._count.kpiAssignments}</strong>
                </span>
                <span>•</span>
                <span>
                  PIPs / Dev Plans:{' '}
                  <strong className="text-white font-mono">{cycle._count.developmentPlans}</strong>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Cycle Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Create Performance Appraisal Cycle</h3>
                <p className="text-xs text-zinc-400">
                  Establish timelines, appraisal milestones, and component weighting
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-zinc-500 hover:text-zinc-300 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="p-3 bg-rose-950/40 border border-rose-900/60 rounded-xl text-xs text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateCycle} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Cycle Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Annual Performance Review 2026"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Description</label>
                <textarea
                  rows={2}
                  placeholder="Appraisal objectives, scope, and instructions..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">End Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Self-Assess Deadline *</label>
                  <input
                    type="date"
                    required
                    value={formData.selfAssessmentDeadline}
                    onChange={(e) =>
                      setFormData({ ...formData, selfAssessmentDeadline: e.target.value })
                    }
                    className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Manager Review Due *</label>
                  <input
                    type="date"
                    required
                    value={formData.managerReviewDeadline}
                    onChange={(e) =>
                      setFormData({ ...formData, managerReviewDeadline: e.target.value })
                    }
                    className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Final Review Close *</label>
                  <input
                    type="date"
                    required
                    value={formData.reviewDeadline}
                    onChange={(e) => setFormData({ ...formData, reviewDeadline: e.target.value })}
                    className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Scoring Weights Configuration */}
              <div className="p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-amber-400" /> Component Scoring Weights
                  </h4>
                  <span className="text-xs text-zinc-400">Total must equal 100%</span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">Goals Weight (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={formData.goalsWeight}
                      onChange={(e) =>
                        setFormData({ ...formData, goalsWeight: Number(e.target.value) })
                      }
                      className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">KPIs Weight (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={formData.kpisWeight}
                      onChange={(e) =>
                        setFormData({ ...formData, kpisWeight: Number(e.target.value) })
                      }
                      className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">Competencies (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={formData.competenciesWeight}
                      onChange={(e) =>
                        setFormData({ ...formData, competenciesWeight: Number(e.target.value) })
                      }
                      className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-sm rounded-xl transition disabled:opacity-50"
                >
                  {actionLoading ? 'Creating...' : 'Create Cycle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
