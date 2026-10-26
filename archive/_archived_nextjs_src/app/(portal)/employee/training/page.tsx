'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  GraduationCap,
  BookOpen,
  Calendar,
  Award,
  CheckCircle2,
  Clock,
  ExternalLink,
  Plus,
  Star,
  ShieldCheck,
  Video,
  MapPin,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function EmployeeTrainingPortalPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ENROLLMENTS' | 'CERTIFICATES' | 'SESSIONS' | 'SKILLS'>('ENROLLMENTS');
  const [enrollingSessionId, setEnrollingSessionId] = useState<string | null>(null);
  const [evaluatingEnrollment, setEvaluatingEnrollment] = useState<any>(null);
  const [evaluationForm, setEvaluationForm] = useState({
    relevanceRating: 5,
    trainerRating: 5,
    materialsRating: 5,
    venueRating: 5,
    deliveryRating: 5,
    usefulnessRating: 5,
    comments: '',
    recommendations: '',
  });
  const [submittingEval, setSubmittingEval] = useState(false);

  const fetchPortalData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/portal/training');
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) {
      console.error('Failed to load employee training portal:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortalData();
  }, []);

  const handleEnroll = async (sessionId: string) => {
    setEnrollingSessionId(sessionId);
    try {
      const res = await fetch('/api/portal/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (json.success) {
        alert('Enrollment request submitted successfully!');
        fetchPortalData();
      } else {
        alert(json.error || 'Failed to submit enrollment request.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setEnrollingSessionId(null);
    }
  };

  const handleSubmitEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evaluatingEnrollment) return;
    setSubmittingEval(true);
    try {
      const res = await fetch('/api/training/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollmentId: evaluatingEnrollment.id,
          ...evaluationForm,
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert('Thank you! Your feedback has been recorded.');
        setEvaluatingEnrollment(null);
        fetchPortalData();
      } else {
        alert(json.error || 'Failed to submit evaluation.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingEval(false);
    }
  };

  const myEnrollments = data?.myEnrollments || [];
  const myCertificates = data?.myCertificates || [];
  const mySkills = data?.mySkills || [];
  const upcomingSessions = data?.upcomingSessions || [];
  const mandatoryStatus = data?.mandatoryStatus || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-indigo-600" />
            My Training & Skill Development
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Browse upcoming courses, view your active security certifications, and manage your skill progress
          </p>
        </div>
      </div>

      {/* Mandatory Compliance Overview Card */}
      {mandatoryStatus.length > 0 && (
        <Card className="p-4 bg-gradient-to-r from-indigo-900 to-slate-900 text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 uppercase tracking-wider">
                <ShieldCheck className="h-4 w-4" />
                Required Security Compliance
              </span>
              <h3 className="text-base font-bold text-white">Mandatory Training Status</h3>
              <p className="text-xs text-indigo-200">
                You have {mandatoryStatus.filter((m: any) => m.status === 'COMPLIANT').length} of {mandatoryStatus.length} required certifications up to date.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {mandatoryStatus.map((m: any) => (
                <div
                  key={m.course.id}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${
                    m.status === 'COMPLIANT'
                      ? 'bg-emerald-950/60 border-emerald-700/80 text-emerald-300'
                      : 'bg-rose-950/60 border-rose-700/80 text-rose-300'
                  }`}
                >
                  {m.status === 'COMPLIANT' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-rose-400" />
                  )}
                  <span>{m.course.title}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Portal Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        {[
          { id: 'ENROLLMENTS', label: `My Courses (${myEnrollments.length})`, icon: BookOpen },
          { id: 'CERTIFICATES', label: `My Certificates (${myCertificates.length})`, icon: Award },
          { id: 'SESSIONS', label: `Open Training Sessions (${upcomingSessions.length})`, icon: Calendar },
          { id: 'SKILLS', label: `My Skill Profile (${mySkills.length})`, icon: GraduationCap },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: My Enrollments */}
      {activeTab === 'ENROLLMENTS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {myEnrollments.length === 0 ? (
            <div className="col-span-full py-12 text-center text-gray-400">
              You have not enrolled in any training courses yet. Check open sessions to apply.
            </div>
          ) : (
            myEnrollments.map((enr: any) => (
              <Card key={enr.id} className="p-5 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      {enr.enrollmentNumber}
                    </span>
                    <Badge
                      variant={
                        enr.status === 'COMPLETED'
                          ? 'success'
                          : enr.status === 'ENROLLED'
                          ? 'info'
                          : enr.status === 'WAITLISTED'
                          ? 'warning'
                          : 'default'
                      }
                    >
                      {enr.status}
                    </Badge>
                  </div>

                  <h3 className="text-base font-bold text-gray-900 mt-2">{enr.course?.title}</h3>
                  <p className="text-xs text-gray-400 font-mono">{enr.course?.code}</p>

                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-xs text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" />
                      <span>
                        {new Date(enr.session?.startDate).toLocaleDateString()} — {new Date(enr.session?.endDate).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {enr.session?.deliveryMethod === 'ONLINE' ? (
                        <Video className="h-3.5 w-3.5 text-blue-500" />
                      ) : (
                        <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                      <span>
                        {enr.session?.deliveryMethod === 'ONLINE'
                          ? 'Online Virtual Meeting'
                          : enr.session?.venue?.name || 'Classroom'}
                      </span>
                    </div>

                    {enr.finalScore !== null && (
                      <div className="flex items-center gap-1.5 font-semibold text-indigo-700">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span>
                          Score: {enr.finalScore}% ({enr.finalResult})
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                  {enr.status === 'COMPLETED' && !enr.evaluation ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEvaluatingEnrollment(enr)}
                      className="text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
                    >
                      <Star className="h-3.5 w-3.5 mr-1" />
                      Rate Course
                    </Button>
                  ) : enr.evaluation ? (
                    <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-emerald-500" />
                      Feedback Submitted ({enr.evaluation.overallRating}/5)
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Attendance tracked</span>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Tab 2: My Certificates */}
      {activeTab === 'CERTIFICATES' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {myCertificates.length === 0 ? (
            <div className="col-span-full py-12 text-center text-gray-400">
              No certificates awarded yet. Complete a training program to earn your credential badge.
            </div>
          ) : (
            myCertificates.map((c: any) => {
              const isExpired = c.expiryDate ? new Date() > new Date(c.expiryDate) : false;
              return (
                <Card key={c.id} className="p-5 border-t-4 border-indigo-600 flex flex-col justify-between space-y-4 shadow-sm">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <Award className="h-8 w-8 text-amber-500" />
                      <Badge variant={isExpired ? 'danger' : 'success'}>
                        {isExpired ? 'EXPIRED' : 'ACTIVE'}
                      </Badge>
                    </div>

                    <h3 className="text-base font-bold text-gray-900 mt-3">{c.course?.title}</h3>
                    <p className="font-mono text-xs text-indigo-600 mt-0.5">{c.certificateNumber}</p>

                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-xs text-gray-600">
                      <div>Issued: {new Date(c.issueDate).toLocaleDateString()}</div>
                      <div>
                        Expires:{' '}
                        {c.expiryDate
                          ? new Date(c.expiryDate).toLocaleDateString()
                          : 'Lifetime Credential'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-100">
                    <Link
                      href={`/training/certificates/verify/${c.certificateNumber}`}
                      target="_blank"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800"
                    >
                      Public Verification Link <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Tab 3: Open Training Sessions */}
      {activeTab === 'SESSIONS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {upcomingSessions.length === 0 ? (
            <div className="col-span-full py-12 text-center text-gray-400">
              No upcoming training sessions scheduled.
            </div>
          ) : (
            upcomingSessions.map((s: any) => {
              const isEnrolled = myEnrollments.some((e: any) => e.sessionId === s.id && e.status !== 'CANCELLED');
              const enrolledCount = s._count?.enrollments || 0;
              const isFull = enrolledCount >= s.capacity;

              return (
                <Card key={s.id} className="p-5 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                        {s.sessionNumber}
                      </span>
                      <Badge variant={isFull ? 'warning' : 'success'}>
                        {isFull ? 'Waitlist Only' : 'Open'}
                      </Badge>
                    </div>

                    <h3 className="text-base font-bold text-gray-900 mt-2">{s.course?.title}</h3>
                    <p className="text-xs text-gray-400 font-mono">{s.course?.code}</p>

                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-xs text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        <span>
                          {new Date(s.startDate).toLocaleDateString()} ({s.startTime} - {s.endTime})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {s.deliveryMethod === 'ONLINE' ? (
                          <Video className="h-3.5 w-3.5 text-blue-500" />
                        ) : (
                          <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                        )}
                        <span>{s.deliveryMethod === 'ONLINE' ? 'Online' : s.venue?.name || 'Classroom'}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Capacity: {enrolledCount} / {s.capacity} seats filled
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100">
                    {isEnrolled ? (
                      <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" /> Already Enrolled
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        disabled={enrollingSessionId === s.id}
                        onClick={() => handleEnroll(s.id)}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
                      >
                        {enrollingSessionId === s.id
                          ? 'Enrolling...'
                          : isFull
                          ? 'Join Waitlist'
                          : 'Request Enrollment'}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Tab 4: My Skills */}
      {activeTab === 'SKILLS' && (
        <Card className="p-5">
          <h3 className="text-base font-bold text-gray-900 mb-4">Acquired Skill Competencies</h3>
          {mySkills.length === 0 ? (
            <p className="text-xs text-gray-400">No skills logged in your employee profile yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {mySkills.map((sk: any) => (
                <div key={sk.id} className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm text-gray-900">{sk.skillName}</span>
                    <Badge variant="info">{sk.level}</Badge>
                  </div>
                  <div className="text-xs text-gray-500">Source: {sk.source?.replace('_', ' ')}</div>
                  <div className="text-[11px] text-gray-400">Acquired: {new Date(sk.dateAcquired).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Submit Evaluation Modal */}
      {evaluatingEnrollment && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-8">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-500" />
              Course Evaluation & Feedback
            </h3>
            <p className="text-xs text-gray-500">
              Provide feedback for <span className="font-semibold text-gray-900">{evaluatingEnrollment.course?.title}</span>
            </p>

            <form onSubmit={handleSubmitEvaluation} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Content Relevance (1-5)</label>
                  <select
                    value={evaluationForm.relevanceRating}
                    onChange={(e) => setEvaluationForm({ ...evaluationForm, relevanceRating: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white"
                  >
                    {[5, 4, 3, 2, 1].map((r) => (
                      <option key={r} value={r}>{r} Stars</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Trainer Effectiveness (1-5)</label>
                  <select
                    value={evaluationForm.trainerRating}
                    onChange={(e) => setEvaluationForm({ ...evaluationForm, trainerRating: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white"
                  >
                    {[5, 4, 3, 2, 1].map((r) => (
                      <option key={r} value={r}>{r} Stars</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Course Materials (1-5)</label>
                  <select
                    value={evaluationForm.materialsRating}
                    onChange={(e) => setEvaluationForm({ ...evaluationForm, materialsRating: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white"
                  >
                    {[5, 4, 3, 2, 1].map((r) => (
                      <option key={r} value={r}>{r} Stars</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Venue / Platform (1-5)</label>
                  <select
                    value={evaluationForm.venueRating}
                    onChange={(e) => setEvaluationForm({ ...evaluationForm, venueRating: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white"
                  >
                    {[5, 4, 3, 2, 1].map((r) => (
                      <option key={r} value={r}>{r} Stars</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">General Feedback & Comments</label>
                <textarea
                  rows={2}
                  placeholder="What went well or what could be improved?"
                  value={evaluationForm.comments}
                  onChange={(e) => setEvaluationForm({ ...evaluationForm, comments: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none text-xs"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setEvaluatingEnrollment(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submittingEval} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  {submittingEval ? 'Submitting...' : 'Send Feedback'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
