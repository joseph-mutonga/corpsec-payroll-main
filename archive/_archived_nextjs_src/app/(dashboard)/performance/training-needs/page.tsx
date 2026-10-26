'use client';

import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  PlusCircle,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  User,
  Check,
} from 'lucide-react';

interface TrainingNeed {
  id: string;
  needNumber: string;
  skill: string;
  identifiedNeed: string;
  priority: string;
  source: string;
  recommendedTraining?: string;
  targetDate?: string;
  status: string;
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
    department?: { name: string };
  };
  competency?: { name: string; code: string };
}

export default function TrainingNeedsPage() {
  const [needs, setNeeds] = useState<TrainingNeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [employees, setEmployees] = useState<Array<{ id: string; fullName: string; employeeNumber: string }>>([]);

  const [formData, setFormData] = useState({
    employeeId: '',
    skill: '',
    identifiedNeed: '',
    priority: 'MEDIUM',
    source: 'PERFORMANCE_REVIEW',
    recommendedTraining: '',
  });

  useEffect(() => {
    fetchNeeds();
    fetchEmployees();
  }, [priorityFilter, statusFilter]);

  const fetchNeeds = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (priorityFilter !== 'ALL') params.append('priority', priorityFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const res = await fetch(`/api/performance/training-needs?${params.toString()}`);
      const json = await res.json();
      if (json.success) setNeeds(json.data.trainingNeeds);
    } catch (e) {
      console.error('Failed to load training needs:', e);
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
      console.error('Failed to load employees:', e);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/performance/training-needs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setFormData({ employeeId: '', skill: '', identifiedNeed: '', priority: 'MEDIUM', source: 'PERFORMANCE_REVIEW', recommendedTraining: '' });
        fetchNeeds();
      }
    } catch (e) {
      console.error('Failed to save training need:', e);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await fetch(`/api/performance/training-needs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchNeeds();
    } catch (e) {
      console.error('Failed to update status:', e);
    }
  };

  const filteredNeeds = needs.filter((n) => {
    const term = searchTerm.toLowerCase();
    return (
      n.needNumber.toLowerCase().includes(term) ||
      n.skill.toLowerCase().includes(term) ||
      n.employee.fullName.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <BookOpen className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Training Needs Ledger</h1>
              <p className="text-sm text-zinc-400 mt-0.5">
                Competency gaps identified through appraisals, drills, and manager recommendations
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition"
        >
          <PlusCircle className="w-4 h-4" />
          Log Training Need
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-amber-500/20 border-t-amber-500"></div>
          <p className="text-sm text-zinc-500 mt-3 font-medium">Loading training needs...</p>
        </div>
      ) : filteredNeeds.length === 0 ? (
        <div className="bg-zinc-900/60 p-12 rounded-2xl border border-zinc-800 text-center">
          <BookOpen className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white">No Training Needs Logged</h3>
          <p className="text-sm text-zinc-400 mt-1 max-w-md mx-auto">
            Log specific tactical or compliance training requirements identified during performance reviews.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNeeds.map((need) => (
            <div
              key={need.id}
              className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80 hover:border-zinc-700/80 transition space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                  {need.needNumber}
                </span>
                <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-xs font-semibold rounded uppercase">
                  {need.priority}
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-white">{need.skill}</h3>
                <p className="text-xs text-zinc-400 mt-1">{need.identifiedNeed}</p>
              </div>

              {need.recommendedTraining && (
                <div className="p-2.5 bg-black/40 rounded-xl border border-zinc-800 text-xs">
                  <span className="text-zinc-500 font-semibold">Recommended Course:</span>
                  <p className="text-zinc-300 mt-0.5">{need.recommendedTraining}</p>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-zinc-800 text-xs">
                <span className="text-zinc-300 font-medium">{need.employee.fullName}</span>
                <select
                  value={need.status}
                  onChange={(e) => handleStatusChange(need.id, e.target.value)}
                  className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-white"
                >
                  <option value="IDENTIFIED">Identified</option>
                  <option value="APPROVED">Approved</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-white">Log Training Need</h3>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-zinc-300">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5">
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
                <label className="text-xs font-semibold text-zinc-300">Skill / Area *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CCTV PTZ Camera Tracking & Forensic Playback"
                  value={formData.skill}
                  onChange={(e) => setFormData({ ...formData, skill: e.target.value })}
                  className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Identified Need *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Specific gap or certification required..."
                  value={formData.identifiedNeed}
                  onChange={(e) => setFormData({ ...formData, identifiedNeed: e.target.value })}
                  className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
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
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">Source</label>
                  <select
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                  >
                    <option value="PERFORMANCE_REVIEW">Performance Review</option>
                    <option value="MANAGER_RECOMMENDATION">Manager Recommendation</option>
                    <option value="EMPLOYEE_REQUEST">Employee Request</option>
                    <option value="HR_ASSESSMENT">HR Assessment</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Recommended Course / Program</label>
                <input
                  type="text"
                  placeholder="e.g. Advanced CCTV Surveillance Certification (Level 2)"
                  value={formData.recommendedTraining}
                  onChange={(e) => setFormData({ ...formData, recommendedTraining: e.target.value })}
                  className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                />
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
                  className="px-5 py-2 bg-amber-500 text-black font-semibold text-xs rounded-xl"
                >
                  Save Training Need
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
