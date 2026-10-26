'use client';

import React, { useState, useEffect } from 'react';
import {
  Star,
  Search,
  Filter,
  MessageSquare,
  Users,
  BookOpen,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function TrainingEvaluationsPage() {
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchEvaluations = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/training/evaluations');
      const json = await res.json();
      if (json.success) setEvaluations(json.data.evaluations || []);
    } catch (err) {
      console.error('Failed to load evaluations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvaluations();
  }, []);

  const filteredEvals = evaluations.filter((e) => {
    if (search) {
      const q = search.toLowerCase();
      return (
        e.employee?.fullName.toLowerCase().includes(q) ||
        e.session?.course?.title.toLowerCase().includes(q) ||
        e.session?.trainer?.name.toLowerCase().includes(q) ||
        e.comments?.toLowerCase().includes(q)
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
            <Star className="h-6 w-6 text-amber-500" />
            Training Evaluations & Feedback
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Participant feedback ratings on course content relevance, venue comfort, delivery, and instructor effectiveness
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="relative w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search evaluation by trainee name, course, trainer, or keywords in comments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </Card>

      {/* Evaluations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-12 text-center text-gray-400">Loading evaluations...</div>
        ) : filteredEvals.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-400">No participant evaluations recorded yet.</div>
        ) : (
          filteredEvals.map((e) => (
            <Card key={e.id} className="p-5 hover:shadow-md transition-shadow flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1 text-amber-500 font-bold text-base">
                    <Star className="h-5 w-5 fill-amber-400" />
                    <span>{e.overallRating} / 5.0</span>
                  </div>
                  <Badge variant="info">{e.session?.course?.code}</Badge>
                </div>

                <h3 className="text-sm font-bold text-gray-900 mt-2">{e.session?.course?.title}</h3>
                <p className="text-xs text-gray-500">
                  Trainer: {e.session?.trainer?.name || 'Assigned Instructor'}
                </p>

                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100 text-center text-xs">
                  <div className="bg-gray-50 p-2 rounded">
                    <span className="text-[10px] text-gray-400 block">Relevance</span>
                    <span className="font-semibold text-gray-800">{e.relevanceRating} / 5</span>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <span className="text-[10px] text-gray-400 block">Trainer</span>
                    <span className="font-semibold text-gray-800">{e.trainerRating} / 5</span>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <span className="text-[10px] text-gray-400 block">Materials</span>
                    <span className="font-semibold text-gray-800">{e.materialsRating} / 5</span>
                  </div>
                </div>

                {e.comments && (
                  <div className="mt-3 p-3 bg-amber-50/50 border border-amber-100 rounded-xl text-xs text-gray-700 italic">
                    "{e.comments}"
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                <span>{e.employee?.fullName}</span>
                <span>{new Date(e.submittedAt).toLocaleDateString()}</span>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
