'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Video,
  Phone,
  FileCheck,
  Star,
} from 'lucide-react';

interface InterviewItem {
  id: string;
  interviewType: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  location?: string;
  meetingLink?: string;
  status: string;
  notes?: string;
  candidate: { id: string; fullName: string; applicationNumber: string; email: string; phone: string };
  vacancy: { id: string; title: string; vacancyNumber: string };
  panelMembers: Array<{
    interviewer: { id: string; firstName: string; lastName: string; email: string };
    role?: string;
    recommendation?: string;
    overallScore?: number;
  }>;
}

export default function InterviewManagementPage() {
  const [interviews, setInterviews] = useState<InterviewItem[]>([]);
  const [candidates, setCandidates] = useState<Array<{ id: string; fullName: string; vacancyId: string; vacancy: { title: string } }>>([]);
  const [users, setUsers] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showScorecardModal, setShowScorecardModal] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState<InterviewItem | null>(null);

  // Form states for scheduling
  const [candidateId, setCandidateId] = useState('');
  const [interviewType, setInterviewType] = useState('PANEL');
  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [location, setLocation] = useState('CorpSec HQ Boardroom, Upper Hill');
  const [meetingLink, setMeetingLink] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedPanelUser, setSelectedPanelUser] = useState('');

  // Scorecard states
  const [scoreCommunication, setScoreCommunication] = useState(4);
  const [scoreTechnical, setScoreTechnical] = useState(4);
  const [scoreExperience, setScoreExperience] = useState(4);
  const [scoreProblemSolving, setScoreProblemSolving] = useState(4);
  const [scoreProfessionalism, setScoreProfessionalism] = useState(4);
  const [overallRec, setOverallRec] = useState<'HIRE' | 'HOLD' | 'REJECT'>('HIRE');
  const [scoreComments, setScoreComments] = useState('');
  const [savingScorecard, setSavingScorecard] = useState(false);

  useEffect(() => {
    fetchInterviews();
    fetchMetadata();
  }, [statusFilter]);

  const fetchInterviews = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const res = await fetch(`/api/recruitment/interviews?${params.toString()}`);
      const json = await res.json();
      if (json.success) setInterviews(json.data.interviews || []);
    } catch (e) {
      console.error('Failed to load interviews:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      const [candRes, userRes] = await Promise.all([
        fetch('/api/recruitment/applicants?stage=INTERVIEW'),
        fetch('/api/users'),
      ]);
      const candJson = await candRes.json();
      const userJson = await userRes.json();
      if (candJson.success) setCandidates(candJson.data.applicants || []);
      if (userJson.success) setUsers(userJson.data || []);
    } catch (e) {
      console.error('Error loading metadata:', e);
    }
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cand = candidates.find((c) => c.id === candidateId);
    if (!cand) return;

    try {
      const res = await fetch('/api/recruitment/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId,
          vacancyId: cand.vacancyId,
          interviewType,
          scheduledDate,
          startTime,
          endTime,
          location,
          meetingLink,
          notes,
          panelMemberIds: selectedPanelUser ? [{ interviewerId: selectedPanelUser, role: 'Lead Evaluator' }] : undefined,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setShowScheduleModal(false);
        fetchInterviews();
      }
    } catch (e) {
      console.error('Error scheduling interview:', e);
    }
  };

  const handleScorecardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInterview) return;
    setSavingScorecard(true);

    try {
      const scores = [
        { category: 'COMMUNICATION', score: scoreCommunication },
        { category: 'TECHNICAL_SKILLS', score: scoreTechnical },
        { category: 'EXPERIENCE', score: scoreExperience },
        { category: 'PROBLEM_SOLVING', score: scoreProblemSolving },
        { category: 'PROFESSIONALISM', score: scoreProfessionalism },
      ];

      const res = await fetch(`/api/recruitment/interviews/${selectedInterview.id}/scorecard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scores,
          overallRecommendation: overallRec,
          panelComments: scoreComments,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setShowScorecardModal(false);
        fetchInterviews();
      }
    } catch (e) {
      console.error('Error submitting scorecard:', e);
    } finally {
      setSavingScorecard(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-amber-500 mb-1">
            <Calendar className="w-4 h-4" />
            <span>Interview Scheduling & Panels</span>
          </div>
          <h1 className="text-2xl font-black text-white">Interview Management Desk</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Coordinate interview rounds, assign multi-member panels, and evaluate structured scorecards.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowScheduleModal(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center space-x-2 shadow-lg shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Interview</span>
          </button>
        </div>
      </div>

      {/* Interviews Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Candidate & Vacancy</th>
                <th className="py-3.5 px-4">Type & Format</th>
                <th className="py-3.5 px-4">Date & Time</th>
                <th className="py-3.5 px-4">Panel & Recommendation</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Loading interviews...
                  </td>
                </tr>
              ) : interviews.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    No scheduled interviews found.
                  </td>
                </tr>
              ) : (
                interviews.map((iv) => (
                  <tr key={iv.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white text-sm">{iv.candidate.fullName}</div>
                      <div className="text-slate-400 text-[11px]">{iv.vacancy.title}</div>
                      <div className="font-mono text-slate-500 text-[10px]">{iv.candidate.applicationNumber}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded bg-slate-800 font-semibold text-slate-300">
                        {iv.interviewType}
                      </span>
                      <div className="text-slate-500 text-[11px] mt-1 truncate max-w-xs">{iv.location || 'Online'}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">
                        {new Date(iv.scheduledDate).toLocaleDateString('en-KE', { dateStyle: 'medium' })}
                      </div>
                      <div className="text-slate-400 text-[11px] font-mono">
                        {iv.startTime} - {iv.endTime}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="text-slate-300">
                        {iv.panelMembers.length > 0
                          ? iv.panelMembers.map((p) => `${p.interviewer.firstName} ${p.interviewer.lastName}`).join(', ')
                          : 'Unassigned Panel'}
                      </div>
                      {iv.panelMembers[0]?.recommendation && (
                        <span className="text-[10px] font-bold text-amber-400 block mt-0.5">
                          Rec: {iv.panelMembers[0].recommendation} (Score: {iv.panelMembers[0].overallScore || 'N/A'})
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-full font-semibold text-[11px] ${
                          iv.status === 'COMPLETED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : iv.status === 'SCHEDULED'
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {iv.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedInterview(iv);
                          setShowScorecardModal(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold text-xs transition"
                      >
                        Scorecard
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Schedule Interview Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Schedule Candidate Interview</h3>
            <form onSubmit={handleScheduleSubmit} className="space-y-3 text-xs">
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
                      {c.fullName} — {c.vacancy.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Interview Format</label>
                  <select
                    value={interviewType}
                    onChange={(e) => setInterviewType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="PANEL">Panel Interview</option>
                    <option value="PHONE">Phone Screen</option>
                    <option value="PHYSICAL">In-Person Physical</option>
                    <option value="ONLINE">Online Video</option>
                    <option value="TECHNICAL">Technical Test</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Interview Date *</label>
                  <input
                    type="date"
                    required
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">End Time</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Location / Venue</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Assign Lead Interviewer</label>
                <select
                  value={selectedPanelUser}
                  onChange={(e) => setSelectedPanelUser(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">Select interviewer...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
                >
                  Confirm Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Scorecard Modal */}
      {showScorecardModal && selectedInterview && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white mb-1">Interview Scorecard Evaluation</h3>
            <p className="text-xs text-slate-400 mb-4">
              Candidate: <span className="text-white font-semibold">{selectedInterview.candidate.fullName}</span> (
              {selectedInterview.vacancy.title})
            </p>

            <form onSubmit={handleScorecardSubmit} className="space-y-4 text-xs">
              {[
                { label: '1. Communication & Articulation', val: scoreCommunication, set: setScoreCommunication },
                { label: '2. Technical & Security Skills', val: scoreTechnical, set: setScoreTechnical },
                { label: '3. Relevant Experience Match', val: scoreExperience, set: setScoreExperience },
                { label: '4. Problem Solving & Alertness', val: scoreProblemSolving, set: setScoreProblemSolving },
                { label: '5. Professionalism & Discipline', val: scoreProfessionalism, set: setScoreProfessionalism },
              ].map((cat) => (
                <div key={cat.label} className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-slate-300">{cat.label}</span>
                    <span className="font-bold text-amber-400">{cat.val} / 5</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={cat.val}
                    onChange={(e) => cat.set(parseInt(e.target.value, 10))}
                    className="w-full accent-amber-500"
                  />
                </div>
              ))}

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Overall Recommendation</label>
                <select
                  value={overallRec}
                  onChange={(e) => setOverallRec(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="HIRE">RECOMMEND HIRE</option>
                  <option value="HOLD">HOLD / BACKUP</option>
                  <option value="REJECT">REJECT</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Panel Evaluation Comments</label>
                <textarea
                  rows={3}
                  placeholder="Notes on candidate strengths, fit, or concerns..."
                  value={scoreComments}
                  onChange={(e) => setScoreComments(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowScorecardModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingScorecard}
                  className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
                >
                  {savingScorecard ? 'Submitting...' : 'Submit Scorecard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
