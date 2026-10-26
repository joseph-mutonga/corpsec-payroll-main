'use client';

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  PlusCircle,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  Sliders,
  ChevronRight,
  Shield,
  Edit2,
  FileCheck,
} from 'lucide-react';

interface DevelopmentPlan {
  id: string;
  planNumber: string;
  planType: string;
  objective: string;
  skillGap: string;
  action: string;
  owner: string;
  startDate: string;
  targetDate: string;
  status: string;
  completionPercentage: number;
  outcomeNotes?: string;
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
    department?: { name: string };
  };
}

export default function DevelopmentPlansPage() {
  const [plans, setPlans] = useState<DevelopmentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [employees, setEmployees] = useState<Array<{ id: string; fullName: string; employeeNumber: string }>>([]);

  const [formData, setFormData] = useState({
    employeeId: '',
    planType: 'SKILL_DEVELOPMENT' as 'SKILL_DEVELOPMENT' | 'PIP' | 'LEADERSHIP_PREPARATION',
    objective: '',
    skillGap: '',
    action: '',
    owner: 'EMPLOYEE',
    startDate: '',
    targetDate: '',
  });

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPlans();
    fetchEmployees();
  }, [typeFilter, statusFilter]);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (typeFilter !== 'ALL') params.append('planType', typeFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const res = await fetch(`/api/performance/development?${params.toString()}`);
      const json = await res.json();
      if (json.success) setPlans(json.data.plans);
    } catch (e) {
      console.error('Failed to fetch development plans:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees');
      const json = await res.json();
      if (json.success) setEmployees(json.data.employees || json.data);
    } catch (e) {
      console.error('Failed to fetch employees:', e);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/performance/development', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message || 'Failed to create development plan.');
      } else {
        setShowModal(false);
        setFormData({
          employeeId: '',
          planType: 'SKILL_DEVELOPMENT',
          objective: '',
          skillGap: '',
          action: '',
          owner: 'EMPLOYEE',
          startDate: '',
          targetDate: '',
        });
        fetchPlans();
      }
    } catch (e: any) {
      setError(e.message || 'Network error.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPlans = plans.filter((p) => {
    const term = searchTerm.toLowerCase();
    return (
      p.planNumber.toLowerCase().includes(term) ||
      p.objective.toLowerCase().includes(term) ||
      p.employee.fullName.toLowerCase().includes(term) ||
      p.employee.employeeNumber.toLowerCase().includes(term)
    );
  });

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      COMPLETED: 'bg-emerald-950/60 text-emerald-400 border border-emerald-800',
      IN_PROGRESS: 'bg-blue-950/60 text-blue-400 border border-blue-800',
      NOT_STARTED: 'bg-zinc-800 text-zinc-400',
      ON_HOLD: 'bg-amber-950/60 text-amber-400 border border-amber-800',
      CANCELLED: 'bg-zinc-900 text-zinc-500 border border-zinc-700',
    };
    return (
      <span className={`px-2.5 py-0.5 rounded text-xs font-semibold ${map[status] || map.NOT_STARTED}`}>
        {status.replace(/_/g, ' ')}
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
              <TrendingUp className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Development & PIP Desk</h1>
              <p className="text-sm text-zinc-400 mt-0.5">
                Structured Performance Improvement Plans (PIPs) & personalized skill growth pathways
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition"
        >
          <PlusCircle className="w-4 h-4" />
          Create Development Plan / PIP
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by plan number, employee, or objective..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Types</option>
            <option value="PIP">Performance Improvement Plan (PIP)</option>
            <option value="SKILL_DEVELOPMENT">Skill Development</option>
            <option value="LEADERSHIP_PREPARATION">Leadership Preparation</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="NOT_STARTED">Not Started</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="ON_HOLD">On Hold</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-amber-500/20 border-t-amber-500"></div>
          <p className="text-sm text-zinc-500 mt-3 font-medium">Loading development plans...</p>
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="bg-zinc-900/60 p-12 rounded-2xl border border-zinc-800 text-center">
          <TrendingUp className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white">No Development Plans Found</h3>
          <p className="text-sm text-zinc-400 mt-1 max-w-md mx-auto">
            Design targeted improvement roadmaps and PIP milestones for team members.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPlans.map((plan) => (
            <div
              key={plan.id}
              className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80 hover:border-zinc-700/80 transition space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                  {plan.planNumber}
                </span>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-xs font-semibold rounded">
                    {plan.planType}
                  </span>
                  {getStatusBadge(plan.status)}
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-white">{plan.objective}</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  <strong className="text-zinc-300">Skill Gap:</strong> {plan.skillGap}
                </p>
              </div>

              <div className="p-3 bg-black/40 rounded-xl border border-zinc-800 text-xs space-y-1">
                <p className="text-zinc-400">
                  <strong className="text-zinc-300">Action Plan:</strong> {plan.action}
                </p>
                <p className="text-zinc-500">
                  <strong>Accountable Owner:</strong> {plan.owner}
                </p>
              </div>

              {/* Progress */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Completion Milestone</span>
                  <span className="text-amber-400 font-mono font-bold">{plan.completionPercentage}%</span>
                </div>
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${plan.completionPercentage}%` }} />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-800 text-xs text-zinc-400">
                <span className="text-zinc-300 font-medium">{plan.employee.fullName}</span>
                <span className="text-zinc-500">Target: {new Date(plan.targetDate).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-white">Create Development Plan / PIP</h3>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-zinc-300">
                ✕
              </button>
            </div>

            {error && <div className="p-3 bg-rose-950/40 border border-rose-900/60 text-xs text-rose-400 rounded-xl">{error}</div>}

            <form onSubmit={handleCreatePlan} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">Employee *</label>
                  <select
                    required
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                  >
                    <option value="">Select Employee...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.employeeNumber})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">Plan Type</label>
                  <select
                    value={formData.planType}
                    onChange={(e) => setFormData({ ...formData, planType: e.target.value as any })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                  >
                    <option value="SKILL_DEVELOPMENT">Skill Development</option>
                    <option value="PIP">Performance Improvement Plan (PIP)</option>
                    <option value="LEADERSHIP_PREPARATION">Leadership Preparation</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Objective *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master Biometric Surveillance Logs & Patrol Routing"
                  value={formData.objective}
                  onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                  className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Identified Skill Gap *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Inconsistent logging of shift handover checks"
                  value={formData.skillGap}
                  onChange={(e) => setFormData({ ...formData, skillGap: e.target.value })}
                  className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Corrective / Growth Actions *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Actionable steps, training, and mentoring checkpoints..."
                  value={formData.action}
                  onChange={(e) => setFormData({ ...formData, action: e.target.value })}
                  className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">Target Completion Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.targetDate}
                    onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-zinc-800 text-xs text-zinc-300 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-500 text-black font-semibold text-xs rounded-xl"
                >
                  Save Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
