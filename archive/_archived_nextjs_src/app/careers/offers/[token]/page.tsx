'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Calendar,
  Building2,
  Award,
  FileCheck,
} from 'lucide-react';

interface OfferData {
  offerNumber: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  departmentName: string;
  stationName?: string;
  employmentType: string;
  proposedSalary: number;
  startDate: string;
  offerExpiryDate: string;
  offerLetterContent?: string;
  status: string;
  candidateResponse?: string;
  respondedAt?: string;
  isExpired: boolean;
}

export default function CandidateOfferLetterPage() {
  const params = useParams();
  const token = params?.token as string;

  const [offer, setOffer] = useState<OfferData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  useEffect(() => {
    if (token) {
      fetchOffer();
    }
  }, [token]);

  const fetchOffer = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/careers/offers/${token}`);
      const json = await res.json();
      if (json.success && json.data.offer) {
        setOffer(json.data.offer);
      } else {
        setError(json.error || 'Offer letter link is invalid or expired.');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to retrieve offer letter.');
    } finally {
      setLoading(false);
    }
  };

  const handleResponse = async (decision: 'ACCEPT' | 'DECLINE') => {
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/careers/offers/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          declineReason: decision === 'DECLINE' ? declineReason : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to process decision.');
      }

      setActionSuccess(json.data.message);
      setShowDeclineModal(false);
      fetchOffer();
    } catch (err: any) {
      setError(err.message || 'Action error');
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Offer Link Invalid or Expired</h2>
        <p className="text-sm text-slate-400 max-w-md text-center mb-6">
          {error || 'This employment offer cannot be accessed or has reached its validity expiration.'}
        </p>
        <Link
          href="/careers"
          className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition"
        >
          Visit CorpSec Careers
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-20">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-white tracking-tight">CorpSec Employment Offer</span>
              <span className="text-xs font-mono text-amber-400 block">{offer.offerNumber}</span>
            </div>
          </div>

          <div>
            {offer.candidateResponse ? (
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-full ${
                  offer.candidateResponse === 'ACCEPTED'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}
              >
                {offer.candidateResponse}
              </span>
            ) : offer.isExpired ? (
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                EXPIRED
              </span>
            ) : (
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                AWAITING YOUR DECISION
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-10">
        {actionSuccess && (
          <div className="mb-8 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Offer Summary Card */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-8 shadow-2xl mb-8">
          <div className="flex flex-col sm:flex-row justify-between gap-6 pb-6 border-b border-slate-800">
            <div>
              <span className="text-xs uppercase tracking-wider text-amber-400 font-semibold">Offer Extended To:</span>
              <h1 className="text-2xl font-extrabold text-white mt-1">{offer.candidateName}</h1>
              <p className="text-xs text-slate-400 mt-1">{offer.candidateEmail}</p>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold block">Position:</span>
              <span className="text-lg font-bold text-white block mt-1">{offer.jobTitle}</span>
              <span className="text-xs text-slate-400">
                {offer.departmentName} {offer.stationName ? `• ${offer.stationName}` : ''}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 my-6 text-sm">
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-xs text-slate-500 block mb-1">Monthly Gross Remuneration</span>
              <span className="text-xl font-bold text-amber-400">
                KES {offer.proposedSalary.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-xs text-slate-500 block mb-1">Effective Start Date</span>
              <span className="text-sm font-semibold text-white">
                {new Date(offer.startDate).toLocaleDateString('en-KE', { dateStyle: 'medium' })}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-xs text-slate-500 block mb-1">Offer Expiration Date</span>
              <span className="text-sm font-semibold text-rose-300">
                {new Date(offer.offerExpiryDate).toLocaleDateString('en-KE', { dateStyle: 'medium' })}
              </span>
            </div>
          </div>

          {/* Letter text rendering */}
          <div className="mt-8 pt-6 border-t border-slate-800">
            <h3 className="text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider">Formal Offer Document</h3>
            <div className="p-6 sm:p-8 rounded-2xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-xs sm:text-sm whitespace-pre-line leading-relaxed shadow-inner">
              {offer.offerLetterContent}
            </div>
          </div>

          {/* Acceptance Actions */}
          {!offer.candidateResponse && !offer.isExpired && (
            <div className="mt-10 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-slate-400 max-w-md">
                Clicking Accept confirms your agreement to the terms outlined in this official offer letter.
              </p>

              <div className="flex items-center space-x-3 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => setShowDeclineModal(true)}
                  className="w-1/2 sm:w-auto px-6 py-3 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold text-sm transition"
                >
                  Decline Offer
                </button>

                <button
                  type="button"
                  disabled={acting}
                  onClick={() => handleResponse('ACCEPT')}
                  className="w-1/2 sm:w-auto px-8 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-emerald-500/20"
                >
                  {acting ? 'Processing...' : 'Accept Job Offer'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Decline Reason Modal */}
      {showDeclineModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Decline Job Offer</h3>
            <p className="text-xs text-slate-400 mb-4">
              Please let us know your reason for declining this employment offer (optional):
            </p>

            <textarea
              rows={3}
              placeholder="e.g. Accepted another role, compensation mismatch, location..."
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500 mb-6 resize-none"
            />

            <div className="flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowDeclineModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={acting}
                onClick={() => handleResponse('DECLINE')}
                className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition"
              >
                {acting ? 'Declining...' : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
