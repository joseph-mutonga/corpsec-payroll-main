'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  User,
  ArrowLeft,
  Briefcase,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Clock,
  Award,
  CheckCircle2,
  XCircle,
  FileText,
  MessageSquare,
  AlertCircle,
  ShieldCheck,
  Send,
  Plus,
  Lock,
} from 'lucide-react';

interface ApplicantDetail {
  id: string;
  applicationNumber: string;
  fullName: string;
  email: string;
  phone: string;
  location?: string;
  currentOccupation?: string;
  experienceYears?: number;
  highestQualification?: string;
  skills?: string;
  relevantExperience?: string;
  coverLetter?: string;
  resumeUrl?: string;
  source: string;
  currentStage: string;
  screeningStatus: string;
  screeningScore?: number;
  screeningStrengths?: string;
  screeningWeaknesses?: string;
  screeningNotes?: string;
  rejectionReason?: string;
  employeeId?: string;
  convertedAt?: string;
  createdAt: string;
  vacancy: {
    id: string;
    title: string;
    vacancyNumber: string;
    employmentType: string;
    department: { id: string; name: string };
    station?: { id: string; name: string };
    position?: { id: string; title: string };
  };
  employee?: { id: string; employeeNumber: string; fullName: string };
  stageHistories: Array<{
    id: string;
    fromStage?: string;
    toStage: string;
    reason?: string;
    createdAt: string;
    changedBy?: { firstName: string; lastName: string };
  }>;
  interviews: Array<{
    id: string;
    interviewType: string;
    scheduledDate: string;
    startTime: string;
    endTime: string;
    status: string;
    notes?: string;
    panelMembers: Array<{ interviewer: { firstName: string; lastName: string }; recommendation?: string }>;
  }>;
  internalNotes: Array<{
    id: string;
    note: string;
    createdAt: string;
    author?: { firstName: string; lastName: string };
  }>;
  offers: Array<{
    id: string;
    offerNumber: string;
    status: string;
    proposedSalary: number;
    startDate: string;
    secureToken: string;
    candidateResponse?: string;
  }>;
}

export default function ApplicantDetailPage() {
  const params = useParams();
  const applicantId = params?.id as string;
  const router = useRouter();

  const [applicant, setApplicant] = useState<ApplicantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals & sub-forms
  const [showScreeningModal, setShowScreeningModal] = useState(false);
  const [screeningStatus, setScreeningStatus] = useState<'PASS' | 'FAIL' | 'HOLD'>('PASS');
  const [screeningScore, setScreeningScore] = useState('85');
  const [screeningStrengths, setScreeningStrengths] = useState('');
  const [screeningWeaknesses, setScreeningWeaknesses] = useState('');
  const [screeningNotes, setScreeningNotes] = useState('');
  const [advanceStage, setAdvanceStage] = useState('SHORTLISTED');

  // Internal Note form
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Convert to Employee Modal
  const [showHireModal, setShowHireModal] = useState(false);
  const [hireNatId, setHireNatId] = useState('');
  const [hireGender, setHireGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [hireSalary, setHireSalary] = useState('25000');
  const [hireStartDate, setHireStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [hiring, setHiring] = useState(false);

  useEffect(() => {
    if (applicantId) fetchApplicant();
  }, [applicantId]);

  const fetchApplicant = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/recruitment/applicants/${applicantId}`);
      const json = await res.json();
      if (json.success && json.data.applicant) {
        setApplicant(json.data.applicant);
        if (json.data.applicant.offers?.[0]?.proposedSalary) {
          setHireSalary(String(json.data.applicant.offers[0].proposedSalary));
        }
      }
    } catch (e) {
      console.error('Failed to load applicant detail:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleStageChange = async (newStage: string) => {
    try {
      const res = await fetch(`/api/recruitment/pipeline/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: applicantId,
          toStage: newStage,
          reason: `Stage changed directly from candidate profile to ${newStage}`,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setFeedback({ type: 'success', message: `Stage updated to ${newStage}.` });
        fetchApplicant();
      }
    } catch (e) {
      console.error('Error changing stage:', e);
    }
  };

  const handleSaveScreening = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/recruitment/screening', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: applicantId,
          screeningStatus,
          screeningScore: parseFloat(screeningScore) || undefined,
          screeningStrengths,
          screeningWeaknesses,
          screeningNotes,
          advanceToStage: advanceStage,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setFeedback({ type: 'success', message: 'Screening evaluation recorded.' });
        setShowScreeningModal(false);
        fetchApplicant();
      } else {
        throw new Error(json.error);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Screening submission failed' });
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const res = await fetch('/api/recruitment/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: applicantId,
          note: newNote,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setNewNote('');
        fetchApplicant();
      }
    } catch (e) {
      console.error('Failed to add note:', e);
    } finally {
      setAddingNote(false);
    }
  };

  const handleConvertToEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setHiring(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/recruitment/hire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: applicantId,
          nationalId: hireNatId,
          gender: hireGender,
          startDate: hireStartDate,
          basicSalary: parseFloat(hireSalary) || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Conversion failed');
      }

      setFeedback({
        type: 'success',
        message: `Successfully converted ${applicant?.fullName} to Employee ${json.data.employee.employeeNumber}! Onboarding case initiated.`,
      });
      setShowHireModal(false);
      fetchApplicant();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setHiring(false);
    }
  };

  if (loading || !applicant) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="h-8 bg-slate-800/40 rounded-xl w-64 animate-pulse" />
        <div className="h-56 bg-slate-800/30 rounded-3xl animate-pulse" />
      </div>
    );
  }

  const latestOffer = applicant.offers?.[0];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <Link
        href="/recruitment/applicants"
        className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-400 hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Applicant Directory</span>
      </Link>

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

      {/* Candidate Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/70 border border-slate-800 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-mono text-amber-400 font-semibold">{applicant.applicationNumber}</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {applicant.currentStage}
              </span>
              {applicant.employee && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  HIRED ({applicant.employee.employeeNumber})
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white">{applicant.fullName}</h1>

            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-400">
              <div className="flex items-center space-x-1.5">
                <Briefcase className="w-4 h-4 text-slate-500" />
                <span>{applicant.vacancy.title}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <Mail className="w-4 h-4 text-slate-500" />
                <span>{applicant.email}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <Phone className="w-4 h-4 text-slate-500" />
                <span>{applicant.phone}</span>
              </div>
              {applicant.location && (
                <div className="flex items-center space-x-1.5">
                  <MapPin className="w-4 h-4 text-slate-500" />
                  <span>{applicant.location}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowScreeningModal(true)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition"
            >
              Screen Candidate
            </button>

            {applicant.currentStage !== 'HIRED' && !applicant.employeeId && (
              <button
                onClick={() => setShowHireModal(true)}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-emerald-500/20 flex items-center space-x-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Convert to Employee</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2/3): Profile details, cover letter, interviews */}
        <div className="lg:col-span-2 space-y-6">
          {/* Professional Overview Card */}
          <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4 text-xs">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">Qualifications & Background</h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                <span className="text-slate-500 block mb-1">Current Occupation</span>
                <span className="text-white font-semibold">{applicant.currentOccupation || 'Not provided'}</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                <span className="text-slate-500 block mb-1">Experience</span>
                <span className="text-white font-semibold">{applicant.experienceYears ? `${applicant.experienceYears} Years` : 'N/A'}</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                <span className="text-slate-500 block mb-1">Highest Qualification</span>
                <span className="text-white font-semibold">{applicant.highestQualification || 'N/A'}</span>
              </div>
            </div>

            {applicant.skills && (
              <div>
                <span className="text-slate-500 block mb-1 font-semibold">Skills & Competencies</span>
                <p className="text-slate-200">{applicant.skills}</p>
              </div>
            )}

            {applicant.relevantExperience && (
              <div className="pt-3 border-t border-slate-800">
                <span className="text-slate-500 block mb-1 font-semibold">Relevant Experience Summary</span>
                <p className="text-slate-200 whitespace-pre-line">{applicant.relevantExperience}</p>
              </div>
            )}

            {applicant.coverLetter && (
              <div className="pt-3 border-t border-slate-800">
                <span className="text-slate-500 block mb-1 font-semibold">Cover Letter / Statement</span>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-slate-300 font-mono text-[11px] whitespace-pre-line leading-relaxed">
                  {applicant.coverLetter}
                </div>
              </div>
            )}
          </div>

          {/* Screening & Assessment Status */}
          <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4 text-xs">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">Screening Evaluation</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                <span className="text-slate-500 block mb-1">Screening Result</span>
                <span
                  className={`font-bold text-sm ${
                    applicant.screeningStatus === 'PASS'
                      ? 'text-emerald-400'
                      : applicant.screeningStatus === 'FAIL'
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {applicant.screeningStatus} {applicant.screeningScore ? `(${applicant.screeningScore}/100)` : ''}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                <span className="text-slate-500 block mb-1">Application Date</span>
                <span className="text-white font-semibold">
                  {new Date(applicant.createdAt).toLocaleDateString('en-KE', { dateStyle: 'medium' })}
                </span>
              </div>
            </div>

            {applicant.screeningStrengths && (
              <div>
                <span className="text-emerald-400 font-semibold block mb-0.5">Key Strengths:</span>
                <p className="text-slate-300">{applicant.screeningStrengths}</p>
              </div>
            )}

            {applicant.screeningNotes && (
              <div>
                <span className="text-slate-400 font-semibold block mb-0.5">Recruiter Screening Notes:</span>
                <p className="text-slate-300">{applicant.screeningNotes}</p>
              </div>
            )}
          </div>

          {/* Job Offers Card if any */}
          {applicant.offers.length > 0 && (
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-3 text-xs">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Formal Employment Offers</h3>
              {applicant.offers.map((off) => (
                <div
                  key={off.id}
                  className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                >
                  <div>
                    <span className="font-mono font-bold text-amber-400 block">{off.offerNumber}</span>
                    <span className="text-slate-400">
                      KES {off.proposedSalary.toLocaleString()} / mo • Start:{' '}
                      {new Date(off.startDate).toLocaleDateString('en-KE', { dateStyle: 'medium' })}
                    </span>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        off.status === 'ACCEPTED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : off.status === 'APPROVED'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {off.status}
                    </span>

                    <Link
                      href={`/careers/offers/${off.secureToken}`}
                      target="_blank"
                      className="text-xs text-amber-400 hover:underline font-semibold"
                    >
                      View Public Link
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column (1/3): Internal Notes & Stage History */}
        <div className="space-y-6">
          {/* Internal Notes Card */}
          <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl text-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Internal Recruiter Notes</span>
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold">
                CONFIDENTIAL
              </span>
            </div>

            <form onSubmit={handleAddNote} className="space-y-2">
              <textarea
                rows={2}
                placeholder="Add confidential HR note..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-amber-500 resize-none"
              />
              <button
                type="submit"
                disabled={addingNote || !newNote.trim()}
                className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-bold py-2 rounded-xl text-xs transition"
              >
                {addingNote ? 'Adding...' : 'Post Internal Note'}
              </button>
            </form>

            <div className="space-y-2.5 max-h-60 overflow-y-auto">
              {applicant.internalNotes.length === 0 ? (
                <p className="text-slate-500 text-center py-3">No internal notes yet.</p>
              ) : (
                applicant.internalNotes.map((n) => (
                  <div key={n.id} className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
                    <p className="text-slate-300">{n.note}</p>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      {n.author?.firstName || 'HR Officer'} •{' '}
                      {new Date(n.createdAt).toLocaleDateString('en-KE', { dateStyle: 'short' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Stage History Timeline */}
          <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl text-xs space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Recruitment Stage History</h3>

            <div className="space-y-3">
              {applicant.stageHistories.map((h, i) => (
                <div key={h.id} className="flex items-start space-x-3">
                  <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                  <div>
                    <span className="font-bold text-white font-mono">{h.toStage}</span>
                    <p className="text-slate-400 text-[11px] mt-0.5">{h.reason}</p>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      {new Date(h.createdAt).toLocaleDateString('en-KE', { dateStyle: 'medium' })}{' '}
                      {h.changedBy ? `by ${h.changedBy.firstName}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Screening Modal */}
      {showScreeningModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Record Candidate Screening</h3>
            <p className="text-xs text-slate-400 mb-4">Evaluate background match and recommendation for {applicant.fullName}.</p>

            <form onSubmit={handleSaveScreening} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Screening Result</label>
                <select
                  value={screeningStatus}
                  onChange={(e) => setScreeningStatus(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="PASS">PASS (Recommended for Shortlist/Interview)</option>
                  <option value="HOLD">HOLD (Keep in Talent Pool)</option>
                  <option value="FAIL">FAIL (Not Suitable)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Screening Score (0 - 100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={screeningScore}
                  onChange={(e) => setScreeningScore(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Observed Strengths</label>
                <input
                  type="text"
                  placeholder="e.g. Prior armed security experience, disciplined"
                  value={screeningStrengths}
                  onChange={(e) => setScreeningStrengths(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Advance Pipeline Stage To</label>
                <select
                  value={advanceStage}
                  onChange={(e) => setAdvanceStage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="SHORTLISTED">SHORTLISTED</option>
                  <option value="SCREENING">SCREENING</option>
                  <option value="INTERVIEW">INTERVIEW</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowScreeningModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
                >
                  Save Evaluation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Convert to Employee Modal */}
      {showHireModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center space-x-2 text-emerald-400 mb-2">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="text-lg font-bold text-white">Convert Candidate to Employee</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              This will create a formal Employee record in the master HR database, create an active Salary structure, and
              initiate the Phase 11 Onboarding workflow with all 9 induction tasks.
            </p>

            <form onSubmit={handleConvertToEmployee} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  National ID Number <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 38491024"
                  value={hireNatId}
                  onChange={(e) => setHireNatId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Gender *</label>
                  <select
                    value={hireGender}
                    onChange={(e) => setHireGender(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Basic Monthly Salary (KES) *</label>
                  <input
                    type="number"
                    required
                    value={hireSalary}
                    onChange={(e) => setHireSalary(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Employment Start Date *</label>
                <input
                  type="date"
                  required
                  value={hireStartDate}
                  onChange={(e) => setHireStartDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowHireModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={hiring}
                  className="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition"
                >
                  {hiring ? 'Converting...' : 'Confirm Hire & Onboard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
