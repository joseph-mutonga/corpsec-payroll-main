'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileCheck,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Send,
  Building2,
  Lock,
  ChevronRight,
} from 'lucide-react';

interface OfferItem {
  id: string;
  offerNumber: string;
  employmentType: string;
  proposedSalary: number;
  startDate: string;
  offerExpiryDate: string;
  status: string;
  secureToken: string;
  candidateResponse?: string;
  candidate: { id: string; fullName: string; applicationNumber: string; email: string; phone: string };
  vacancy: { id: string; title: string; vacancyNumber: string; department: { name: string } };
  approvedBy?: { firstName: string; lastName: string };
}

export default function JobOffersManagementPage() {
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [candidates, setCandidates] = useState<Array<{ id: string; fullName: string; vacancyId: string; vacancy: { title: string; minSalary?: number; departmentId: string } }>>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form states
  const [candidateId, setCandidateId] = useState('');
  const [proposedSalary, setProposedSalary] = useState('28000');
  const [startDate, setStartDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
  const [employmentType, setEmploymentType] = useState('PERMANENT');

  useEffect(() => {
    fetchOffers();
    fetchCandidates();
  }, []);

  const fetchOffers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/recruitment/offers');
      const json = await res.json();
      if (json.success) setOffers(json.data.offers || []);
    } catch (e) {
      console.error('Failed to load offers:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCandidates = async () => {
    try {
      const res = await fetch('/api/recruitment/applicants?stage=INTERVIEW');
      const json = await res.json();
      if (json.success) setCandidates(json.data.applicants || []);
    } catch (e) {
      console.error('Failed to load candidates for offer:', e);
    }
  };

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    const cand = candidates.find((c) => c.id === candidateId);
    if (!cand) return;

    try {
      const res = await fetch('/api/recruitment/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId,
          vacancyId: cand.vacancyId,
          departmentId: cand.vacancy.departmentId,
          proposedSalary: parseFloat(proposedSalary),
          startDate,
          offerExpiryDate: expiryDate,
          employmentType,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setFeedback({ type: 'success', message: 'Job offer drafted successfully.' });
        setShowCreateModal(false);
        fetchOffers();
      }
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message });
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`/api/recruitment/offers/${id}/approve`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setFeedback({ type: 'success', message: 'Job offer approved by HR.' });
        fetchOffers();
      }
    } catch (e) {
      console.error('Error approving offer:', e);
    }
  };

  const handleSend = async (id: string) => {
    try {
      const res = await fetch(`/api/recruitment/offers/${id}/send`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setFeedback({ type: 'success', message: 'Job offer marked as sent. Public acceptance link active.' });
        fetchOffers();
      }
    } catch (e) {
      console.error('Error sending offer:', e);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-amber-500 mb-1">
            <FileCheck className="w-4 h-4" />
            <span>Employment Offers & Authorizations</span>
          </div>
          <h1 className="text-2xl font-black text-white">Job Offer Management Desk</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Draft compensation terms, approve sensitive salary packages, and dispatch secure tokenized offers.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center space-x-2 shadow-lg shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Draft New Offer</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)}>✕</button>
        </div>
      )}

      {/* Offers Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Offer No & Candidate</th>
                <th className="py-3.5 px-4">Position & Department</th>
                <th className="py-3.5 px-4">Proposed Salary</th>
                <th className="py-3.5 px-4">Start Date</th>
                <th className="py-3.5 px-4">Status & Decision</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Loading job offers...
                  </td>
                </tr>
              ) : offers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    No job offers drafted yet.
                  </td>
                </tr>
              ) : (
                offers.map((off) => (
                  <tr key={off.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white text-sm">{off.candidate.fullName}</div>
                      <div className="font-mono text-amber-400 text-[11px]">{off.offerNumber}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{off.vacancy.title}</div>
                      <div className="text-slate-400 text-[11px]">{off.vacancy.department.name}</div>
                    </td>

                    <td className="py-3.5 px-4 font-bold text-white">
                      KES {off.proposedSalary.toLocaleString()} / mo
                    </td>

                    <td className="py-3.5 px-4 text-slate-400">
                      {new Date(off.startDate).toLocaleDateString('en-KE', { dateStyle: 'medium' })}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-full font-semibold text-[11px] ${
                          off.status === 'ACCEPTED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : off.status === 'APPROVED'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : off.status === 'SENT'
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            : off.status === 'DECLINED'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {off.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {off.status === 'DRAFT' && (
                          <button
                            onClick={() => handleApprove(off.id)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[11px] transition"
                          >
                            Approve
                          </button>
                        )}

                        {off.status === 'APPROVED' && (
                          <button
                            onClick={() => handleSend(off.id)}
                            className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] transition flex items-center space-x-1"
                          >
                            <Send className="w-3 h-3" />
                            <span>Dispatch</span>
                          </button>
                        )}

                        <Link
                          href={`/careers/offers/${off.secureToken}`}
                          target="_blank"
                          title="View Candidate Letter"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Draft Employment Job Offer</h3>
            <form onSubmit={handleCreateOffer} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Select Candidate *</label>
                <select
                  required
                  value={candidateId}
                  onChange={(e) => setCandidateId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">Select candidate...</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} — {c.vacancy.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Basic Monthly Salary (KES) *</label>
                  <input
                    type="number"
                    required
                    value={proposedSalary}
                    onChange={(e) => setProposedSalary(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Employment Type</label>
                  <select
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="PERMANENT">Permanent</option>
                    <option value="CONTRACT">Fixed-Term Contract</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Effective Start Date *</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Offer Expiration Date *</label>
                  <input
                    type="date"
                    required
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
                >
                  Draft Offer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
