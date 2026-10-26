'use client';

import React, { useState, useEffect } from 'react';
import {
  Award,
  Target,
  FileCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  Sliders,
  Send,
  Save,
  MessageSquare,
  TrendingUp,
  BookOpen,
  Check,
} from 'lucide-react';

export default function EmployeePerformancePortalPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'appraisal' | 'goals' | 'career' | 'peerFeedback'>('appraisal');

  // Self-assessment form state
  const [selfForm, setSelfForm] = useState({
    achievements: '',
    challenges: '',
    strengths: '',
    improvements: '',
    trainingNeeds: '',
    careerAspirations: '',
    goalRatings: {} as Record<string, { rating: number; comment: string }>,
    competencyRatings: {} as Record<string, { score: number; comment: string }>,
  });

  // Acknowledgement & concern state
  const [ackComment, setAckComment] = useState('');
  const [concernForm, setConcernForm] = useState({ concern: '', explanation: '' });
  const [showConcernModal, setShowConcernModal] = useState(false);

  // Peer feedback form
  const [peerForm, setPeerForm] = useState({
    employeeId: '',
    isAnonymous: true,
    rating: 4,
    strengths: '',
    improvements: '',
    generalComments: '',
  });
  const [colleagues, setColleagues] = useState<any[]>([]);

  // Career development form
  const [careerForm, setCareerForm] = useState({
    careerGoals: '',
    skillsToDevelop: '',
    desiredFutureRoles: '',
    developmentInterests: '',
    mentorshipInterest: true,
    mobilityPreference: 'ANYWHERE',
  });

  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchPortalData();
    fetchColleagues();
  }, []);

  const fetchPortalData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/portal/performance');
      const json = await res.json();
      if (json.success) {
        setData(json.data);

        // Populate self form if active review exists
        const rev = json.data.activeReview;
        if (rev) {
          const gMap: Record<string, { rating: number; comment: string }> = {};
          rev.goals.forEach((g: any) => {
            gMap[g.id] = { rating: g.selfRating || 3.0, comment: g.selfComment || '' };
          });

          const cMap: Record<string, { score: number; comment: string }> = {};
          rev.competencyRatings.forEach((c: any) => {
            cMap[c.competencyId] = { score: c.selfScore || 3.0, comment: c.selfComment || '' };
          });

          setSelfForm({
            achievements: rev.selfAchievements || '',
            challenges: rev.selfChallenges || '',
            strengths: rev.selfStrengths || '',
            improvements: rev.selfImprovements || '',
            trainingNeeds: rev.selfTrainingNeeds || '',
            careerAspirations: rev.selfCareerAspirations || '',
            goalRatings: gMap,
            competencyRatings: cMap,
          });
        }

        // Populate career form
        if (json.data.careerDevelopment) {
          const cd = json.data.careerDevelopment;
          setCareerForm({
            careerGoals: cd.careerGoals || '',
            skillsToDevelop: cd.skillsToDevelop || '',
            desiredFutureRoles: cd.desiredFutureRoles || '',
            developmentInterests: cd.developmentInterests || '',
            mentorshipInterest: cd.mentorshipInterest ?? true,
            mobilityPreference: cd.mobilityPreference || 'ANYWHERE',
          });
        }
      }
    } catch (e) {
      console.error('Failed to load employee performance portal:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchColleagues = async () => {
    try {
      const res = await fetch('/api/employees');
      const json = await res.json();
      if (json.success) setColleagues(json.data.employees || json.data);
    } catch (e) {
      console.error('Failed to fetch colleagues:', e);
    }
  };

  const handleSaveSelfAssessment = async (isDraft: boolean) => {
    if (!data?.activeReview) return;
    setSaving(true);
    setStatusMessage(null);

    const goalRatingsArray = Object.entries(selfForm.goalRatings).map(([goalId, val]) => ({
      goalId,
      selfRating: Number(val.rating),
      selfComment: val.comment,
    }));

    const compRatingsArray = Object.entries(selfForm.competencyRatings).map(([competencyId, val]) => ({
      competencyId,
      selfScore: Number(val.score),
      selfComment: val.comment,
    }));

    try {
      const res = await fetch(`/api/performance/reviews/${data.activeReview.id}/self-assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...selfForm,
          goalRatings: goalRatingsArray,
          competencyRatings: compRatingsArray,
          isDraft,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setStatusMessage(isDraft ? 'Self-assessment draft saved.' : 'Self-assessment successfully submitted to manager!');
        fetchPortalData();
      } else {
        alert(json.message || 'Failed to save self assessment.');
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!data?.activeReview) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/performance/reviews/${data.activeReview.id}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledgementComment: ackComment }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage('Appraisal review acknowledged successfully.');
        fetchPortalData();
      } else {
        alert(json.message || 'Failed to acknowledge review.');
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRaiseConcern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data?.activeReview) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/performance/reviews/${data.activeReview.id}/concern`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(concernForm),
      });
      const json = await res.json();
      if (json.success) {
        setShowConcernModal(false);
        setStatusMessage('Performance concern lodged with HR.');
        fetchPortalData();
      } else {
        alert(json.message || 'Failed to lodge concern.');
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCareer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/performance/career-development', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(careerForm),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage('Career development profile saved.');
      }
    } catch (e) {
      console.error('Failed to save career dev:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitPeerFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data?.activeCycle) return;
    setSaving(true);

    try {
      const res = await fetch('/api/performance/peer-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleId: data.activeCycle.id,
          employeeId: peerForm.employeeId,
          isAnonymous: peerForm.isAnonymous,
          rating: Number(peerForm.rating),
          strengths: peerForm.strengths,
          improvements: peerForm.improvements,
          generalComments: peerForm.generalComments,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage('Peer feedback submitted successfully!');
        setPeerForm({
          employeeId: '',
          isAnonymous: true,
          rating: 4,
          strengths: '',
          improvements: '',
          generalComments: '',
        });
      } else {
        alert(json.message || 'Failed to submit peer feedback.');
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-amber-500/20 border-t-amber-500"></div>
        <p className="text-sm text-zinc-500 mt-3 font-medium">Loading your performance portal...</p>
      </div>
    );
  }

  const review = data?.activeReview;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <Award className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                My Performance & Growth Hub
              </h1>
              <p className="text-sm text-zinc-400 mt-0.5">
                {data?.employee?.fullName} ({data?.employee?.employeeNumber}) • {data?.employee?.position}
              </p>
            </div>
          </div>
        </div>

        {statusMessage && (
          <div className="px-3.5 py-1.5 bg-emerald-950/60 border border-emerald-800 text-xs text-emerald-400 font-semibold rounded-xl flex items-center gap-1.5 animate-fade-in">
            <Check className="w-3.5 h-3.5" /> {statusMessage}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('appraisal')}
          className={`px-4 py-2 text-sm font-semibold rounded-xl whitespace-nowrap transition ${
            activeTab === 'appraisal'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Active Appraisal Dossier
        </button>
        <button
          onClick={() => setActiveTab('goals')}
          className={`px-4 py-2 text-sm font-semibold rounded-xl whitespace-nowrap transition ${
            activeTab === 'goals'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          My SMART Goals ({data?.goals?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('career')}
          className={`px-4 py-2 text-sm font-semibold rounded-xl whitespace-nowrap transition ${
            activeTab === 'career'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Career Aspirations & Growth
        </button>
        <button
          onClick={() => setActiveTab('peerFeedback')}
          className={`px-4 py-2 text-sm font-semibold rounded-xl whitespace-nowrap transition ${
            activeTab === 'peerFeedback'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Give Peer Feedback
        </button>
      </div>

      {/* Tab 1: Active Appraisal */}
      {activeTab === 'appraisal' && (
        <div className="space-y-6">
          {!review ? (
            <div className="p-12 text-center bg-zinc-900/60 rounded-2xl border border-zinc-800">
              <Award className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-white">No Active Appraisal in Progress</h3>
              <p className="text-sm text-zinc-400 mt-1 max-w-md mx-auto">
                You will be notified once the next performance appraisal cycle begins.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Review Status Banner */}
              <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-mono text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                    {review.reviewNumber}
                  </span>
                  <h3 className="text-lg font-bold text-white mt-1.5">{review.cycle.name}</h3>
                  <p className="text-xs text-zinc-400">
                    Status: <strong className="text-zinc-200">{review.status.replace(/_/g, ' ')}</strong>
                  </p>
                </div>

                {/* Score if completed/evaluated */}
                {review.overallScore && (
                  <div className="p-3.5 bg-black/40 rounded-xl border border-zinc-800 text-center">
                    <p className="text-xs text-zinc-400">Final Composite Score</p>
                    <p className="text-2xl font-bold text-amber-400 font-mono">
                      {review.isCalibrated && review.calibratedScore ? review.calibratedScore : review.overallScore} / 5.0
                    </p>
                    <p className="text-xs text-zinc-500">{review.overallRating}</p>
                  </div>
                )}
              </div>

              {/* Acknowledgement / Concern Actions */}
              {review.status === 'EMPLOYEE_ACKNOWLEDGEMENT' && !review.acknowledgedAt && (
                <div className="p-6 bg-cyan-950/20 border border-cyan-900/40 rounded-2xl space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-cyan-300">Appraisal Review Completed</h3>
                    <p className="text-xs text-cyan-400/80">
                      Your manager has submitted their evaluation. Please review their feedback below and acknowledge receipt.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-300">Acknowledgement Comments (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. I agree with the evaluation and look forward to the training plan..."
                      value={ackComment}
                      onChange={(e) => setAckComment(e.target.value)}
                      className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleAcknowledge}
                      disabled={saving}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl transition"
                    >
                      Acknowledge Review
                    </button>
                    <button
                      onClick={() => setShowConcernModal(true)}
                      className="px-4 py-2 bg-rose-950/40 hover:bg-rose-900/40 text-rose-400 border border-rose-800/40 font-semibold text-xs rounded-xl transition"
                    >
                      Raise Concern / Dispute
                    </button>
                  </div>
                </div>
              )}

              {/* Self Assessment Form */}
              <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 space-y-5">
                <h3 className="text-base font-bold text-white">My Self-Assessment Reflections</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300">Key Achievements This Cycle</label>
                    <textarea
                      rows={3}
                      placeholder="Major milestones, incident responses handled, exemplary shift coverage..."
                      value={selfForm.achievements}
                      onChange={(e) => setSelfForm({ ...selfForm, achievements: e.target.value })}
                      className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300">Challenges Encountered</label>
                    <textarea
                      rows={3}
                      placeholder="Operational roadblocks, equipment shortages, or difficulties faced..."
                      value={selfForm.challenges}
                      onChange={(e) => setSelfForm({ ...selfForm, challenges: e.target.value })}
                      className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300">Perceived Strengths</label>
                    <textarea
                      rows={2}
                      placeholder="Core strengths demonstrated in your day-to-day duties..."
                      value={selfForm.strengths}
                      onChange={(e) => setSelfForm({ ...selfForm, strengths: e.target.value })}
                      className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300">Areas For Self-Improvement</label>
                    <textarea
                      rows={2}
                      placeholder="Skills or routines you wish to improve upon..."
                      value={selfForm.improvements}
                      onChange={(e) => setSelfForm({ ...selfForm, improvements: e.target.value })}
                      className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                    />
                  </div>
                </div>

                {/* Self Rating for Goals */}
                <div className="space-y-3 pt-3 border-t border-zinc-800">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Goal Self-Ratings</h4>
                  {review.goals?.map((g: any) => (
                    <div key={g.id} className="p-3.5 bg-black/40 rounded-xl border border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-200">{g.title}</span>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-zinc-400">Self Score (1–5):</label>
                          <input
                            type="number"
                            min={1}
                            max={5}
                            step={0.1}
                            value={selfForm.goalRatings[g.id]?.rating || 3.0}
                            onChange={(e) =>
                              setSelfForm({
                                ...selfForm,
                                goalRatings: {
                                  ...selfForm.goalRatings,
                                  [g.id]: {
                                    ...selfForm.goalRatings[g.id],
                                    rating: Number(e.target.value),
                                  },
                                },
                              })
                            }
                            className="w-16 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-center text-amber-400 font-bold font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Self Rating for Competencies */}
                <div className="space-y-3 pt-3 border-t border-zinc-800">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Competency Self-Ratings</h4>
                  {review.competencyRatings?.map((cr: any) => (
                    <div key={cr.id} className="p-3.5 bg-black/40 rounded-xl border border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold text-zinc-200">{cr.competency.name}</span>
                          <span className="text-[10px] text-zinc-500 font-mono ml-2">({cr.competency.code})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-zinc-400">Self Score (1–5):</label>
                          <input
                            type="number"
                            min={1}
                            max={5}
                            step={0.1}
                            value={selfForm.competencyRatings[cr.competencyId]?.score || 3.0}
                            onChange={(e) =>
                              setSelfForm({
                                ...selfForm,
                                competencyRatings: {
                                  ...selfForm.competencyRatings,
                                  [cr.competencyId]: {
                                    ...selfForm.competencyRatings[cr.competencyId],
                                    score: Number(e.target.value),
                                  },
                                },
                              })
                            }
                            className="w-16 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-center text-amber-400 font-bold font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => handleSaveSelfAssessment(true)}
                    disabled={saving}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl transition"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveSelfAssessment(false)}
                    disabled={saving}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs rounded-xl transition"
                  >
                    Submit Self-Assessment
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: SMART Goals */}
      {activeTab === 'goals' && (
        <div className="space-y-4">
          {data?.goals?.length === 0 ? (
            <p className="text-zinc-500 text-sm">No goals currently assigned to you for this cycle.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data?.goals?.map((g: any) => (
                <div key={g.id} className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-zinc-500">{g.goalNumber}</span>
                    <span className="text-xs font-semibold text-amber-400">Weight: {g.weight}%</span>
                  </div>
                  <h4 className="text-base font-bold text-white">{g.title}</h4>
                  {g.target && <p className="text-xs text-zinc-400"><strong>Target:</strong> {g.target}</p>}

                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">Progress</span>
                      <span className="text-zinc-200 font-mono">{g.progressPercentage}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${g.progressPercentage}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Career Aspirations */}
      {activeTab === 'career' && (
        <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 space-y-4 max-w-2xl">
          <h3 className="text-base font-bold text-white">Career Development & Desired Pathways</h3>

          <form onSubmit={handleSaveCareer} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-300">Long-Term Career Goals</label>
              <textarea
                rows={3}
                placeholder="Where do you see yourself in 2-3 years at CorpSec?"
                value={careerForm.careerGoals}
                onChange={(e) => setCareerForm({ ...careerForm, careerGoals: e.target.value })}
                className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-300">Skills You Want to Develop</label>
              <input
                type="text"
                placeholder="e.g. VIP Close Protection, Tactical Dispatch, Drone Surveillance"
                value={careerForm.skillsToDevelop}
                onChange={(e) => setCareerForm({ ...careerForm, skillsToDevelop: e.target.value })}
                className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-300">Desired Future Roles</label>
              <input
                type="text"
                placeholder="e.g. Senior Shift Supervisor, Lead Armorer, Station Commander"
                value={careerForm.desiredFutureRoles}
                onChange={(e) => setCareerForm({ ...careerForm, desiredFutureRoles: e.target.value })}
                className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
              />
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-amber-500 text-black font-semibold text-xs rounded-xl"
              >
                Save Profile
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 4: Give Peer Feedback */}
      {activeTab === 'peerFeedback' && (
        <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 space-y-4 max-w-2xl">
          <h3 className="text-base font-bold text-white">Submit 360-Degree Peer Feedback</h3>
          <p className="text-xs text-zinc-400">
            Provide constructive observations and commendations for a colleague.
          </p>

          <form onSubmit={handleSubmitPeerFeedback} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-300">Select Colleague *</label>
              <select
                required
                value={peerForm.employeeId}
                onChange={(e) => setPeerForm({ ...peerForm, employeeId: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
              >
                <option value="">Select Colleague...</option>
                {colleagues.map((c) => (
                  <option key={c.id} value={c.id}>{c.fullName} ({c.employeeNumber})</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="anon"
                checked={peerForm.isAnonymous}
                onChange={(e) => setPeerForm({ ...peerForm, isAnonymous: e.target.checked })}
                className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-amber-500"
              />
              <label htmlFor="anon" className="text-xs text-zinc-300">
                Keep my feedback anonymous to the recipient (recommended)
              </label>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-300">General Comments & Feedback *</label>
              <textarea
                rows={3}
                required
                placeholder="Constructive feedback on teamwork, communication, and shift collaboration..."
                value={peerForm.generalComments}
                onChange={(e) => setPeerForm({ ...peerForm, generalComments: e.target.value })}
                className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
              />
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-amber-500 text-black font-semibold text-xs rounded-xl"
              >
                Submit Feedback
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Concern Dispute Modal */}
      {showConcernModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-white">Raise Appraisal Concern / Dispute</h3>
              <button onClick={() => setShowConcernModal(false)} className="text-zinc-500 hover:text-zinc-300">
                ✕
              </button>
            </div>

            <form onSubmit={handleRaiseConcern} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Concern Summary *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Disagreement with shift attendance score on Goal 2"
                  value={concernForm.concern}
                  onChange={(e) => setConcernForm({ ...concernForm, concern: e.target.value })}
                  className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Detailed Explanation *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Provide supporting context or shift log references for HR Committee review..."
                  value={concernForm.explanation}
                  onChange={(e) => setConcernForm({ ...concernForm, explanation: e.target.value })}
                  className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowConcernModal(false)}
                  className="px-4 py-2 bg-zinc-800 text-xs text-zinc-300 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-xl"
                >
                  Lodge Concern with HR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
