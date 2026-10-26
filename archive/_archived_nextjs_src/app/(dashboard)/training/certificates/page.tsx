'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Award,
  Plus,
  Search,
  ExternalLink,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  FileCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function CertificatesPage() {
  const [certificates, setCertificates] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [formData, setFormData] = useState({
    enrollmentId: '',
    customExpiryDate: '',
  });

  const [submitting, setSubmitting] = useState(false);

  const fetchCertificates = async () => {
    setLoading(true);
    try {
      const [resCerts, resEnrs] = await Promise.all([
        fetch('/api/training/certificates'),
        fetch('/api/training/enrollments?status=ATTENDED'),
      ]);
      const jsonCerts = await resCerts.json();
      const jsonEnrs = await resEnrs.json();

      if (jsonCerts.success) setCertificates(jsonCerts.data.certificates || []);
      if (jsonEnrs.success) setEnrollments(jsonEnrs.data.enrollments || []);
    } catch (err) {
      console.error('Failed to load certificates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCertificates();
  }, []);

  const handleIssueCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/training/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollmentId: formData.enrollmentId,
          customExpiryDate: formData.customExpiryDate || undefined,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setFormData({ enrollmentId: '', customExpiryDate: '' });
        fetchCertificates();
      } else {
        alert(json.error || 'Failed to issue certificate.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCerts = certificates.filter((c) => {
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.certificateNumber.toLowerCase().includes(q) ||
        c.employee?.fullName.toLowerCase().includes(q) ||
        c.employee?.employeeNumber.toLowerCase().includes(q) ||
        c.course?.title.toLowerCase().includes(q)
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
            <Award className="h-6 w-6 text-indigo-600" />
            Certificate Governance & Credentials
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Issue certified security badges, track validity expirations, and generate public QR verification links
          </p>
        </div>
        <Button size="sm" onClick={() => setShowModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Issue Certificate
        </Button>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search cert #, employee name, badge #, course..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="EXPIRING">Expiring</option>
            <option value="EXPIRED">Expired</option>
            <option value="REVOKED">Revoked</option>
          </select>
        </div>
      </Card>

      {/* Certificates Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Certificate #</th>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Course & Skill Area</th>
                <th className="py-3 px-4">Issue Date</th>
                <th className="py-3 px-4">Expiry Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    Loading certificates...
                  </td>
                </tr>
              ) : filteredCerts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    No certificates issued yet.
                  </td>
                </tr>
              ) : (
                filteredCerts.map((c) => {
                  const isExpired = c.expiryDate ? new Date() > new Date(c.expiryDate) : false;
                  return (
                    <tr key={c.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-indigo-600">
                        {c.certificateNumber}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-900">{c.employee?.fullName}</div>
                        <div className="text-xs text-gray-400">{c.employee?.employeeNumber} • {c.employee?.department?.name || 'Security'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-800">{c.course?.title}</div>
                        <div className="text-xs text-indigo-600 font-medium">{c.course?.skillArea || 'Certified Competency'}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-600">
                        {new Date(c.issueDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-600">
                        {c.expiryDate ? (
                          <span className={isExpired ? 'text-rose-600 font-semibold' : ''}>
                            {new Date(c.expiryDate).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-medium">Lifetime</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            c.status === 'REVOKED'
                              ? 'danger'
                              : isExpired
                              ? 'danger'
                              : 'success'
                          }
                        >
                          {c.status === 'REVOKED' ? 'REVOKED' : isExpired ? 'EXPIRED' : 'ACTIVE'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/training/certificates/verify/${c.certificateNumber}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                          Verify <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Issue Certificate Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Award className="h-5 w-5 text-indigo-600" />
              Issue Training Certificate
            </h3>

            <form onSubmit={handleIssueCertificate} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Select Completed Participant *
                </label>
                <select
                  required
                  value={formData.enrollmentId}
                  onChange={(e) => setFormData({ ...formData, enrollmentId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none"
                >
                  <option value="">-- Choose Participant --</option>
                  {enrollments.map((en) => (
                    <option key={en.id} value={en.id}>
                      {en.employee?.fullName} ({en.employee?.employeeNumber}) - {en.course?.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Custom Expiry Date (Optional — defaults to course validity)
                </label>
                <input
                  type="date"
                  value={formData.customExpiryDate}
                  onChange={(e) => setFormData({ ...formData, customExpiryDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  {submitting ? 'Generating...' : 'Issue Credential'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
