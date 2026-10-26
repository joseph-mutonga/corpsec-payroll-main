'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  ChevronRight,
  AlertCircle,
  Award,
} from 'lucide-react';

interface CycleEvent {
  id: string;
  code: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  selfAssessmentDeadline: string;
  managerReviewDeadline: string;
  reviewDeadline: string;
}

export default function PerformanceCalendarPage() {
  const [cycles, setCycles] = useState<CycleEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCycles();
  }, []);

  const fetchCycles = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/performance/cycles');
      const json = await res.json();
      if (json.success) setCycles(json.data.cycles);
    } catch (e) {
      console.error('Failed to load cycles:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <CalendarIcon className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Performance Calendar</h1>
              <p className="text-sm text-zinc-400 mt-0.5">
                Key review deadlines, self-assessment windows, and calibration milestone schedules
              </p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-amber-500/20 border-t-amber-500"></div>
          <p className="text-sm text-zinc-500 mt-3 font-medium">Loading calendar milestones...</p>
        </div>
      ) : cycles.length === 0 ? (
        <div className="bg-zinc-900/60 p-12 rounded-2xl border border-zinc-800 text-center">
          <CalendarIcon className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">No scheduled performance cycle deadlines found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {cycles.map((cycle) => (
            <div
              key={cycle.id}
              className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800/80 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                    {cycle.code}
                  </span>
                  <h3 className="text-lg font-bold text-white mt-1">{cycle.name}</h3>
                </div>
                <span className="px-2.5 py-1 bg-zinc-800 text-zinc-300 text-xs font-semibold rounded-full uppercase">
                  {cycle.status}
                </span>
              </div>

              {/* Milestones Roadmap */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-black/40 rounded-xl border border-zinc-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <Clock className="w-3.5 h-3.5" /> Cycle Start
                  </div>
                  <p className="text-sm font-bold text-white font-mono">
                    {new Date(cycle.startDate).toLocaleDateString()}
                  </p>
                </div>

                <div className="p-3.5 bg-blue-950/20 rounded-xl border border-blue-900/40 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-blue-400">
                    <Clock className="w-3.5 h-3.5" /> Self-Assessment Closes
                  </div>
                  <p className="text-sm font-bold text-blue-300 font-mono">
                    {new Date(cycle.selfAssessmentDeadline).toLocaleDateString()}
                  </p>
                </div>

                <div className="p-3.5 bg-purple-950/20 rounded-xl border border-purple-900/40 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-purple-400">
                    <Clock className="w-3.5 h-3.5" /> Manager Review Due
                  </div>
                  <p className="text-sm font-bold text-purple-300 font-mono">
                    {new Date(cycle.managerReviewDeadline).toLocaleDateString()}
                  </p>
                </div>

                <div className="p-3.5 bg-amber-950/20 rounded-xl border border-amber-900/40 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-amber-400">
                    <Clock className="w-3.5 h-3.5" /> Cycle Closure
                  </div>
                  <p className="text-sm font-bold text-amber-300 font-mono">
                    {new Date(cycle.reviewDeadline).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
