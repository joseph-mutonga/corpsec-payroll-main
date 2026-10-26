'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Award,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  FileCheck,
  Building2,
  Calendar,
} from 'lucide-react';

interface AssessmentItem {
  id: string;
  assessmentType: string;
  title: string;
  conductedDate: string;
  score?: number;
  maxScore?: number;
  result: string;
  comments?: string;
  candidate: { id: string; fullName: string; applicationNumber: string };
  evaluator?: { firstName: string; lastName: string };
}

export default function CandidateAssessmentsPage() {
  const [assessments, setAssessments] = useState<AssessmentItem[]>([]);
  const [candidates, setCandidates] = useState<Array<{ id: string; fullName: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form states
  const [candidateId, setCandidateId] = useState('');
  const [assessmentType, setAssessmentType] = useState('PRACTICAL');
  const [title, setTitle] = useState('');
  const [conductedDate, setConductedDate] = useState(new Date().toISOString().split('T')[0]);
  const [score, setScore] = useState('85');
  const [maxScore, setMaxScore] = useState('100');
  const [result, setResult] = useState<'PASS' | 'FAIL' | 'PENDING'>('PASS');
  const [comments, setComments] = useState('');

  useEffect(() => {
    fetchAssessments();
    fetchCandidates();
  }, []);

  const fetchAssessments = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/recruitment/assessments');
      const json = await res.json();
      if (json.success) setAssessments(json.data.assessments || []);
    } catch (e) {
      console.error('Failed to load assessments:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCandidates = async () => {
    try {
      const res = await fetch('/api/recruitment/applicants');
      const json = await res.json();
      if (json.success) setCandidates(json.data.applicants || []);
    } catch (e) {
      console.error('Failed to load candidates:', e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/recruitment/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId,
          assessmentType,
          title,
          conductedDate,
          score: parseFloat(score) || undefined,
          maxScore: parseFloat(maxScore) || 100,
          result,
          comments,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setShowAddModal(false);
        fetchAssessments();
      }
    } catch (e) {
      console.error('Error adding assessment:', e);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-amber-500 mb-1">
            <Award className="w-4 h-4" />
            <span>Skills & Practical Evaluations</span>
          </div>
          <h1 className="text-2xl font-black text-white">Candidate Assessments Desk</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Record, grade, and audit physical drills, CCTV VMS simulations, and written security exams.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center space-x-2 shadow-lg shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Record Assessment</span>
          </button>
        </div>
      </div>

      {/* Assessments Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Candidate & Ref</th>
                <th className="py-3.5 px-4">Assessment Title & Type</th>
                <th className="py-3.5 px-4">Conducted Date</th>
                <th className="py-3.5 px-4">Score</th>
                <th className="py-3.5 px-4">Result</th>
                <th className="py-3.5 px-4">Evaluator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Loading assessment records...
                  </td>
                </tr>
              ) : assessments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    No candidate assessment records found.
                  </td>
                </tr>
              ) : (
                assessments.map((ass) => (
                  <tr key={ass.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white text-sm">{ass.candidate.fullName}</div>
                      <div className="font-mono text-slate-500 text-[11px]">{ass.candidate.applicationNumber}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{ass.title}</div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        {ass.assessmentType}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-400">
                      {new Date(ass.conductedDate).toLocaleDateString('en-KE', { dateStyle: 'medium' })}
                    </td>

                    <td className="py-3.5 px-4 font-bold text-amber-400">
                      {ass.score !== undefined ? `${ass.score} / ${ass.maxScore || 100}` : 'Pending'}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-full font-semibold text-[11px] ${
                          ass.result === 'PASS'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : ass.result === 'FAIL'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {ass.result}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-400">
                      {ass.evaluator ? `${ass.evaluator.firstName} ${ass.evaluator.lastName}` : 'HR Team'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Record Candidate Assessment</h3>
            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Select Candidate *</label>
                <select
                  required
                  value={candidateId}
                  onChange={(e) => setCandidateId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">Choose candidate...</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Assessment Type *</label>
                <select
                  value={assessmentType}
                  onChange={(e) => setAssessmentType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="PRACTICAL">Practical Drill / Security Patrol Test</option>
                  <option value="TECHNICAL">Technical CCTV / Control Room Simulation</option>
                  <option value="WRITTEN">Written Security & Incident Report Exam</option>
                  <option value="SKILLS_TEST">Defensive Driving / Canine Handling</option>
                  <option value="OTHER">General Aptitude</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Assessment Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CCTV Alarm Escalation Simulation"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Score Obtained</label>
                  <input
                    type="number"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Result *</label>
                  <select
                    value={result}
                    onChange={(e) => setResult(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL</option>
                    <option value="PENDING">PENDING</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
                >
                  Save Assessment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
