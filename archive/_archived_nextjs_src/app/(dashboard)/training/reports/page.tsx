'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Search,
  Filter,
  RefreshCw,
  Award,
  Users,
  Clock,
  DollarSign,
  Sparkles,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function TrainingReportsPage() {
  const [reportType, setReportType] = useState('TRAINING_REGISTER');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/training/reports?type=${reportType}&format=json`);
      const json = await res.json();
      if (json.success) {
        setData(json.data || []);
      }
    } catch (err) {
      console.error('Failed to load report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [reportType]);

  const handleExportCsv = () => {
    window.open(`/api/training/reports?type=${reportType}&format=csv`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-indigo-600" />
            Training Reports & Exports
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate and export regulatory compliance audits, certificate registers, and cost ledgers in CSV format
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={fetchReport} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleExportCsv} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Report Selection Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { id: 'TRAINING_REGISTER', label: 'Enrollment Register', icon: Users },
          { id: 'TRAINING_ATTENDANCE', label: 'Attendance Audit', icon: Clock },
          { id: 'CERTIFICATIONS', label: 'Certificate Registry', icon: Award },
          { id: 'TRAINING_COSTS', label: 'Cost & Spend Ledger', icon: DollarSign },
          { id: 'SKILLS_DEVELOPMENT', label: 'Skills Inventory', icon: Sparkles },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = reportType === tab.id;
          return (
            <Card
              key={tab.id}
              onClick={() => setReportType(tab.id)}
              className={`p-3.5 flex flex-col items-center text-center cursor-pointer transition-all ${
                isActive
                  ? 'border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-600'
                  : 'hover:border-gray-300'
              }`}
            >
              <div
                className={`p-2 rounded-lg mb-1.5 ${
                  isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span className={`text-xs font-semibold ${isActive ? 'text-indigo-900' : 'text-gray-700'}`}>
                {tab.label}
              </span>
            </Card>
          );
        })}
      </div>

      {/* Preview Table Card */}
      <Card className="overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <span className="font-bold text-sm text-gray-900">
            Previewing: {reportType.replace(/_/g, ' ')} ({data.length} records)
          </span>
        </div>

        <div className="overflow-x-auto max-h-[550px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/70 border-b border-gray-200 text-gray-500 font-semibold sticky top-0 uppercase tracking-wider">
              {reportType === 'TRAINING_REGISTER' && (
                <tr>
                  <th className="py-3 px-4">Enrollment #</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Course</th>
                  <th className="py-3 px-4">Session Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Final Score</th>
                  <th className="py-3 px-4">Result</th>
                </tr>
              )}
              {reportType === 'TRAINING_ATTENDANCE' && (
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Session</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Hours Attended</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Finalized</th>
                </tr>
              )}
              {reportType === 'CERTIFICATIONS' && (
                <tr>
                  <th className="py-3 px-4">Certificate #</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Course Code & Title</th>
                  <th className="py-3 px-4">Issue Date</th>
                  <th className="py-3 px-4">Expiry Date</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              )}
              {reportType === 'TRAINING_COSTS' && (
                <tr>
                  <th className="py-3 px-4">Cost #</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Course</th>
                  <th className="py-3 px-4">Course Fee</th>
                  <th className="py-3 px-4">Trainer Fee</th>
                  <th className="py-3 px-4 text-right">Total Cost</th>
                </tr>
              )}
              {reportType === 'SKILLS_DEVELOPMENT' && (
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Skill Name</th>
                  <th className="py-3 px-4">Level</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Acquired Date</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">Loading report preview...</td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">No records found for this report.</td>
                </tr>
              ) : (
                data.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/60 transition-colors">
                    {reportType === 'TRAINING_REGISTER' && (
                      <>
                        <td className="py-2.5 px-4 font-mono font-semibold text-indigo-600">{item.enrollmentNumber}</td>
                        <td className="py-2.5 px-4 font-medium text-gray-900">{item.employee?.fullName} ({item.employee?.employeeNumber})</td>
                        <td className="py-2.5 px-4">{item.course?.title}</td>
                        <td className="py-2.5 px-4 text-gray-600">{new Date(item.session?.startDate).toLocaleDateString()}</td>
                        <td className="py-2.5 px-4"><Badge variant="info">{item.status}</Badge></td>
                        <td className="py-2.5 px-4">{item.finalScore !== null ? `${item.finalScore}%` : '-'}</td>
                        <td className="py-2.5 px-4">{item.finalResult || '-'}</td>
                      </>
                    )}
                    {reportType === 'TRAINING_ATTENDANCE' && (
                      <>
                        <td className="py-2.5 px-4 font-medium text-gray-900">{item.employee?.fullName}</td>
                        <td className="py-2.5 px-4">{item.session?.course?.title}</td>
                        <td className="py-2.5 px-4 text-gray-600">{new Date(item.date).toLocaleDateString()}</td>
                        <td className="py-2.5 px-4 font-semibold text-gray-800">{item.hoursAttended} hrs</td>
                        <td className="py-2.5 px-4"><Badge variant="info">{item.status}</Badge></td>
                        <td className="py-2.5 px-4">{item.isFinalized ? 'YES' : 'NO'}</td>
                      </>
                    )}
                    {reportType === 'CERTIFICATIONS' && (
                      <>
                        <td className="py-2.5 px-4 font-mono font-semibold text-indigo-600">{item.certificateNumber}</td>
                        <td className="py-2.5 px-4 font-medium text-gray-900">{item.employee?.fullName}</td>
                        <td className="py-2.5 px-4">{item.course?.code} - {item.course?.title}</td>
                        <td className="py-2.5 px-4 text-gray-600">{new Date(item.issueDate).toLocaleDateString()}</td>
                        <td className="py-2.5 px-4 text-gray-600">{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : 'LIFETIME'}</td>
                        <td className="py-2.5 px-4"><Badge variant="success">{item.status}</Badge></td>
                      </>
                    )}
                    {reportType === 'TRAINING_COSTS' && (
                      <>
                        <td className="py-2.5 px-4 font-mono font-semibold text-indigo-600">{item.costNumber}</td>
                        <td className="py-2.5 px-4 font-medium text-gray-900">{item.department?.name || 'General'}</td>
                        <td className="py-2.5 px-4">{item.course?.title || '-'}</td>
                        <td className="py-2.5 px-4">KES {item.courseFee.toLocaleString()}</td>
                        <td className="py-2.5 px-4">KES {item.trainerFee.toLocaleString()}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-gray-900">KES {item.totalCost.toLocaleString()}</td>
                      </>
                    )}
                    {reportType === 'SKILLS_DEVELOPMENT' && (
                      <>
                        <td className="py-2.5 px-4 font-medium text-gray-900">{item.employee?.fullName}</td>
                        <td className="py-2.5 px-4">{item.employee?.department?.name || 'Security'}</td>
                        <td className="py-2.5 px-4 font-semibold text-indigo-700">{item.skillName}</td>
                        <td className="py-2.5 px-4"><Badge variant="info">{item.level}</Badge></td>
                        <td className="py-2.5 px-4 text-gray-500">{item.source}</td>
                        <td className="py-2.5 px-4 text-gray-600">{new Date(item.dateAcquired).toLocaleDateString()}</td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
