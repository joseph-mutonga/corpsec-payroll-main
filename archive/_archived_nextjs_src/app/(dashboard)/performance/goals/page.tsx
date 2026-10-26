'use client';

import React, { useState, useEffect } from 'react';
import {
  Target,
  PlusCircle,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  User,
  Sliders,
  ChevronRight,
  Shield,
  Edit2,
} from 'lucide-react';

interface Goal {
  id: string;
  goalNumber: string;
  title: string;
  description?: string;
  category: string;
  priority: string;
  weight: number;
  target?: string;
  measurementMethod?: string;
  startDate: string;
  dueDate: string;
  status: string;
  progressPercentage: number;
  selfRating?: number;
  managerRating?: number;
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
    department?: { name: string };
  };
  cycle: {
    id: string;
    code: string;
    name: string;
    status: string;
  };
}

export default function GoalsManagementPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [cycles, setCycles] = useState<Array<{ id: string; name: string }>>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; fullName: string; employeeNumber: string }>>([]);

  const [formData, setFormData] = useState({
    employeeId: '',
    cycleId: '',
    title: '',
    description: '',
    category: 'OPERATIONAL',
    priority: 'MEDIUM',
    weight: 25,
    target: '',
    measurementMethod: '',
    startDate: '',
    dueDate: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchGoals();
    fetchDependencies();
  }, [statusFilter]);

  const fetchGoals = async () => {
    try {
      setLoading(true);
      const url = statusFilter !== 'ALL'
        ? `/api/performance/goals?status=${statusFilter}`
        : '/api/performance/goals';
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setGoals(json.data.goals);
      }
    } catch (e) {
      console.error('Failed to fetch goals:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDependencies = async () => {
    try {
      const [cyclesRes, empRes] = await Promise.all([
        fetch('/api/performance/cycles'),
        fetch('/api/employees'),
      ]);
      const cyclesJson = await cyclesRes.json();
      const empJson = await empRes.json();
      if (cyclesJson.success) setCycles(cyclesJson.data.cycles);
      if (empJson.success) setEmployees(empJson.data.employees || empJson.data);
    } catch (e) {
      console.error('Failed to fetch cycles or employees:', e);
    }
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/performance/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message || 'Failed to create goal.');
      } else {
        setShowModal(false);
        setFormData({
          employeeId: '',
          cycleId: '',
          title: '',
          description: '',
          category: 'OPERATIONAL',
          priority: 'MEDIUM',
          weight: 25,
          target: '',
          measurementMethod: '',
          startDate: '',
          dueDate: '',
        });
        fetchGoals();
      }
    } catch (e: any) {
      setError(e.message || 'Network error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredGoals = goals.filter((g) => {
    const term = searchTerm.toLowerCase();
    return (
      g.title.toLowerCase().includes(term) ||
      g.goalNumber.toLowerCase().includes(term) ||
      g.employee.fullName.toLowerCase().includes(term) ||
      g.employee.employeeNumber.toLowerCase().includes(term)
    );
  });

  const getPriorityBadge = (priority: string) => {
    const map: Record<string, string> = {
      CRITICAL: 'bg-rose-950/60 border border-rose-800 text-rose-400',
      HIGH: 'bg-amber-950/60 border border-amber-800 text-amber-400',
      MEDIUM: 'bg-blue-950/60 border border-blue-800 text-blue-400',
      LOW: 'bg-zinc-800 text-zinc-400',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${map[priority] || map.MEDIUM}`}>
        {priority}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      COMPLETED: 'bg-emerald-950/60 text-emerald-400 border border-emerald-800',
      IN_PROGRESS: 'bg-blue-950/60 text-blue-400 border border-blue-800',
      ACTIVE: 'bg-teal-950/60 text-teal-400 border border-teal-800',
      DRAFT: 'bg-zinc-800 text-zinc-400',
      OVERDUE: 'bg-rose-950/60 text-rose-400 border border-rose-800',
      CANCELLED: 'bg-zinc-900 text-zinc-500 border border-zinc-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${map[status] || map.ACTIVE}`}>
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
              <Target className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">SMART Goal Management</h1>
              <p className="text-sm text-zinc-400 mt-0.5">
                Specific, Measurable, Achievable, Relevant & Time-Bound objective tracking
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition"
        >
          <PlusCircle className="w-4 h-4" />
          Add SMART Goal
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by goal title, reference number, or employee..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="OVERDUE">Overdue</option>
            <option value="DRAFT">Draft</option>
          </select>
        </div>
      </div>

      {/* Goals Grid */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-amber-500/20 border-t-amber-500"></div>
          <p className="text-sm text-zinc-500 mt-3 font-medium">Loading goals...</p>
        </div>
      ) : filteredGoals.length === 0 ? (
        <div className="bg-zinc-900/60 p-12 rounded-2xl border border-zinc-800 text-center">
          <Target className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white">No Performance Goals Found</h3>
          <p className="text-sm text-zinc-400 mt-1 max-w-md mx-auto">
            Assign strategic SMART goals to workforce personnel with balanced weights.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 px-4 py-2 bg-amber-500 text-black font-semibold text-sm rounded-xl"
          >
            Create Goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredGoals.map((g) => (
            <div
              key={g.id}
              className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80 hover:border-zinc-700/80 transition space-y-3.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-zinc-500">{g.goalNumber}</span>
                <div className="flex items-center gap-2">
                  {getPriorityBadge(g.priority)}
                  {getStatusBadge(g.status)}
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-white">{g.title}</h3>
                {g.description && <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{g.description}</p>}
              </div>

              {/* SMART Target & Measurement */}
              {g.target && (
                <div className="p-3 bg-black/40 rounded-xl border border-zinc-800/80 text-xs space-y-1">
                  <p className="text-zinc-400">
                    <strong className="text-zinc-300">Target Outcome:</strong> {g.target}
                  </p>
                  {g.measurementMethod && (
                    <p className="text-zinc-500">
                      <strong>Method:</strong> {g.measurementMethod}
                    </p>
                  )}
                </div>
              )}

              {/* Progress & Weight */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">
                    Weight: <strong className="text-amber-400 font-mono">{g.weight}%</strong>
                  </span>
                  <span className="text-zinc-300 font-mono">
                    Progress: <strong>{g.progressPercentage}%</strong>
                  </span>
                </div>
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${g.progressPercentage}%` }}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 text-xs text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="text-zinc-300 font-medium">{g.employee.fullName}</span>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Due: {new Date(g.dueDate).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SMART Goal Creator Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white">Define SMART Performance Goal</h3>
                <p className="text-xs text-zinc-400">
                  Specific, Measurable, Achievable, Relevant, and Time-bound target
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

            <form onSubmit={handleCreateGoal} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Assign To Employee *</label>
                  <select
                    required
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Select Employee...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} ({emp.employeeNumber})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Performance Cycle *</label>
                  <select
                    required
                    value={formData.cycleId}
                    onChange={(e) => setFormData({ ...formData, cycleId: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Select Cycle...</option>
                    {cycles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Goal Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Reduce Patrol Response Latency to Under 8 Minutes"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                  >
                    <option value="OPERATIONAL">Operational</option>
                    <option value="STRATEGIC">Strategic</option>
                    <option value="CUSTOMER">Customer / Client</option>
                    <option value="FINANCIAL">Financial</option>
                    <option value="DEVELOPMENT">Development</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Weight (%) *</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white font-mono"
                  />
                </div>
              </div>

              {/* SMART Measurable Details */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">
                  Target Outcome (Specific & Measurable Target)
                </label>
                <textarea
                  rows={2}
                  placeholder="Define the exact quantifiable target to achieve..."
                  value={formData.target}
                  onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Measurement Method</label>
                <input
                  type="text"
                  placeholder="e.g. Biometric patrol log timestamps & incident response logs"
                  value={formData.measurementMethod}
                  onChange={(e) => setFormData({ ...formData, measurementMethod: e.target.value })}
                  className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
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
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Due Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                  />
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
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-sm rounded-xl transition disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Assign Goal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
