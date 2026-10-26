'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FileCheck,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  UserCheck,
  AlertTriangle,
  History,
  Shield,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { AttendanceAdjustmentData, EmployeeData } from '@/types';
import Link from 'next/link';

export default function CorrectionsPage() {
  const searchParams = useSearchParams();
  const initialRecordId = searchParams.get('recordId') || '';

  const [adjustments, setAdjustments] = useState<AttendanceAdjustmentData[]>([]);
  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(!!initialRecordId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form
  const [formData, setFormData] = useState({
    attendanceRecordId: initialRecordId,
    fieldChanged: 'CLOCK_OUT',
    newValue: '',
    reason: '',
  });

  useEffect(() => {
    loadEmployees();
    fetchAdjustments();
  }, []);

  const loadEmployees = async () => {
    try {
      const res = await fetch('/api/employees?limit=200');
      const data = await res.json();
      if (data.success) {
        setEmployees(data.data.employees || data.data);
      }
    } catch (err) {
      console.error('Failed to load employees:', err);
    }
  };

  const fetchAdjustments = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/attendance/corrections');
      const data = await res.json();
      if (data.success) {
        setAdjustments(data.data);
      }
    } catch (err) {
      console.error('Failed to load adjustments:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = () => {
    setFormData({
      attendanceRecordId: initialRecordId || '',
      fieldChanged: 'CLOCK_OUT',
      newValue: '',
      reason: '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setNotification(null);

      const res = await fetch('/api/attendance/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (data.success) {
        setNotification({ type: 'success', message: 'Attendance adjustment applied with full audit trail' });
        setShowModal(false);
        fetchAdjustments();
      } else {
        setNotification({ type: 'error', message: data.error?.message || 'Failed to apply adjustment' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error submitting correction' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredAdjustments = adjustments.filter(
    (a) =>
      a.employee?.fullName.toLowerCase().includes(search.toLowerCase()) ||
      a.employee?.employeeNumber.toLowerCase().includes(search.toLowerCase()) ||
      a.reason.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'Attendance', href: '/attendance' },
          { label: 'Attendance Corrections & Adjustments Audit Trail' },
        ]}
      />

      {notification && (
        <div
          style={{
            padding: '0.875rem 1.25rem',
            borderRadius: '8px',
            marginBottom: '1.25rem',
            backgroundColor: notification.type === 'success' ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${notification.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
            color: notification.type === 'success' ? '#065f46' : '#991b1b',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '1.5rem 1.75rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0f1c3f', marginBottom: '0.25rem' }}>
            Attendance Adjustments &amp; Corrections Log
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Auditable corrections for missed clock-outs, duty adjustments, and authorized manual overrides.
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={handleOpenModal} leftIcon={<Plus size={14} />}>
          Submit Correction
        </Button>
      </div>

      {/* Table Card */}
      <Card noPadding>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '360px' }}>
            <input
              type="text"
              placeholder="Search adjustments by employee or reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                fontSize: '0.8125rem',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
              }}
            />
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700 }}>
                <th style={{ padding: '0.75rem 1rem' }}>Adjustment Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Employee</th>
                <th style={{ padding: '0.75rem 1rem' }}>Duty Workdate</th>
                <th style={{ padding: '0.75rem 1rem' }}>Field Changed</th>
                <th style={{ padding: '0.75rem 1rem' }}>Original Value</th>
                <th style={{ padding: '0.75rem 1rem' }}>Corrected New Value</th>
                <th style={{ padding: '0.75rem 1rem' }}>Justification Reason</th>
                <th style={{ padding: '0.75rem 1rem' }}>Authorized By</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '3rem 1rem', textAlign: 'center' }}>
                    <Spinner size="md" message="Loading correction logs..." />
                  </td>
                </tr>
              ) : filteredAdjustments.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748b' }}>
                    No attendance adjustments recorded.
                  </td>
                </tr>
              ) : (
                filteredAdjustments.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', color: '#0f172a', fontWeight: 600 }}>
                      {new Date(a.createdAt).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
                      <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>
                        {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Link
                        href={`/hr/employees/${a.employee?.id}`}
                        style={{ textDecoration: 'none', color: '#0f172a', fontWeight: 600 }}
                      >
                        {a.employee?.fullName}
                      </Link>
                      <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>
                        {a.employee?.employeeNumber}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                      {a.attendanceRecord?.date
                        ? new Date(a.attendanceRecord.date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant="neutral" size="sm">{a.fieldChanged}</Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#dc2626', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {a.originalValue || 'NULL'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#059669', fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700 }}>
                      {a.newValue || 'NULL'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                      {a.reason}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                      {a.correctedBy ? `${a.correctedBy.firstName} ${a.correctedBy.lastName}` : 'System Admin'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Submit Correction */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              maxWidth: '520px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.25rem' }}>
              Submit Attendance Correction
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1.25rem' }}>
              Correct clock-in/out timestamps or status. The original value will be permanently preserved in the audit trail.
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                    Attendance Record ID *
                  </label>
                  <input
                    type="text"
                    value={formData.attendanceRecordId}
                    onChange={(e) => setFormData({ ...formData, attendanceRecordId: e.target.value })}
                    placeholder="Enter Attendance Record ID"
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Field to Correct *
                    </label>
                    <select
                      value={formData.fieldChanged}
                      onChange={(e) => setFormData({ ...formData, fieldChanged: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#ffffff' }}
                    >
                      <option value="CLOCK_OUT">Clock Out Timestamp</option>
                      <option value="CLOCK_IN">Clock In Timestamp</option>
                      <option value="STATUS">Attendance Status</option>
                      <option value="WORKED_MINUTES">Worked Minutes</option>
                      <option value="OVERTIME">Overtime Minutes</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      New Value *
                    </label>
                    <input
                      type="text"
                      value={formData.newValue}
                      onChange={(e) => setFormData({ ...formData, newValue: e.target.value })}
                      placeholder="e.g. 2026-08-12T18:00:00Z or PRESENT"
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                    Justification Reason *
                  </label>
                  <input
                    type="text"
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="e.g. Guard forgot to clock out at gate terminal; verified by patrol supervisor"
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                    required
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
                    {isSubmitting ? 'Applying...' : 'Apply Correction'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
