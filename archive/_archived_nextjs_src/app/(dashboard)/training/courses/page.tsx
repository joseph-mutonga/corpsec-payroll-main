'use client';

import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  Shield,
  Clock,
  Award,
  Layers,
  CheckCircle,
  XCircle,
  Tag,
  FolderPlus,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function CourseCatalogPage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [trainers, setTrainers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [deliveryFilter, setDeliveryFilter] = useState('ALL');

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    categoryId: '',
    skillArea: '',
    level: 'INTERMEDIATE',
    durationHours: 8,
    deliveryMethod: 'CLASSROOM',
    provider: 'Internal L&D',
    defaultTrainerId: '',
    assessmentRequired: true,
    passMark: 70,
    certificateIssued: true,
    validityMonths: 24,
    isMandatory: false,
    estimatedCostPerPerson: 0,
    description: '',
  });

  const [catFormData, setCatFormData] = useState({
    name: '',
    code: '',
    description: '',
  });

  const [submitting, setSubmitting] = useState(false);

  const fetchCatalog = async () => {
    setLoading(true);
    try {
      const [resCourses, resCats, resTrainers] = await Promise.all([
        fetch('/api/training/courses'),
        fetch('/api/training/categories'),
        fetch('/api/training/trainers'),
      ]);
      const jsonCourses = await resCourses.json();
      const jsonCats = await resCats.json();
      const jsonTrainers = await resTrainers.json();

      if (jsonCourses.success) setCourses(jsonCourses.data.courses || []);
      if (jsonCats.success) setCategories(jsonCats.data.categories || []);
      if (jsonTrainers.success) setTrainers(jsonTrainers.data.trainers || []);
    } catch (err) {
      console.error('Failed to load courses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/training/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setFormData({
          title: '',
          categoryId: '',
          skillArea: '',
          level: 'INTERMEDIATE',
          durationHours: 8,
          deliveryMethod: 'CLASSROOM',
          provider: 'Internal L&D',
          defaultTrainerId: '',
          assessmentRequired: true,
          passMark: 70,
          certificateIssued: true,
          validityMonths: 24,
          isMandatory: false,
          estimatedCostPerPerson: 0,
          description: '',
        });
        fetchCatalog();
      } else {
        alert(json.error || 'Failed to create course');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/training/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(catFormData),
      });
      const json = await res.json();
      if (json.success) {
        setShowCatModal(false);
        setCatFormData({ name: '', code: '', description: '' });
        fetchCatalog();
      } else {
        alert(json.error || 'Failed to create category');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCourses = courses.filter((c) => {
    if (categoryFilter !== 'ALL' && c.categoryId !== categoryFilter) return false;
    if (levelFilter !== 'ALL' && c.level !== levelFilter) return false;
    if (deliveryFilter !== 'ALL' && c.deliveryMethod !== deliveryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.title.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.skillArea?.toLowerCase().includes(q) ||
        c.provider?.toLowerCase().includes(q)
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
            <BookOpen className="h-6 w-6 text-indigo-600" />
            Course Catalog & Curriculum
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Browse and configure accredited security training courses, tactical drills, and compliance certifications
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowCatModal(true)}>
            <FolderPlus className="h-4 w-4 mr-2" />
            New Category
          </Button>
          <Button size="sm" onClick={() => setShowModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Add Course
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search course title, code, skill area, or provider..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>

            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none"
            >
              <option value="ALL">All Levels</option>
              <option value="BEGINNER">Beginner</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="ADVANCED">Advanced</option>
              <option value="EXPERT">Expert</option>
            </select>

            <select
              value={deliveryFilter}
              onChange={(e) => setDeliveryFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none"
            >
              <option value="ALL">All Delivery</option>
              <option value="CLASSROOM">Classroom</option>
              <option value="ONLINE">Online</option>
              <option value="HYBRID">Hybrid</option>
              <option value="PRACTICAL">Practical</option>
              <option value="EXTERNAL">External</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Courses Grid / Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Course Title & Category</th>
                <th className="py-3 px-4">Level</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Delivery</th>
                <th className="py-3 px-4">Validity</th>
                <th className="py-3 px-4">Mandatory</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400">
                    Loading courses catalog...
                  </td>
                </tr>
              ) : filteredCourses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400">
                    No courses found matching filter criteria.
                  </td>
                </tr>
              ) : (
                filteredCourses.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-indigo-600">
                      {c.code}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-gray-900">{c.title}</div>
                      <div className="text-xs text-gray-400">
                        {c.category?.name || c.categoryName || 'General'} • {c.provider}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          c.level === 'EXPERT'
                            ? 'danger'
                            : c.level === 'ADVANCED'
                            ? 'warning'
                            : c.level === 'INTERMEDIATE'
                            ? 'info'
                            : 'secondary'
                        }
                      >
                        {c.level}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-gray-700 text-xs font-medium">
                      {c.durationHours} hrs
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-600">
                      {c.deliveryMethod}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-600">
                      {c.validityMonths ? `${c.validityMonths} mos` : 'Lifetime'}
                    </td>
                    <td className="py-3 px-4">
                      {c.isMandatory ? (
                        <Badge variant="danger" className="text-[10px]">MANDATORY</Badge>
                      ) : (
                        <span className="text-xs text-gray-400">Optional</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={c.status === 'ACTIVE' ? 'success' : 'secondary'}>
                        {c.status}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Course Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-8">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-indigo-600" />
              Create New Training Course
            </h3>

            <form onSubmit={handleCreateCourse} className="space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Course Title *</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g. Tactical Guard Protocol & Radio Communications"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none"
                  >
                    <option value="">-- Select Category --</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({cat.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Skill Area</label>
                  <input
                    type="text"
                    value={formData.skillArea}
                    onChange={(e) => setFormData({ ...formData, skillArea: e.target.value })}
                    placeholder="e.g. Access Control, First Aid, CCTV"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Difficulty Level</label>
                  <select
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none"
                  >
                    <option value="BEGINNER">Beginner</option>
                    <option value="INTERMEDIATE">Intermediate</option>
                    <option value="ADVANCED">Advanced</option>
                    <option value="EXPERT">Expert</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Duration (Hours)</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.durationHours}
                    onChange={(e) => setFormData({ ...formData, durationHours: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Delivery Method</label>
                  <select
                    value={formData.deliveryMethod}
                    onChange={(e) => setFormData({ ...formData, deliveryMethod: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none"
                  >
                    <option value="CLASSROOM">Classroom</option>
                    <option value="ONLINE">Online</option>
                    <option value="HYBRID">Hybrid</option>
                    <option value="PRACTICAL">Practical Drill</option>
                    <option value="EXTERNAL">External Institution</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Provider / Institute</label>
                  <input
                    type="text"
                    value={formData.provider}
                    onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Pass Mark (%)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.passMark}
                    onChange={(e) => setFormData({ ...formData, passMark: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Certificate Validity (Months)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 24 (or 0 for lifetime)"
                    value={formData.validityMonths}
                    onChange={(e) => setFormData({ ...formData, validityMonths: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div className="md:col-span-2 flex flex-wrap gap-4 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isMandatory}
                      onChange={(e) => setFormData({ ...formData, isMandatory: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-semibold text-gray-800">Mandatory Compliance Course</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.assessmentRequired}
                      onChange={(e) => setFormData({ ...formData, assessmentRequired: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-medium text-gray-800">Assessment Required for Completion</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.certificateIssued}
                      onChange={(e) => setFormData({ ...formData, certificateIssued: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-medium text-gray-800">Issue Certificate on Passing</span>
                  </label>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Course objectives, curriculum summary, practical drills involved..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  {submitting ? 'Creating...' : 'Save Course'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showCatModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-indigo-600" />
              Add Course Category
            </h3>

            <form onSubmit={handleCreateCategory} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VIP Close Protection"
                  value={catFormData.name}
                  onChange={(e) => setCatFormData({ ...catFormData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Category Code * (3-4 chars)</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="e.g. VIP"
                  value={catFormData.code}
                  onChange={(e) => setCatFormData({ ...catFormData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg uppercase focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Category scope and focus..."
                  value={catFormData.description}
                  onChange={(e) => setCatFormData({ ...catFormData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowCatModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  {submitting ? 'Creating...' : 'Save Category'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
