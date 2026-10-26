'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ShieldCheck,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  FileText,
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  GraduationCap,
} from 'lucide-react';

export default function PublicJobApplyPage() {
  const params = useParams();
  const vacancyId = params?.id as string;
  const router = useRouter();

  const [vacancyTitle, setVacancyTitle] = useState('');
  const [vacancyNumber, setVacancyNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedApp, setSubmittedApp] = useState<{
    applicationNumber: string;
    fullName: string;
    email: string;
  } | null>(null);

  // Form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [currentOccupation, setCurrentOccupation] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [highestQualification, setHighestQualification] = useState('');
  const [skills, setSkills] = useState('');
  const [relevantExperience, setRelevantExperience] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [resumeFilename, setResumeFilename] = useState('');
  const [source, setSource] = useState('CAREERS_PAGE');

  useEffect(() => {
    if (vacancyId) {
      fetch(`/api/careers/${vacancyId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.data.vacancy) {
            setVacancyTitle(data.data.vacancy.title);
            setVacancyNumber(data.data.vacancy.vacancyNumber);
          } else {
            setError('This vacancy is currently not accepting applications.');
          }
        })
        .catch(() => setError('Failed to load vacancy information.'))
        .finally(() => setLoading(false));
    }
  }, [vacancyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/careers/${vacancyId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          location,
          currentOccupation,
          experienceYears: experienceYears ? parseFloat(experienceYears) : undefined,
          highestQualification,
          skills,
          relevantExperience,
          coverLetter,
          resumeUrl,
          resumeFilename: resumeFilename || (resumeUrl ? 'Resume_CV.pdf' : undefined),
          source,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to submit application.');
      }

      setSubmittedApp(json.data.candidate);
    } catch (err: any) {
      setError(err.message || 'Submission error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Top Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href={`/careers/${vacancyId}`}
            className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Job Details</span>
          </Link>

          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-bold">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-white tracking-tight">CorpSec Recruitment</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {submittedApp ? (
          /* Application Success Receipt */
          <div className="bg-slate-900/80 border border-emerald-500/30 rounded-3xl p-8 sm:p-12 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Application Received!</h2>
            <p className="text-sm text-slate-400 mt-2 max-w-lg mx-auto">
              Thank you, <span className="text-white font-semibold">{submittedApp.fullName}</span>. Your application
              for <span className="text-amber-400 font-semibold">{vacancyTitle}</span> has been securely logged into our
              Applicant Tracking System.
            </p>

            <div className="my-8 max-w-md mx-auto p-6 rounded-2xl bg-slate-950/80 border border-slate-800 text-left">
              <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold block mb-1">
                Your Official Application Reference:
              </span>
              <span className="text-xl sm:text-2xl font-mono font-bold text-amber-400 block select-all">
                {submittedApp.applicationNumber}
              </span>
              <p className="text-xs text-slate-500 mt-3">
                Please quote this application reference in all correspondence with the CorpSec HR Directorate.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/careers"
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-8 py-3.5 rounded-xl text-sm transition"
              >
                Browse Other Vacancies
              </Link>
            </div>
          </div>
        ) : (
          /* Application Form */
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 sm:p-10 shadow-2xl">
            <div className="mb-8 pb-6 border-b border-slate-800">
              <span className="text-xs font-mono text-amber-400 font-semibold uppercase tracking-wider">
                {vacancyNumber}
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">Application for {vacancyTitle}</h1>
              <p className="text-xs text-slate-400 mt-2">
                Please provide accurate details. All information is processed strictly in accordance with CorpSec privacy
                and data protection policies.
              </p>
            </div>

            {error && (
              <div className="mb-8 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start space-x-3 text-rose-300 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Section 1: Personal Information */}
              <div>
                <h3 className="text-base font-bold text-white mb-4 flex items-center space-x-2">
                  <User className="w-4 h-4 text-amber-400" />
                  <span>1. Personal Information</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Full Legal Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Brian Kiprop Otieno"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Email Address <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. brian.kiprop@example.co.ke"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Phone Number <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. +254 711 000 000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Current Residence / Town
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Nairobi, Kasarani"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Professional & Experience */}
              <div className="pt-6 border-t border-slate-800">
                <h3 className="text-base font-bold text-white mb-4 flex items-center space-x-2">
                  <Briefcase className="w-4 h-4 text-amber-400" />
                  <span>2. Professional Experience & Qualifications</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Current / Most Recent Role
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Security Guard / Response Driver"
                      value={currentOccupation}
                      onChange={(e) => setCurrentOccupation(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Years of Relevant Experience
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="e.g. 2.5"
                      value={experienceYears}
                      onChange={(e) => setExperienceYears(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Highest Qualification Attained
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. KCSE / Security Certificate / Diploma"
                      value={highestQualification}
                      onChange={(e) => setHighestQualification(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Key Skills (Comma separated)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Access Control, First Aid, CCTV"
                      value={skills}
                      onChange={(e) => setSkills(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Summary of Relevant Experience
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Briefly describe your security or operational assignments..."
                    value={relevantExperience}
                    onChange={(e) => setRelevantExperience(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 resize-none"
                  />
                </div>
              </div>

              {/* Section 3: Application Documents & Cover Letter */}
              <div className="pt-6 border-t border-slate-800">
                <h3 className="text-base font-bold text-white mb-4 flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span>3. Application Documents & Cover Letter</span>
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Resume / CV Document Link or Storage URL
                    </label>
                    <input
                      type="text"
                      placeholder="https://drive.google.com/... or cloud document link"
                      value={resumeUrl}
                      onChange={(e) => setResumeUrl(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Cover Letter / Personal Statement
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Explain why you are the ideal fit for this position at CorpSec..."
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      How did you hear about this vacancy?
                    </label>
                    <select
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="CAREERS_PAGE">CorpSec Careers Website</option>
                      <option value="REFERRAL">Staff / Employee Referral</option>
                      <option value="AGENCY">Recruitment Agency</option>
                      <option value="OTHER">Other / Social Media</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Submit Action */}
              <div className="pt-6 border-t border-slate-800 flex items-center justify-between">
                <p className="text-xs text-slate-500 max-w-sm">
                  By clicking submit, you certify that all information provided is true and complete.
                </p>

                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold px-10 py-3.5 rounded-xl text-sm transition shadow-lg shadow-amber-500/20"
                >
                  {submitting ? 'Submitting Application...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
