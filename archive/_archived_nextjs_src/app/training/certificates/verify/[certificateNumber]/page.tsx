'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Award,
  Calendar,
  Building2,
  Lock,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function PublicCertificateVerificationPage() {
  const params = useParams();
  const tokenOrNumber = params.certificateNumber as string;

  const [verification, setVerification] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tokenOrNumber) {
      fetch(`/api/training/certificates/verify/${tokenOrNumber}`)
        .then((res) => res.json())
        .then((json) => {
          if (json.success) {
            setVerification(json.data);
          } else {
            setVerification({ isValid: false, message: 'Invalid or unrecognized certificate reference.' });
          }
        })
        .catch(() => {
          setVerification({ isValid: false, message: 'Unable to verify certificate at this time.' });
        })
        .finally(() => setLoading(false));
    }
  }, [tokenOrNumber]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      {/* Brand Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 bg-indigo-950/80 border border-indigo-800/60 px-4 py-1.5 rounded-full text-indigo-300 text-xs font-semibold tracking-wide uppercase mb-3">
          <ShieldCheck className="h-4 w-4 text-indigo-400" />
          CorpSec Kenya Credential Verification Portal
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Official Security Certificate Registry</h1>
      </div>

      <div className="max-w-xl w-full">
        <Card className="bg-slate-900 border border-slate-800 text-slate-100 shadow-2xl p-8 rounded-3xl backdrop-blur-xl relative overflow-hidden">
          {/* Top Decorative Ribbon */}
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-indigo-500 via-emerald-500 to-amber-500" />

          {loading ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto" />
              <p className="text-sm">Verifying security credential against official ledger...</p>
            </div>
          ) : !verification?.isValid ? (
            <div className="text-center py-6 space-y-4">
              <div className="p-4 bg-rose-950/50 border border-rose-800/80 rounded-2xl w-16 h-16 mx-auto flex items-center justify-center text-rose-400">
                <XCircle className="h-10 w-10" />
              </div>
              <h2 className="text-xl font-bold text-rose-400">Invalid or Expired Certificate</h2>
              <p className="text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
                {verification?.message ||
                  'The provided certificate number or token does not match an active credential issued by CorpSec HR & Security Training Academy.'}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Status Banner */}
              <div className="flex items-center justify-between bg-emerald-950/40 border border-emerald-800/60 p-4 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500 text-slate-950 rounded-xl">
                    <CheckCircle2 className="h-6 w-6 font-bold" />
                  </div>
                  <div>
                    <h3 className="font-bold text-emerald-400 text-sm">Verified & Authenticated</h3>
                    <p className="text-xs text-emerald-300/80">Valid Official CorpSec Credential</p>
                  </div>
                </div>
                <Badge variant="success" className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {verification.status}
                </Badge>
              </div>

              {/* Certificate Details */}
              <div className="space-y-3 bg-slate-800/40 p-5 rounded-2xl border border-slate-800 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Certificate Number:</span>
                  <span className="font-mono font-bold text-indigo-400">{verification.certificateNumber}</span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Recipient Name:</span>
                  <span className="font-bold text-slate-100">{verification.recipientName}</span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Accredited Course:</span>
                  <span className="font-bold text-slate-100 text-right">
                    {verification.courseTitle} ({verification.courseCode})
                  </span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Skill Competency:</span>
                  <span className="font-medium text-emerald-400">{verification.skillArea || 'Certified'}</span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Proficiency Level:</span>
                  <span className="font-medium text-slate-200">{verification.level}</span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Issuing Authority:</span>
                  <span className="font-medium text-slate-200">{verification.provider || 'CorpSec Security Academy'}</span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Issue Date:</span>
                  <span className="font-medium text-slate-200">
                    {new Date(verification.issueDate).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Validity Expiration:</span>
                  <span className="font-medium text-slate-200">
                    {verification.expiryDate
                      ? new Date(verification.expiryDate).toLocaleDateString()
                      : 'Lifetime Credential'}
                  </span>
                </div>
              </div>

              {/* Privacy Footer Notice */}
              <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-2 border-t border-slate-800/80">
                <Lock className="h-3.5 w-3.5 text-slate-400" />
                <span>
                  Protected Credential Record. In accordance with Kenya Data Protection Act, personal identity numbers and private HR records are redacted.
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
