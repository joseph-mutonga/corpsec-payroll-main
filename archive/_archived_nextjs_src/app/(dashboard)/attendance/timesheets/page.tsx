'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Filter,
  UserCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';

export default function TimesheetsPage() {
  const { showToast } = useToast();
  const [timesheets, setTimesheets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmp, setSelectedEmp] = useState('');
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchTimesheets();
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees?pageSize=100');
      const json = await res.json();
      if (json.success) {
        setEmployees(Array.isArray(json.data) ? json.data : json.data?.employees || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTimesheets = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/attendance/timesheets');
      const json = await res.json();
      if (json.success) {
        setTimesheets(json.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedEmp) {
      showToast({ type: 'error', title: 'Please select an employee' });
      return;
    }
    try {
      setIsGenerating(true);
      const res = await fetch('/api/attendance/timesheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmp,
          startDate,
          endDate,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast({ type: 'success', title: `Timesheet ${json.data.timesheetNumber} generated!` });
        fetchTimesheets();
      } else {
        showToast({ type: 'error', title: json.error || 'Failed to generate timesheet' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Error generating timesheet' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReview = async (id: string, decision: 'APPROVE' | 'REJECT') => {
    try {
      const res = await fetch(`/api/attendance/timesheets/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REVIEW', decision }),
      });
      const json = await res.json();
      if (json.success) {
        showToast({ type: 'success', title: `Timesheet ${decision === 'APPROVE' ? 'Approved' : 'Rejected'}!` });
        fetchTimesheets();
      } else {
        showToast({ type: 'error', title: json.error || 'Review failed' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Network error during timesheet review' });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <Badge variant="success">APPROVED</Badge>;
      case 'SUBMITTED':
        return <Badge variant="warning">SUBMITTED</Badge>;
      case 'LOCKED':
        return <Badge variant="gold">LOCKED</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">REJECTED</Badge>;
      case 'DRAFT':
      default:
        return <Badge variant="neutral">DRAFT</Badge>;
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <Breadcrumb
        items={[
          { label: 'Attendance', href: '/attendance' },
          { label: 'Timesheet Management' },
        ]}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Workforce Timesheets
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
            Periodic attendance aggregation, regular hours, overtime summaries, manager reviews, and payroll locking.
          </p>
        </div>
        <Button variant="outline" onClick={fetchTimesheets} leftIcon={<RefreshCw size={16} />}>Refresh</Button>
      </div>

      {/* Generation Bar */}
      <Card style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 0.75rem 0', color: '#0f172a' }}>
          Generate / Recalculate Period Timesheet
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>Employee *</label>
            <select
              value={selectedEmp}
              onChange={(e) => setSelectedEmp(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
            >
              <option value="">-- Choose Employee --</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.fullName} ({e.employeeNumber})</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>Period Start</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>Period End</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
            />
          </div>

          <div>
            <Button
              variant="primary"
              onClick={handleGenerate}
              disabled={!selectedEmp || isGenerating}
              leftIcon={<Plus size={16} />}
              style={{ width: '100%' }}
            >
              {isGenerating ? 'Generating...' : 'Generate Timesheet'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Timesheets List */}
      <Card>
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="lg" />
            <p style={{ marginTop: '0.5rem', color: '#64748b' }}>Loading timesheets...</p>
          </div>
        ) : timesheets.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            <FileText size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
            <p style={{ fontWeight: 600, margin: 0 }}>No timesheets generated yet.</p>
            <p style={{ fontSize: '0.8125rem', margin: '0.25rem 0 0 0' }}>Generate a period timesheet above to begin review.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Timesheet #</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Employee</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Period</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Scheduled</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Worked</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Regular</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Overtime</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {timesheets.map((ts) => (
                  <tr key={ts.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700 }}>
                      {ts.timesheetNumber}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{ts.employee?.fullName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{ts.employee?.employeeNumber}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem' }}>
                      {new Date(ts.periodStart).toLocaleDateString('en-KE')} → {new Date(ts.periodEnd).toLocaleDateString('en-KE')}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{ts.scheduledHours}h</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{ts.workedHours}h</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{ts.regularHours}h</td>
                    <td style={{ padding: '0.75rem 1rem', color: ts.overtimeHours > 0 ? '#047857' : '#64748b' }}>{ts.overtimeHours}h</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {getStatusBadge(ts.status)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {ts.status === 'DRAFT' || ts.status === 'SUBMITTED' ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Button size="sm" variant="primary" onClick={() => handleReview(ts.id, 'APPROVE')}>Approve</Button>
                          <Button size="sm" variant="danger" onClick={() => handleReview(ts.id, 'REJECT')}>Reject</Button>
                        </div>
                      ) : ts.isPayrollLocked ? (
                        <span style={{ fontSize: '0.75rem', color: '#7c3aed', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Lock size={12} /> Payroll Locked
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Finalized</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
