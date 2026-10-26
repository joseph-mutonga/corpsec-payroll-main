'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  Briefcase,
  ChevronRight,
  ArrowRight,
  Filter,
  RefreshCw,
  Search,
  CheckCircle2,
  Calendar,
  Eye,
} from 'lucide-react';

interface PipelineData {
  columns: Record<
    string,
    Array<{
      id: string;
      applicationNumber: string;
      fullName: string;
      email: string;
      phone: string;
      currentStage: string;
      screeningScore?: number;
      vacancy: { id: string; title: string; vacancyNumber: string };
      assignedRecruiter?: { firstName: string; lastName: string };
    }>
  >;
  totalCount: number;
  stages: string[];
}

export default function RecruitmentPipelinePage() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [vacancies, setVacancies] = useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [vacancyFilter, setVacancyFilter] = useState('ALL');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetchPipeline();
    fetchVacancies();
  }, [vacancyFilter]);

  const fetchPipeline = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (vacancyFilter !== 'ALL') params.append('vacancyId', vacancyFilter);

      const res = await fetch(`/api/recruitment/pipeline?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (e) {
      console.error('Failed to load pipeline:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchVacancies = async () => {
    try {
      const res = await fetch('/api/recruitment/vacancies');
      const json = await res.json();
      if (json.success) setVacancies(json.data.vacancies || []);
    } catch (e) {
      console.error('Error fetching vacancies:', e);
    }
  };

  const handleMoveCandidate = async (candidateId: string, toStage: string) => {
    try {
      const res = await fetch('/api/recruitment/pipeline/stage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId,
          toStage,
          reason: `Moved via Kanban Pipeline board to ${toStage}`,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setFeedback(`Candidate moved to ${toStage}.`);
        setTimeout(() => setFeedback(null), 3000);
        fetchPipeline();
      }
    } catch (e) {
      console.error('Error moving stage:', e);
    }
  };

  if (loading || !data) {
    return (
      <div className="p-6 space-y-6 max-w-full">
        <div className="h-8 bg-slate-800/40 rounded-xl w-64 animate-pulse" />
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="w-72 h-96 bg-slate-800/30 rounded-3xl animate-pulse flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-amber-500 mb-1">
            <Users className="w-4 h-4" />
            <span>Visual Pipeline Board</span>
          </div>
          <h1 className="text-2xl font-black text-white">Recruitment Kanban Pipeline</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time visual tracking of {data.totalCount} active applicants across hiring stages.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={vacancyFilter}
            onChange={(e) => setVacancyFilter(e.target.value)}
            aria-label="Filter by Vacancy Position"
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Vacancies ({data.totalCount})</option>
            {vacancies.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>

          <button
            onClick={fetchPipeline}
            title="Refresh Pipeline"
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)}>✕</button>
        </div>
      )}

      {/* Kanban Board Container */}
      <div className="flex gap-4 overflow-x-auto pb-6 pt-2 select-none">
        {data.stages.map((stage) => {
          const items = data.columns[stage] || [];
          return (
            <div
              key={stage}
              className="w-72 flex-shrink-0 bg-slate-900/50 border border-slate-800 rounded-3xl p-4 flex flex-col max-h-[75vh]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold font-mono text-white tracking-wider">{stage}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-slate-800 text-slate-400">
                  {items.length}
                </span>
              </div>

              {/* Column Cards */}
              <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                {items.length === 0 ? (
                  <div className="py-8 text-center text-[11px] text-slate-600">No applicants in {stage}</div>
                ) : (
                  items.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-amber-500/40 transition shadow-lg space-y-2 group"
                    >
                      <div className="flex items-start justify-between">
                        <Link
                          href={`/recruitment/applicants/${candidate.id}`}
                          className="font-bold text-white text-xs hover:text-amber-400 transition"
                        >
                          {candidate.fullName}
                        </Link>
                        <span className="text-[10px] font-mono text-slate-500">
                          {candidate.applicationNumber.split('-').slice(-1)[0]}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400 truncate">{candidate.vacancy.title}</p>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-[10px]">
                        <span className="text-slate-500">
                          {candidate.screeningScore ? `Score: ${candidate.screeningScore}` : candidate.phone}
                        </span>

                        <Link
                          href={`/recruitment/applicants/${candidate.id}`}
                          className="text-amber-400 hover:underline font-semibold flex items-center space-x-0.5"
                        >
                          <span>Review</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      </div>

                      {/* Quick stage transition controls */}
                      <div className="pt-2 border-t border-slate-900/60 flex items-center justify-between text-[10px]">
                        <select
                          value={stage}
                          onChange={(e) => handleMoveCandidate(candidate.id, e.target.value)}
                          aria-label="Move candidate to stage"
                          className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-400 text-[10px] focus:outline-none"
                        >
                          {data.stages.map((st) => (
                            <option key={st} value={st}>
                              Move: {st}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
