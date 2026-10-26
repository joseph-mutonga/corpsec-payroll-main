'use client';

import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Plus,
  Search,
  Calendar,
  Layers,
  BookOpen,
  Users,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function TrainingProgramsPage() {
  const [programs, setPrograms] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    departmentId: '',
    targetAudience: '',
    startDate: '',
    endDate: '',
    isMandatory: false,
    courseIds: [] as string[],
  });

  const [submitting, setSubmitting] = useState(false);

  const fetchPrograms = async () => {
    setLoading(true);
    try {
      const [resPrograms, resCourses, resDepts] = await Promise.all([
        fetch('/api/training/programs'),
        fetch('/api/training/courses'),
        fetch('/api/departments'),
      ]);
      const jsonPrograms = await resPrograms.json();
      const jsonCourses = await resCourses.json();
      const jsonDepts = await resDepts.json();

      if (jsonPrograms.success) setPrograms(jsonPrograms.data.programs || []);
      if (jsonCourses.success) setCourses(jsonCourses.data.courses || []);
      if (jsonDepts.success) setDepartments(jsonDepts.data.departments || []);
    } catch (err) {
      console.error('Failed to load training programs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrograms();
  }, []);

  const handleCreateProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/training/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setFormData({
          name: '',
          description: '',
          departmentId: '',
          targetAudience: '',
          startDate: '',
          endDate: '',
          isMandatory: false,
          courseIds: [],
        });
        fetchPrograms();
      } else {
        alert(json.error || 'Failed to create training program.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCourseToggle = (courseId: string) => {
    setFormData((prev) => {
      const exists = prev.courseIds.includes(courseId);
      return {
        ...prev,
        courseIds: exists ? prev.courseIds.filter((id) => id !== courseId) : [...prev.courseIds, courseId],
      };
    });
  };

  const filteredPrograms = programs.filter((p) => {
    if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.programNumber.toLowerCase().includes(q) ||
        p.targetAudience?.toLowerCase().includes(q)
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
            <GraduationCap className="h-6 w-6 text-indigo-600" />
            Training Programs & Curriculums
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Group multiple specialized courses into structured learning tracks for rapid personnel upskilling
          </p>
        </div>
        <Button size="sm" onClick={() => setShowModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Create Program
        </Button>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search program name, reference number, target audience..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="OPEN">Open</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
      </Card>

      {/* Programs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-12 text-center text-gray-400">Loading programs...</div>
        ) : filteredPrograms.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-400">No training programs found.</div>
        ) : (
          filteredPrograms.map((p) => (
            <Card key={p.id} className="p-5 hover:shadow-md transition-shadow flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    {p.programNumber}
                  </span>
                  <Badge
                    variant={
                      p.status === 'ACTIVE'
                        ? 'success'
                        : p.status === 'OPEN'
                        ? 'info'
                        : p.status === 'COMPLETED'
                        ? 'secondary'
                        : 'default'
                    }
                  >
                    {p.status}
                  </Badge>
                </div>

                <h3 className="text-base font-bold text-gray-900 mt-2">{p.name}</h3>
                <p className="text-xs text-gray-500 line-clamp-2 mt-1">{p.description || 'Structured learning curriculum'}</p>

                <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-xs text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                    <span>
                      {new Date(p.startDate).toLocaleDateString()} — {new Date(p.endDate).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-gray-400" />
                    <span>{p.programCourses?.length || 0} Courses Attached</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-gray-400" />
                    <span>{p.targetAudience || 'All Qualified Guards & Staff'}</span>
                  </div>
                </div>

                {p.programCourses && p.programCourses.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {p.programCourses.slice(0, 3).map((pc: any) => (
                      <span key={pc.id} className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                        {pc.course?.code}
                      </span>
                    ))}
                    {p.programCourses.length > 3 && (
                      <span className="text-[10px] text-gray-400">+{p.programCourses.length - 3} more</span>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {p._count?.sessions ?? 0} Sessions Scheduled
                </span>
                {p.isMandatory && <Badge variant="danger" className="text-[10px]">MANDATORY</Badge>}
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Create Program Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-8">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-indigo-600" />
              Create Training Program
            </h3>

            <form onSubmit={handleCreateProgram} className="space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Program Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 2026 Night Shift Security Guard Induction"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Target Department</label>
                  <select
                    value={formData.departmentId}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none"
                  >
                    <option value="">-- All Departments --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Target Audience</label>
                  <input
                    type="text"
                    placeholder="e.g. Patrol Officers & Supervisors"
                    value={formData.targetAudience}
                    onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Attach Curriculum Courses</label>
                  <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-lg p-2.5 space-y-1.5 bg-gray-50/50">
                    {courses.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 p-1.5 hover:bg-white rounded cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={formData.courseIds.includes(c.id)}
                          onChange={() => handleCourseToggle(c.id)}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-mono font-semibold text-indigo-600">{c.code}</span>
                        <span className="text-gray-900 font-medium">{c.title}</span>
                        <span className="text-gray-400">({c.durationHours} hrs)</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isMandatory}
                      onChange={(e) => setFormData({ ...formData, isMandatory: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-semibold text-gray-800">Mandatory Company-Wide Program</span>
                  </label>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                  <textarea
                    rows={2}
                    placeholder="Program goals and expected outcomes..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  {submitting ? 'Creating...' : 'Save Program'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
