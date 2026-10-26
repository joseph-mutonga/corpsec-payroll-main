'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Search,
  Filter,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  BookOpen,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function TrainingNeedsPage() {
  const [needs, setNeeds] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNeed, setSelectedNeed] = useState<any>(null);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [converting, setConverting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  const fetchNeeds = async () => {
    setLoading(true);
    try {
      const [resNeeds, resCourses] = await Promise.all([
        fetch('/api/performance/training-needs'),
        fetch('/api/training/courses'),
      ]);
      const jsonNeeds = await resNeeds.json();
      const jsonCourses = await resCourses.json();

      if (jsonNeeds.success) setNeeds(jsonNeeds.data.needs || []);
      if (jsonCourses.success) setCourses(jsonCourses.data.courses || []);
    } catch (err) {
      console.error('Failed to load training needs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNeeds();
  }, []);

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNeed) return;
    setConverting(true);
    try {
      const res = await fetch(`/api/performance/training-needs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          needId: selectedNeed.id,
          status: 'PLANNED',
          courseId: selectedCourseId || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSelectedNeed(null);
        fetchNeeds();
      }
    } catch (err) {
      console.error('Conversion failed:', err);
    } finally {
      setConverting(false);
    }
  };

  const filteredNeeds = needs.filter((n) => {
    if (statusFilter !== 'ALL' && n.status !== statusFilter) return false;
    if (priorityFilter !== 'ALL' && n.priority !== priorityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        n.needNumber?.toLowerCase().includes(q) ||
        n.skill?.toLowerCase().includes(q) ||
        n.identifiedNeed?.toLowerCase().includes(q) ||
        n.employee?.fullName?.toLowerCase().includes(q) ||
        n.employee?.employeeNumber?.toLowerCase().includes(q)
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
            <Sparkles className="h-6 w-6 text-amber-500" />
            Training Needs & Skill Gaps
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Reused from Phase 14 Performance Appraisals. Convert approved skill gaps into active training courses.
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by employee, skill, or requirement..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none bg-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="IDENTIFIED">Identified</option>
              <option value="APPROVED">Approved</option>
              <option value="PLANNED">Planned</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none bg-white"
            >
              <option value="ALL">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Needs Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Ref #</th>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Skill Gap / Need</th>
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    Loading training needs...
                  </td>
                </tr>
              ) : filteredNeeds.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    No training needs found matching filters.
                  </td>
                </tr>
              ) : (
                filteredNeeds.map((need) => (
                  <tr key={need.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-indigo-600">
                      {need.needNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">{need.employee?.fullName}</div>
                      <div className="text-xs text-gray-400">{need.employee?.employeeNumber} • {need.employee?.department?.name || 'Security'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-gray-800">{need.skill}</div>
                      <div className="text-xs text-gray-500 line-clamp-1">{need.identifiedNeed}</div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className="text-[11px]">
                        {need.source?.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          need.priority === 'CRITICAL'
                            ? 'danger'
                            : need.priority === 'HIGH'
                            ? 'warning'
                            : 'secondary'
                        }
                      >
                        {need.priority}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          need.status === 'COMPLETED'
                            ? 'success'
                            : need.status === 'PLANNED' || need.status === 'IN_PROGRESS'
                            ? 'info'
                            : 'secondary'
                        }
                      >
                        {need.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {need.status === 'IDENTIFIED' || need.status === 'APPROVED' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedNeed(need);
                            setSelectedCourseId(need.courseId || '');
                          }}
                          className="text-xs text-indigo-600 hover:text-indigo-700 border-indigo-200"
                        >
                          Plan Training
                        </Button>
                      ) : (
                        <span className="text-xs text-emerald-600 font-medium">Mapped</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Convert to Training Plan Modal */}
      {selectedNeed && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-indigo-600" />
              Convert Training Need to Course
            </h3>

            <div className="bg-indigo-50/70 p-3.5 rounded-xl text-xs space-y-1 text-gray-700">
              <div>
                <span className="font-semibold text-gray-900">Employee:</span> {selectedNeed.employee?.fullName} ({selectedNeed.employee?.employeeNumber})
              </div>
              <div>
                <span className="font-semibold text-gray-900">Identified Skill Gap:</span> {selectedNeed.skill}
              </div>
              <div className="text-gray-500 italic">"{selectedNeed.identifiedNeed}"</div>
            </div>

            <form onSubmit={handleConvert} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Select Matching Catalog Course
                </label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                  required
                >
                  <option value="">-- Choose a course --</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} - {c.title} ({c.level})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedNeed(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={converting || !selectedCourseId}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {converting ? 'Converting...' : 'Confirm & Schedule'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
