'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Search,
  Award,
  BookOpen,
  Phone,
  Mail,
  Building,
  Star,
  CheckCircle2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function TrainersPage() {
  const [trainers, setTrainers] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedTrainerStats, setSelectedTrainerStats] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const [formData, setFormData] = useState({
    name: '',
    type: 'INTERNAL',
    employeeId: '',
    organization: '',
    email: '',
    phone: '',
    expertise: '',
    costPerSession: 0,
  });

  const [submitting, setSubmitting] = useState(false);

  const fetchTrainers = async () => {
    setLoading(true);
    try {
      const [resTrainers, resEmps] = await Promise.all([
        fetch('/api/training/trainers'),
        fetch('/api/employees'),
      ]);
      const jsonTrainers = await resTrainers.json();
      const jsonEmps = await resEmps.json();

      if (jsonTrainers.success) setTrainers(jsonTrainers.data.trainers || []);
      if (jsonEmps.success) setEmployees(jsonEmps.data.employees || []);
    } catch (err) {
      console.error('Failed to load trainers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrainers();
  }, []);

  const handleCreateTrainer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/training/trainers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setFormData({
          name: '',
          type: 'INTERNAL',
          employeeId: '',
          organization: '',
          email: '',
          phone: '',
          expertise: '',
          costPerSession: 0,
        });
        fetchTrainers();
      } else {
        alert(json.error || 'Failed to create trainer.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewPerformance = async (trainerId: string) => {
    try {
      const res = await fetch(`/api/training/trainers/${trainerId}?stats=true`);
      const json = await res.json();
      if (json.success) {
        setSelectedTrainerStats(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const filteredTrainers = trainers.filter((t) => {
    if (typeFilter !== 'ALL' && t.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.trainerNumber.toLowerCase().includes(q) ||
        t.expertise?.toLowerCase().includes(q) ||
        t.organization?.toLowerCase().includes(q)
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
            <Users className="h-6 w-6 text-indigo-600" />
            Trainer Directory & Performance
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage certified internal employee instructors, range masters, and external specialized training vendors
          </p>
        </div>
        <Button size="sm" onClick={() => setShowModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Register Trainer
        </Button>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search trainer name, badge number, expertise, or institution..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none"
          >
            <option value="ALL">All Types</option>
            <option value="INTERNAL">Internal Employee</option>
            <option value="EXTERNAL">External Vendor</option>
          </select>
        </div>
      </Card>

      {/* Trainers Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-12 text-center text-gray-400">Loading trainer directory...</div>
        ) : filteredTrainers.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-400">No trainers registered yet.</div>
        ) : (
          filteredTrainers.map((t) => (
            <Card key={t.id} className="p-5 hover:shadow-md transition-shadow flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    {t.trainerNumber}
                  </span>
                  <Badge variant={t.type === 'INTERNAL' ? 'info' : 'warning'}>
                    {t.type}
                  </Badge>
                </div>

                <h3 className="text-base font-bold text-gray-900 mt-2">{t.name}</h3>
                <p className="text-xs text-indigo-600 font-medium">{t.expertise || 'General Security Instructor'}</p>

                <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-xs text-gray-600">
                  {t.type === 'INTERNAL' ? (
                    <div className="flex items-center gap-1.5">
                      <Award className="h-3.5 w-3.5 text-gray-400" />
                      <span>{t.employee?.employeeNumber} • {t.employee?.department?.name || 'Security'}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Building className="h-3.5 w-3.5 text-gray-400" />
                      <span>{t.organization || 'Independent Security Consultant'}</span>
                    </div>
                  )}

                  {t.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-gray-400" />
                      <span>{t.email}</span>
                    </div>
                  )}

                  {t.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-gray-400" />
                      <span>{t.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400 font-medium">
                  {t._count?.sessions || 0} Sessions Run
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewPerformance(t.id)}
                  className="text-xs text-indigo-600 border-indigo-200"
                >
                  View Ratings
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Register Trainer Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-8">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" />
              Register Instructor / Trainer
            </h3>

            <form onSubmit={handleCreateTrainer} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Trainer Type *</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none"
                >
                  <option value="INTERNAL">Internal Employee (Existing Profile)</option>
                  <option value="EXTERNAL">External Training Institution / Vendor</option>
                </select>
              </div>

              {formData.type === 'INTERNAL' ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Select Employee *</label>
                  <select
                    required
                    value={formData.employeeId}
                    onChange={(e) => {
                      const emp = employees.find((em) => em.id === e.target.value);
                      setFormData({
                        ...formData,
                        employeeId: e.target.value,
                        name: emp ? emp.fullName : '',
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none"
                  >
                    <option value="">-- Choose Employee --</option>
                    {employees.map((em) => (
                      <option key={em.id} value={em.id}>
                        {em.fullName} ({em.employeeNumber})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Trainer Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Major (Rtd) David Ochieng"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Organization / Institute</label>
                    <input
                      type="text"
                      placeholder="e.g. Kenya Security Academy"
                      value={formData.organization}
                      onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Area of Expertise</label>
                <input
                  type="text"
                  placeholder="e.g. Advanced Firearm Tactics, First Aid, VIP Escort"
                  value={formData.expertise}
                  onChange={(e) => setFormData({ ...formData, expertise: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Cost Per Session (KES)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.costPerSession}
                  onChange={(e) => setFormData({ ...formData, costPerSession: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  {submitting ? 'Registering...' : 'Save Trainer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Trainer Stats Modal */}
      {selectedTrainerStats && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{selectedTrainerStats.trainer?.name}</h3>
              <Badge variant="info">{selectedTrainerStats.trainer?.type}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-indigo-50 p-3 rounded-xl">
                <span className="text-2xl font-bold text-indigo-700 block">
                  {selectedTrainerStats.stats?.averageTrainerRating} / 5.0
                </span>
                <span className="text-xs text-gray-500 font-medium">Instructor Rating</span>
              </div>
              <div className="bg-emerald-50 p-3 rounded-xl">
                <span className="text-2xl font-bold text-emerald-700 block">
                  {selectedTrainerStats.stats?.completionRate}%
                </span>
                <span className="text-xs text-gray-500 font-medium">Completion Rate</span>
              </div>
              <div className="bg-blue-50 p-3 rounded-xl">
                <span className="text-2xl font-bold text-blue-700 block">
                  {selectedTrainerStats.stats?.totalEmployeesTrained}
                </span>
                <span className="text-xs text-gray-500 font-medium">Guards Trained</span>
              </div>
              <div className="bg-purple-50 p-3 rounded-xl">
                <span className="text-2xl font-bold text-purple-700 block">
                  {selectedTrainerStats.stats?.assessmentPassRate}%
                </span>
                <span className="text-xs text-gray-500 font-medium">Pass Rate</span>
              </div>
            </div>

            <div className="text-xs text-gray-500 text-center pt-2">
              Based on {selectedTrainerStats.stats?.evaluationsCount} anonymous participant feedback submissions
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-100">
              <Button size="sm" variant="outline" onClick={() => setSelectedTrainerStats(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
