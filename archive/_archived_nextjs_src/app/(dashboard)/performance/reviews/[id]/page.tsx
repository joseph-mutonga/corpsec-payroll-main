'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileCheck,
  Award,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  Sliders,
  Shield,
  MessageSquare,
  TrendingUp,
  Target,
  BarChart3,
  Calendar,
  Save,
  Check,
} from 'lucide-react';

interface ReviewDetail {
  id: string;
  reviewNumber: string;
  status: string;
  goalsScore?: number;
  kpisScore?: number;
  competenciesScore?: number;
  overallScore?: number;
  overallRating?: string;
  isCalibrated: boolean;
  calibratedScore?: number;
  calibratedRating?: string;
  calibrationComment?: string;
  selfAchievements?: string;
  selfChallenges?: string;
  selfStrengths?: string;
  selfImprovements?: string;
  selfTrainingNeeds?: string;
  selfCareerAspirations?: string;
  selfOverallScore?: number;
  selfSubmittedAt?: string;
  managerStrengths?: string;
  managerImprovements?: string;
  managerRecommendation?: string;
  managerSubmittedAt?: string;
  acknowledgedAt?: string;
  acknowledgementComment?: string;
  hasConcern: boolean;
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
    employmentDate: string;
    department?: { name: string };
    station?: { name: string; townCity?: string };
    position?: { title: string };
  };
  reviewer?: {
    id: string;
    fullName: string;
    jobTitle: string;
  };
  cycle: {
    id: string;
    code: string;
    name: string;
    status: string;
    startDate: string;
    endDate: string;
    weightsConfig?: string;
  };
  goals: Array<{
    id: string;
    goalNumber: string;
    title: string;
    category: string;
    weight: number;
    target?: string;
    progressPercentage: number;
    selfRating?: number;
    selfComment?: string;
    managerRating?: number;
    managerComment?: string;
  }>;
  kpiMeasurements: Array<{
    id: string;
    periodName: string;
    target: number;
    actual: number;
    achievementRate: number;
    score?: number;
    kpi: { name: string; code: string; measurementUnit: string };
  }>;
  competencyRatings: Array<{
    id: string;
    competencyId: string;
    selfScore?: number;
    selfComment?: string;
    managerScore?: number;
    managerComment?: string;
    weight: number;
    competency: { id: string; code: string; name: string; description?: string };
  }>;
  concerns: Array<{
    id: string;
    concernNumber: string;
    concern: string;
    explanation: string;
    status: string;
    hrResponse?: string;
  }>;
}

export default function ReviewDossierDetailPage({ params }: { params: { id: string } }) {
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'goals' | 'kpis' | 'competencies' | 'self' | 'manager' | 'calibration'>('goals');

  const [managerForm, setManagerForm] = useState({
    managerStrengths: '',
    managerImprovements: '',
    managerRecommendation: 'RETENTION',
    goalRatings: {} as Record<string, { rating: number; comment: string }>,
    competencyRatings: {} as Record<string, { score: number; comment: string }>,
  });

  const [calibrationForm, setCalibrationForm] = useState({
    calibratedScore: 4.5,
    calibratedRating: 'Exceeds Expectations',
    calibrationComment: '',
  });

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchReview();
  }, [params.id]);

  const fetchReview = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/performance/reviews/${params.id}`);
      const json = await res.json();
      if (json.success) {
        const r: ReviewDetail = json.data.review;
        setReview(r);

        // Initialize manager form
        const gMap: Record<string, { rating: number; comment: string }> = {};
        r.goals.forEach((g) => {
          gMap[g.id] = { rating: g.managerRating || 3.0, comment: g.managerComment || '' };
        });

        const cMap: Record<string, { score: number; comment: string }> = {};
        r.competencyRatings.forEach((c) => {
          cMap[c.competencyId] = { score: c.managerScore || 3.0, comment: c.managerComment || '' };
        });

        setManagerForm({
          managerStrengths: r.managerStrengths || '',
          managerImprovements: r.managerImprovements || '',
          managerRecommendation: r.managerRecommendation || 'RETENTION',
          goalRatings: gMap,
          competencyRatings: cMap,
        });

        if (r.calibratedScore) {
          setCalibrationForm({
            calibratedScore: r.calibratedScore,
            calibratedRating: r.calibratedRating || 'Exceeds Expectations',
            calibrationComment: r.calibrationComment || '',
          });
        }
      }
    } catch (e) {
      console.error('Failed to load review dossier:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEvaluation = async () => {
    if (!review) return;
    setSaving(true);
    setSaveSuccess(null);

    const goalRatingsArray = Object.entries(managerForm.goalRatings).map(([goalId, val]) => ({
      goalId,
      managerRating: Number(val.rating),
      managerComment: val.comment,
    }));

    const compRatingsArray = Object.entries(managerForm.competencyRatings).map(([competencyId, val]) => ({
      competencyId,
      managerScore: Number(val.score),
      managerComment: val.comment,
    }));

    try {
      const res = await fetch(`/api/performance/reviews/${review.id}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          managerStrengths: managerForm.managerStrengths,
          managerImprovements: managerForm.managerImprovements,
          managerRecommendation: managerForm.managerRecommendation,
          goalRatings: goalRatingsArray,
          competencyRatings: compRatingsArray,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSaveSuccess('Manager evaluation submitted and composite scores computed successfully!');
        fetchReview();
      } else {
        alert(json.message || 'Failed to submit manager evaluation.');
      }
    } catch (e: any) {
      alert(`Error saving evaluation: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCalibrate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!review) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/performance/reviews/${review.id}/calibrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calibratedScore: Number(calibrationForm.calibratedScore),
          calibratedRating: calibrationForm.calibratedRating,
          calibrationComment: calibrationForm.calibrationComment,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSaveSuccess('Appraisal calibrated successfully. Original scores preserved in audit trail.');
        fetchReview();
      } else {
        alert(json.message || 'Failed to calibrate review.');
      }
    } catch (e: any) {
      alert(`Error calibrating review: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-amber-500/20 border-t-amber-500"></div>
        <p className="text-sm text-zinc-500 mt-3 font-medium">Loading review dossier...</p>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="p-8 text-center bg-zinc-900/60 rounded-2xl border border-zinc-800">
        <p className="text-zinc-400">Review dossier not found.</p>
        <Link href="/performance/reviews" className="text-amber-400 text-sm font-semibold mt-2 inline-block">
          ← Back to Appraisal Desk
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Navigation & Actions */}
      <div className="flex items-center justify-between">
        <Link
          href="/performance/reviews"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition font-medium"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Appraisal Desk
        </Link>

        {saveSuccess && (
          <div className="px-3 py-1.5 bg-emerald-950/60 border border-emerald-800 text-xs text-emerald-400 font-semibold rounded-xl flex items-center gap-1.5 animate-fade-in">
            <Check className="w-3.5 h-3.5" /> {saveSuccess}
          </div>
        )}
      </div>

      {/* Main Dossier Header */}
      <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                {review.reviewNumber}
              </span>
              <span className="px-2.5 py-0.5 bg-zinc-800 text-zinc-300 text-xs font-semibold rounded-full uppercase tracking-wider">
                {review.status.replace(/_/g, ' ')}
              </span>
              {review.isCalibrated && (
                <span className="px-2.5 py-0.5 bg-amber-950/60 border border-amber-800/60 text-amber-400 text-xs font-semibold rounded-full">
                  Calibrated
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{review.employee.fullName}</h1>
            <p className="text-xs text-zinc-400">
              {review.employee.employeeNumber} • {review.employee.jobTitle} • {review.employee.department?.name || 'Operations'}
            </p>
          </div>

          {/* Composite Score Pill */}
          <div className="flex items-center gap-6 bg-black/40 p-4 rounded-xl border border-zinc-800">
            <div className="text-center">
              <p className="text-xs text-zinc-500">Goals (50%)</p>
              <p className="text-lg font-bold text-white font-mono mt-0.5">{review.goalsScore ?? '—'}</p>
            </div>
            <div className="h-8 w-px bg-zinc-800" />
            <div className="text-center">
              <p className="text-xs text-zinc-500">KPIs (30%)</p>
              <p className="text-lg font-bold text-white font-mono mt-0.5">{review.kpisScore ?? '—'}</p>
            </div>
            <div className="h-8 w-px bg-zinc-800" />
            <div className="text-center">
              <p className="text-xs text-zinc-500">Comp (20%)</p>
              <p className="text-lg font-bold text-white font-mono mt-0.5">{review.competenciesScore ?? '—'}</p>
            </div>
            <div className="h-8 w-px bg-zinc-800" />
            <div className="text-center">
              <p className="text-xs text-amber-400 font-semibold uppercase">Composite</p>
              <p className="text-2xl font-bold text-amber-400 font-mono">
                {review.isCalibrated && review.calibratedScore ? review.calibratedScore : review.overallScore ?? '—'}
              </p>
              <p className="text-[10px] text-zinc-400">{review.isCalibrated ? review.calibratedRating : review.overallRating}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-1 overflow-x-auto">
        {[
          { id: 'goals', label: `Goals (${review.goals.length})` },
          { id: 'kpis', label: `KPIs (${review.kpiMeasurements.length})` },
          { id: 'competencies', label: `Competencies (${review.competencyRatings.length})` },
          { id: 'self', label: 'Self-Assessment' },
          { id: 'manager', label: 'Manager Review' },
          { id: 'calibration', label: 'Calibration & Concerns' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-sm font-semibold rounded-xl whitespace-nowrap transition ${
              activeTab === tab.id
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {/* Tab 1: Goals Evaluation */}
        {activeTab === 'goals' && (
          <div className="space-y-4">
            {review.goals.map((g) => (
              <div key={g.id} className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-zinc-500">{g.goalNumber}</span>
                    <span className="text-xs font-semibold text-amber-400">Weight: {g.weight}%</span>
                  </div>
                  <span className="text-xs text-zinc-400 font-mono">Progress: {g.progressPercentage}%</span>
                </div>

                <h3 className="text-base font-bold text-white">{g.title}</h3>
                {g.target && <p className="text-xs text-zinc-400"><strong>Target:</strong> {g.target}</p>}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-800/60">
                  <div className="p-3 bg-black/40 rounded-xl border border-zinc-800 text-xs space-y-1">
                    <p className="text-zinc-500">Employee Self Rating</p>
                    <p className="text-white font-bold font-mono text-sm">{g.selfRating ?? 'Not rated'} / 5.0</p>
                    {g.selfComment && <p className="text-zinc-400 italic mt-1">&quot;{g.selfComment}&quot;</p>}
                  </div>

                  <div className="p-3 bg-zinc-800/40 rounded-xl border border-zinc-700/60 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-zinc-300 font-semibold">Manager Score (1.0 - 5.0)</p>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        step={0.1}
                        value={managerForm.goalRatings[g.id]?.rating || 3.0}
                        onChange={(e) =>
                          setManagerForm({
                            ...managerForm,
                            goalRatings: {
                              ...managerForm.goalRatings,
                              [g.id]: {
                                ...managerForm.goalRatings[g.id],
                                rating: Number(e.target.value),
                              },
                            },
                          })
                        }
                        className="w-20 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-right font-mono text-amber-400 font-bold"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Manager feedback comment on this goal..."
                      value={managerForm.goalRatings[g.id]?.comment || ''}
                      onChange={(e) =>
                        setManagerForm({
                          ...managerForm,
                          goalRatings: {
                            ...managerForm.goalRatings,
                            [g.id]: {
                              ...managerForm.goalRatings[g.id],
                              comment: e.target.value,
                            },
                          },
                        })
                      }
                      className="w-full px-2.5 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs text-white"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 2: KPIs */}
        {activeTab === 'kpis' && (
          <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="bg-zinc-950/40 text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="px-6 py-3.5">KPI Metric</th>
                  <th className="px-6 py-3.5 text-center">Period</th>
                  <th className="px-6 py-3.5 text-center">Target</th>
                  <th className="px-6 py-3.5 text-center">Actual</th>
                  <th className="px-6 py-3.5 text-center">Achievement %</th>
                  <th className="px-6 py-3.5 text-center">Mapped Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {review.kpiMeasurements.map((m) => (
                  <tr key={m.id} className="hover:bg-zinc-800/30 transition">
                    <td className="px-6 py-4 font-medium text-white">
                      <div>{m.kpi.name}</div>
                      <span className="text-xs text-zinc-500 font-mono">{m.kpi.code}</span>
                    </td>
                    <td className="px-6 py-4 text-center font-mono text-xs">{m.periodName}</td>
                    <td className="px-6 py-4 text-center font-mono">{m.target}</td>
                    <td className="px-6 py-4 text-center font-mono font-bold text-white">{m.actual}</td>
                    <td className="px-6 py-4 text-center font-mono">
                      <span className="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded text-xs font-semibold">
                        {m.achievementRate}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-mono font-bold text-amber-400">
                      {m.score ?? 'N/A'} / 5.0
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Competencies */}
        {activeTab === 'competencies' && (
          <div className="space-y-4">
            {review.competencyRatings.map((cr) => (
              <div key={cr.id} className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                    {cr.competency.code}
                  </span>
                  <span className="text-xs text-zinc-400">Weight: {cr.weight}%</span>
                </div>

                <h3 className="text-base font-bold text-white">{cr.competency.name}</h3>
                {cr.competency.description && (
                  <p className="text-xs text-zinc-400">{cr.competency.description}</p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-800/60">
                  <div className="p-3 bg-black/40 rounded-xl border border-zinc-800 text-xs space-y-1">
                    <p className="text-zinc-500">Employee Self Score</p>
                    <p className="text-white font-bold font-mono text-sm">{cr.selfScore ?? 'Not scored'} / 5.0</p>
                    {cr.selfComment && <p className="text-zinc-400 italic mt-1">&quot;{cr.selfComment}&quot;</p>}
                  </div>

                  <div className="p-3 bg-zinc-800/40 rounded-xl border border-zinc-700/60 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-zinc-300 font-semibold">Manager Score (1.0 - 5.0)</p>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        step={0.1}
                        value={managerForm.competencyRatings[cr.competencyId]?.score || 3.0}
                        onChange={(e) =>
                          setManagerForm({
                            ...managerForm,
                            competencyRatings: {
                              ...managerForm.competencyRatings,
                              [cr.competencyId]: {
                                ...managerForm.competencyRatings[cr.competencyId],
                                score: Number(e.target.value),
                              },
                            },
                          })
                        }
                        className="w-20 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-right font-mono text-amber-400 font-bold"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Manager feedback comment on this competency..."
                      value={managerForm.competencyRatings[cr.competencyId]?.comment || ''}
                      onChange={(e) =>
                        setManagerForm({
                          ...managerForm,
                          competencyRatings: {
                            ...managerForm.competencyRatings,
                            [cr.competencyId]: {
                              ...managerForm.competencyRatings[cr.competencyId],
                              comment: e.target.value,
                            },
                          },
                        })
                      }
                      className="w-full px-2.5 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs text-white"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: Self-Assessment */}
        {activeTab === 'self' && (
          <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 space-y-5 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-black/40 rounded-xl border border-zinc-800 space-y-1">
                <p className="text-xs font-semibold text-zinc-400 uppercase">Key Achievements</p>
                <p className="text-zinc-200 whitespace-pre-wrap">{review.selfAchievements || 'None recorded'}</p>
              </div>
              <div className="p-4 bg-black/40 rounded-xl border border-zinc-800 space-y-1">
                <p className="text-xs font-semibold text-zinc-400 uppercase">Challenges Encountered</p>
                <p className="text-zinc-200 whitespace-pre-wrap">{review.selfChallenges || 'None recorded'}</p>
              </div>
              <div className="p-4 bg-black/40 rounded-xl border border-zinc-800 space-y-1">
                <p className="text-xs font-semibold text-zinc-400 uppercase">Perceived Strengths</p>
                <p className="text-zinc-200 whitespace-pre-wrap">{review.selfStrengths || 'None recorded'}</p>
              </div>
              <div className="p-4 bg-black/40 rounded-xl border border-zinc-800 space-y-1">
                <p className="text-xs font-semibold text-zinc-400 uppercase">Areas For Improvement</p>
                <p className="text-zinc-200 whitespace-pre-wrap">{review.selfImprovements || 'None recorded'}</p>
              </div>
              <div className="p-4 bg-black/40 rounded-xl border border-zinc-800 space-y-1">
                <p className="text-xs font-semibold text-zinc-400 uppercase">Identified Training Needs</p>
                <p className="text-zinc-200 whitespace-pre-wrap">{review.selfTrainingNeeds || 'None recorded'}</p>
              </div>
              <div className="p-4 bg-black/40 rounded-xl border border-zinc-800 space-y-1">
                <p className="text-xs font-semibold text-zinc-400 uppercase">Career Aspirations</p>
                <p className="text-zinc-200 whitespace-pre-wrap">{review.selfCareerAspirations || 'None recorded'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Manager Evaluation Form */}
        {activeTab === 'manager' && (
          <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 space-y-5">
            <h3 className="text-base font-bold text-white">Supervisor Summary & Recommendation</h3>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Demonstrated Strengths</label>
                <textarea
                  rows={3}
                  placeholder="Key commendations, strengths observed during shift operations..."
                  value={managerForm.managerStrengths}
                  onChange={(e) => setManagerForm({ ...managerForm, managerStrengths: e.target.value })}
                  className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Areas For Development</label>
                <textarea
                  rows={3}
                  placeholder="Specific tactical or behavioral improvement areas..."
                  value={managerForm.managerImprovements}
                  onChange={(e) => setManagerForm({ ...managerForm, managerImprovements: e.target.value })}
                  className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Manager Recommendation</label>
                <select
                  value={managerForm.managerRecommendation}
                  onChange={(e) => setManagerForm({ ...managerForm, managerRecommendation: e.target.value })}
                  className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                >
                  <option value="RETENTION">Retention in Current Role</option>
                  <option value="PROMOTION">Recommended for Promotion</option>
                  <option value="CONFIRMATION">Confirmed (Probation Complete)</option>
                  <option value="PIP">Performance Improvement Plan (PIP)</option>
                  <option value="LATERAL_MOVE">Lateral Transfer</option>
                </select>
              </div>

              <div className="flex justify-end pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={handleSaveEvaluation}
                  disabled={saving}
                  className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-bold text-sm rounded-xl transition shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Computing & Saving...' : 'Submit Manager Evaluation'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Calibration & Concerns */}
        {activeTab === 'calibration' && (
          <div className="space-y-6">
            {/* Calibration Card */}
            <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" /> HR Committee Calibration
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Adjust final rating based on cross-station normalization while preserving original manager scoring
                  </p>
                </div>
              </div>

              <form onSubmit={handleCalibrate} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300">Calibrated Score (1.0 - 5.0) *</label>
                    <input
                      type="number"
                      step={0.05}
                      min={1}
                      max={5}
                      required
                      value={calibrationForm.calibratedScore}
                      onChange={(e) => setCalibrationForm({ ...calibrationForm, calibratedScore: Number(e.target.value) })}
                      className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300">Calibrated Rating Tier</label>
                    <select
                      value={calibrationForm.calibratedRating}
                      onChange={(e) => setCalibrationForm({ ...calibrationForm, calibratedRating: e.target.value })}
                      className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                    >
                      <option value="Outstanding">5 — Outstanding</option>
                      <option value="Exceeds Expectations">4 — Exceeds Expectations</option>
                      <option value="Meets Expectations">3 — Meets Expectations</option>
                      <option value="Needs Improvement">2 — Needs Improvement</option>
                      <option value="Does Not Meet Expectations">1 — Does Not Meet Expectations</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Calibration Justification *</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Document committee rationale for adjustment..."
                    value={calibrationForm.calibrationComment}
                    onChange={(e) => setCalibrationForm({ ...calibrationForm, calibrationComment: e.target.value })}
                    className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 bg-amber-500 text-black font-semibold text-xs rounded-xl"
                  >
                    Apply Calibration
                  </button>
                </div>
              </form>
            </div>

            {/* Performance Concerns List */}
            <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" /> Raised Review Disputes / Concerns ({review.concerns.length})
              </h3>

              {review.concerns.length === 0 ? (
                <p className="text-xs text-zinc-500">No review disputes or concerns have been logged for this appraisal.</p>
              ) : (
                <div className="space-y-3">
                  {review.concerns.map((c) => (
                    <div key={c.id} className="p-4 bg-rose-950/20 border border-rose-900/40 rounded-xl text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-rose-400 font-bold">{c.concernNumber}</span>
                        <span className="px-2 py-0.5 bg-rose-900/60 text-rose-300 rounded font-semibold uppercase">
                          {c.status}
                        </span>
                      </div>
                      <p className="text-white font-semibold">{c.concern}</p>
                      <p className="text-zinc-400">{c.explanation}</p>
                      {c.hrResponse && (
                        <div className="mt-2 p-2.5 bg-zinc-900/80 rounded-lg border border-zinc-800">
                          <p className="text-zinc-500 font-semibold">HR Response:</p>
                          <p className="text-zinc-300">{c.hrResponse}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
