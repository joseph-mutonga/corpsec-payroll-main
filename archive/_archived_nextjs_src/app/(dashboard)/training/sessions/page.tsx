'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Plus,
  Search,
  Clock,
  MapPin,
  Video,
  Users,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  BookOpen,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function TrainingSessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [trainers, setTrainers] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [deliveryFilter, setDeliveryFilter] = useState('ALL');

  const [formData, setFormData] = useState({
    courseId: '',
    trainerId: '',
    venueId: '',
    deliveryMethod: 'CLASSROOM',
    onlinePlatform: 'Microsoft Teams',
    onlineMeetingUrl: '',
    onlineMeetingInstructions: '',
    startDate: '',
    endDate: '',
    startTime: '09:00',
    endTime: '17:00',
    capacity: 20,
  });

  const [submitting, setSubmitting] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const [resSessions, resCourses, resTrainers, resVenues] = await Promise.all([
        fetch('/api/training/sessions'),
        fetch('/api/training/courses'),
        fetch('/api/training/trainers'),
        fetch('/api/training/venues'),
      ]);
      const jsonSessions = await resSessions.json();
      const jsonCourses = await resCourses.json();
      const jsonTrainers = await resTrainers.json();
      const jsonVenues = await resVenues.json();

      if (jsonSessions.success) setSessions(jsonSessions.data.sessions || []);
      if (jsonCourses.success) setCourses(jsonCourses.data.courses || []);
      if (jsonTrainers.success) setTrainers(jsonTrainers.data.trainers || []);
      if (jsonVenues.success) setVenues(jsonVenues.data.venues || []);
    } catch (err) {
      console.error('Failed to load training sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/training/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setFormData({
          courseId: '',
          trainerId: '',
          venueId: '',
          deliveryMethod: 'CLASSROOM',
          onlinePlatform: 'Microsoft Teams',
          onlineMeetingUrl: '',
          onlineMeetingInstructions: '',
          startDate: '',
          endDate: '',
          startTime: '09:00',
          endTime: '17:00',
          capacity: 20,
        });
        fetchSessions();
      } else {
        alert(json.error || 'Failed to create training session.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSessions = sessions.filter((s) => {
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
    if (deliveryFilter !== 'ALL' && s.deliveryMethod !== deliveryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.sessionNumber.toLowerCase().includes(q) ||
        s.course?.title.toLowerCase().includes(q) ||
        s.trainer?.name?.toLowerCase().includes(q) ||
        s.venue?.name?.toLowerCase().includes(q)
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
            <Calendar className="h-6 w-6 text-indigo-600" />
            Training Sessions & Class Roster
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Schedule upcoming classroom, practical range, and online virtual sessions with capacity governance
          </p>
        </div>
        <Button size="sm" onClick={() => setShowModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Schedule Session
        </Button>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search session #, course title, trainer, venue..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="FULL">Full</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <select
              value={deliveryFilter}
              onChange={(e) => setDeliveryFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none"
            >
              <option value="ALL">All Delivery</option>
              <option value="CLASSROOM">Classroom</option>
              <option value="ONLINE">Online</option>
              <option value="PRACTICAL">Practical</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Sessions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-12 text-center text-gray-400">Loading training sessions...</div>
        ) : filteredSessions.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-400">No sessions found matching filters.</div>
        ) : (
          filteredSessions.map((s) => {
            const enrolledCount = s._count?.enrollments || 0;
            const isFull = enrolledCount >= s.capacity;
            const percentFilled = Math.min(100, Math.round((enrolledCount / s.capacity) * 100));

            return (
              <Card key={s.id} className="p-5 hover:shadow-md transition-shadow flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      {s.sessionNumber}
                    </span>
                    <Badge
                      variant={
                        s.status === 'COMPLETED'
                          ? 'secondary'
                          : s.status === 'IN_PROGRESS'
                          ? 'warning'
                          : s.status === 'FULL'
                          ? 'danger'
                          : 'success'
                      }
                    >
                      {s.status}
                    </Badge>
                  </div>

                  <h3 className="text-base font-bold text-gray-900 mt-2 line-clamp-1">{s.course?.title}</h3>
                  <p className="text-xs text-gray-400 font-mono">{s.course?.code}</p>

                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 text-xs text-gray-600">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-gray-400" />
                      <span>
                        {new Date(s.startDate).toLocaleDateString()} ({s.startTime} - {s.endTime})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {s.deliveryMethod === 'ONLINE' ? (
                        <Video className="h-3.5 w-3.5 text-blue-500" />
                      ) : (
                        <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                      <span>
                        {s.deliveryMethod === 'ONLINE'
                          ? `Online (${s.onlinePlatform || 'Teams'})`
                          : s.venue?.name || 'Main Training Facility'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-indigo-500" />
                      <span>Trainer: {s.trainer?.name || 'Internal Instructor'}</span>
                    </div>
                  </div>

                  {/* Capacity Bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs font-medium text-gray-700 mb-1">
                      <span>Seats Enrolled</span>
                      <span>
                        {enrolledCount} / {s.capacity} ({percentFilled}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full ${
                          isFull ? 'bg-rose-500' : percentFilled > 75 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${percentFilled}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                  <Link href={`/training/attendance?sessionId=${s.id}`}>
                    <Button variant="outline" size="sm" className="text-xs">
                      Take Attendance
                    </Button>
                  </Link>

                  <Link href={`/training/assessments?sessionId=${s.id}`}>
                    <Button variant="ghost" size="sm" className="text-xs text-indigo-600">
                      Assessments →
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Schedule Session Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-8">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-600" />
              Schedule Training Session
            </h3>

            <form onSubmit={handleCreateSession} className="space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Select Course *</label>
                  <select
                    required
                    value={formData.courseId}
                    onChange={(e) => setFormData({ ...formData, courseId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none"
                  >
                    <option value="">-- Choose Course --</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.title} ({c.level})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Instructor / Trainer</label>
                  <select
                    value={formData.trainerId}
                    onChange={(e) => setFormData({ ...formData, trainerId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none"
                  >
                    <option value="">-- Select Trainer --</option>
                    {trainers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Delivery Method</label>
                  <select
                    value={formData.deliveryMethod}
                    onChange={(e) => setFormData({ ...formData, deliveryMethod: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none"
                  >
                    <option value="CLASSROOM">Classroom</option>
                    <option value="ONLINE">Online Virtual</option>
                    <option value="HYBRID">Hybrid</option>
                    <option value="PRACTICAL">Practical Range Drill</option>
                  </select>
                </div>

                {formData.deliveryMethod !== 'ONLINE' ? (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Physical Venue</label>
                    <select
                      value={formData.venueId}
                      onChange={(e) => setFormData({ ...formData, venueId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none"
                    >
                      <option value="">-- Select Venue --</option>
                      {venues.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} (Max {v.capacity})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Online Platform</label>
                    <input
                      type="text"
                      value={formData.onlinePlatform}
                      onChange={(e) => setFormData({ ...formData, onlinePlatform: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Max Participant Capacity</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.capacity}
                    onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
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

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                {formData.deliveryMethod === 'ONLINE' && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Online Meeting URL</label>
                    <input
                      type="url"
                      placeholder="https://teams.microsoft.com/l/meetup-join/..."
                      value={formData.onlineMeetingUrl}
                      onChange={(e) => setFormData({ ...formData, onlineMeetingUrl: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  {submitting ? 'Scheduling...' : 'Confirm Session'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
