'use client';

import React, { useState, useEffect } from 'react';
import {
  FileCheck,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  BookOpen,
  Award,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function TrainingAssessmentsPage() {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('ALL');

  const [formData, setFormData] = useState({
    enrollmentId: '',
    assessmentType: 'POST_TRAINING',
    obtainedMarks: 85,
    maxMarks: 100,
    passMark: 70,
    evaluatorComments: '',
  });

  const [submitting, setSubmitting] = useState(false);

  const fetchAssessments = async () => {
    setLoading(true);
    try {
      const [resAssessments, resEnrollments] = await Promise.all([
        fetch('/api/training/assessments'),
        fetch('/api/training/enrollments?status=ENROLLED'),
      ]);
      const jsonAssessments = await resAssessments.json();
      const jsonEnrollments = await resEnrollments.json();

      if (jsonAssessments.success) setAssessments(jsonAssessments.data.assessments || []);
      if (jsonEnrollments.success) setEnrollments(jsonEnrollments.data.enrollments || []);
    } catch (err) {
      console.error('Failed to load assessments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssessments();
  }, []);

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const selectedEnr = enrollments.find((en) => en.id === formData.enrollmentId);
      if (!selectedEnr) {
        alert('Please select an enrollment record.');
        return;
      }

      const res = await fetch('/api/training/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          sessionId: selectedEnr.sessionId,
          employeeId: selectedEnr.employeeId,
          courseId: selectedEnr.courseId,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setFormData({
          enrollmentId: '',
          assessmentType: 'POST_TRAINING',
          obtainedMarks: 85,
          maxMarks: 100,
          passMark: 70,
          evaluatorComments: '',
        });
        fetchAssessments();
      } else {
        alert(json.error || 'Failed to record assessment.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const calculatedPercentage =
    formData.maxMarks > 0
      ? Math.round((formData.obtainedMarks / formData.maxMarks) * 100 * 100) / 100
      : 0;
  const isPassing = calculatedPercentage >= formData.passMark;

  const filteredAssessments = assessments.filter((a) => {
    if (resultFilter !== 'ALL' && a.result !== resultFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.assessmentNumber.toLowerCase().includes(q) ||
        a.employee?.fullName.toLowerCase().includes(q) ||
        a.course?.title.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileCheck className="h-6 w-6 text-indigo-600" />
            Training Assessments & Scoring
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Evaluate pre/post training knowledge tests, tactical drill evaluations, and calculate pass/fail compliance
          </p>
        </div>
        <Button size="sm" onClick={() => setShowModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Evaluate Assessment
        </Button>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search assessment #, employee, course..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none"
          >
            <option value="ALL">All Results</option>
            <option value="PASS">Passed</option>
            <option value="FAIL">Failed</option>
          </select>
        </div>
      </Card>

      {/* Assessments Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Assessment #</th>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Course</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Score</th>
                <th className="py-3 px-4">Pass Mark</th>
                <th className="py-3 px-4">Result</th>
                <th className="py-3 px-4">Evaluator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400">
                    Loading assessments...
                  </td>
                </tr>
              ) : filteredAssessments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400">
                    No assessments recorded yet.
                  </td>
                </tr>
              ) : (
                filteredAssessments.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-indigo-600">
                      {a.assessmentNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-gray-900">{a.employee?.fullName}</div>
                      <div className="text-xs text-gray-400">{a.employee?.employeeNumber}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-800">{a.course?.title}</div>
                      <div className="text-xs text-gray-400 font-mono">{a.course?.code}</div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className="text-[10px]">
                        {a.assessmentType.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 font-bold text-gray-900">
                      {a.scorePercentage}%{' '}
                      <span className="text-xs font-normal text-gray-400">
                        ({a.obtainedMarks}/{a.maxMarks})
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-600">{a.passMark}%</td>
                    <td className="py-3 px-4">
                      <Badge variant={a.result === 'PASS' ? 'success' : 'danger'}>
                        {a.result}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">
                      {a.evaluator?.name || 'Authorized Evaluator'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Record Assessment Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-8">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-indigo-600" />
              Record Trainee Assessment
            </h3>

            <form onSubmit={handleCreateAssessment} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Select Enrolled Participant *</label>
                <select
                  required
                  value={formData.enrollmentId}
                  onChange={(e) => {
                    const en = enrollments.find((item) => item.id === e.target.value);
                    setFormData({
                      ...formData,
                      enrollmentId: e.target.value,
                      passMark: en?.course?.passMark || 70,
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none"
                >
                  <option value="">-- Select Enrollment --</option>
                  {enrollments.map((en) => (
                    <option key={en.id} value={en.id}>
                      {en.employee?.fullName} ({en.employee?.employeeNumber}) - {en.course?.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Assessment Type</label>
                <select
                  value={formData.assessmentType}
                  onChange={(e) => setFormData({ ...formData, assessmentType: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none"
                >
                  <option value="POST_TRAINING">Post-Training Knowledge Test</option>
                  <option value="PRACTICAL">Practical Tactical Range Drill</option>
                  <option value="PRE_TRAINING">Pre-Training Assessment</option>
                  <option value="TRAINER_EVALUATION">Instructor Evaluation</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Obtained Marks *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.obtainedMarks}
                    onChange={(e) => setFormData({ ...formData, obtainedMarks: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Max Marks *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.maxMarks}
                    onChange={(e) => setFormData({ ...formData, maxMarks: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Pass Mark (%)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={formData.passMark}
                    onChange={(e) => setFormData({ ...formData, passMark: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>
              </div>

              {/* Calculated Score Result Banner */}
              <div
                className={`p-3 rounded-xl flex items-center justify-between text-xs font-semibold ${
                  isPassing ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                }`}
              >
                <span>
                  Computed Score: {calculatedPercentage}% (Pass Mark: {formData.passMark}%)
                </span>
                <span className="uppercase px-2 py-0.5 rounded bg-white font-bold">
                  {isPassing ? 'RESULT: PASS' : 'RESULT: FAIL'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Evaluator Feedback & Notes</label>
                <textarea
                  rows={2}
                  placeholder="Notes on tactical accuracy, reaction time, knowledge grasp..."
                  value={formData.evaluatorComments}
                  onChange={(e) => setFormData({ ...formData, evaluatorComments: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  {submitting ? 'Recording...' : 'Submit Assessment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
