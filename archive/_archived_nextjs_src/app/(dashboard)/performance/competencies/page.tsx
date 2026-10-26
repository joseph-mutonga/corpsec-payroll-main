'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  PlusCircle,
  Award,
  BookOpen,
  CheckCircle2,
  Users,
  MessageSquare,
} from 'lucide-react';

interface Competency {
  id: string;
  code: string;
  name: string;
  description?: string;
  category: string;
  defaultWeight: number;
  isActive: boolean;
}

export default function CompetenciesPage() {
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    category: 'CORE',
    defaultWeight: 15,
  });

  useEffect(() => {
    fetchCompetencies();
  }, []);

  const fetchCompetencies = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/performance/competencies');
      const json = await res.json();
      if (json.success) setCompetencies(json.data.competencies);
    } catch (e) {
      console.error('Failed to load competencies:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/performance/competencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setFormData({ code: '', name: '', description: '', category: 'CORE', defaultWeight: 15 });
        fetchCompetencies();
      }
    } catch (e) {
      console.error('Failed to create competency:', e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <ShieldCheck className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Competency Framework</h1>
              <p className="text-sm text-zinc-400 mt-0.5">
                Core behavioral rubrics, tactical security competencies & leadership standards
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition"
        >
          <PlusCircle className="w-4 h-4" />
          Add Competency
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-amber-500/20 border-t-amber-500"></div>
          <p className="text-sm text-zinc-500 mt-3 font-medium">Loading competencies...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {competencies.map((c) => (
            <div
              key={c.id}
              className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80 hover:border-zinc-700/80 transition space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                  {c.code}
                </span>
                <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-xs font-semibold rounded">
                  {c.category}
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-white">{c.name}</h3>
                {c.description && (
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{c.description}</p>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500 pt-2 border-t border-zinc-800">
                <span>Default Appraisal Weight</span>
                <span className="text-amber-400 font-mono font-bold">{c.defaultWeight}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-white">Create Competency</h3>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-zinc-300">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. COMP-DEESC"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white uppercase font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                  >
                    <option value="CORE">Core Behavior</option>
                    <option value="LEADERSHIP">Leadership</option>
                    <option value="FUNCTIONAL">Functional Tactical</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Competency Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Conflict De-escalation & Restraint"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Description & Rubrics</label>
                <textarea
                  rows={3}
                  placeholder="Evaluation standards and observable behaviors..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Default Weight (%)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={formData.defaultWeight}
                  onChange={(e) => setFormData({ ...formData, defaultWeight: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white font-mono"
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
                  Save Competency
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
