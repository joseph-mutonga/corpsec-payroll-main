'use client';

import React, { useEffect, useState } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import {
  DollarSign,
  Search,
  Filter,
  Plus,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  History,
  ShieldCheck,
  User,
  AlertTriangle,
} from 'lucide-react';
import { SalaryRecordData } from '@/types';
import Link from 'next/link';

export default function SalariesPage() {
  const { toast } = useToast();
  const [salaries, setSalaries] = useState<SalaryRecordData[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ACTIVE');
  const [selectedDept, setSelectedDept] = useState('');

  // Propose Revision Modal
  const [isProposeOpen, setIsProposeOpen] = useState(false);
  const [proposeData, setProposeData] = useState({
    employeeId: '',
    proposedSalary: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    payFrequency: 'MONTHLY',
    isOvertimeEligible: true,
    changeReason: '',
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Review Modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedSalary, setSelectedSalary] = useState<SalaryRecordData | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  useEffect(() => {
    fetchSalaries();
    fetchEmployeesList();
  }, [selectedStatus]);

  const fetchSalaries = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedStatus) params.append('status', selectedStatus);

      const res = await fetch(`/api/payroll/salaries?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setSalaries(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching salaries:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployeesList = async () => {
    try {
      const res = await fetch('/api/employees?pageSize=100');
      const data = await res.json();
      if (data.success) {
        setEmployees(data.data.employees || []);
      }
    } catch (err) {
      console.error('Error fetching employees list:', err);
    }
  };

  const handleProposeSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const res = await fetch('/api/payroll/salaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: proposeData.employeeId,
          basicSalary: parseFloat(proposeData.proposedSalary),
          effectiveFrom: proposeData.effectiveFrom,
          payFrequency: proposeData.payFrequency,
          isOvertimeEligible: proposeData.isOvertimeEligible,
          changeReason: proposeData.changeReason,
          notes: proposeData.notes,
          status: 'PENDING_APPROVAL',
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Success', message: 'Salary revision proposal submitted for review', type: 'success' });
        setIsProposeOpen(false);
        fetchSalaries();
      } else {
        toast({ title: 'Error', message: data.error?.message || 'Failed to submit revision', type: 'error' });
      }
    } catch (err) {
      toast({ title: 'Error', message: 'An unexpected error occurred', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReviewAction = async (action: 'APPROVE' | 'REJECT') => {
    if (!selectedSalary) return;
    try {
      setIsReviewing(true);
      const res = await fetch(`/api/payroll/salaries/${selectedSalary.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          notes: reviewNotes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: 'Success',
          message: action === 'APPROVE' ? 'Salary revision approved and activated' : 'Salary proposal rejected',
          type: 'success',
        });
        setReviewModalOpen(false);
        setSelectedSalary(null);
        fetchSalaries();
      } else {
        toast({ title: 'Error', message: data.error?.message || 'Review failed', type: 'error' });
      }
    } catch (err) {
      toast({ title: 'Error', message: 'An unexpected error occurred', type: 'error' });
    } finally {
      setIsReviewing(false);
    }
  };

  const filteredSalaries = salaries.filter((s) => {
    const q = search.toLowerCase();
    const matchName = s.employee?.fullName?.toLowerCase().includes(q);
    const matchNum = s.employee?.employeeNumber?.toLowerCase().includes(q);
    const matchDept =
      !selectedDept ||
      s.employee?.department?.code === selectedDept ||
      s.employee?.department?.name === selectedDept;
    return (matchName || matchNum) && matchDept;
  });

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'Payroll Management', href: '/payroll' },
          { label: 'Salary Structures & Revisions' },
        ]}
      />

      {/* Header Banner */}
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
            Employee Salary Structures &amp; Compensation
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Manage base compensation rates, propose salary reviews with effective dates, and audit historical pay records.
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={() => setIsProposeOpen(true)} leftIcon={<TrendingUp size={14} />}>
          Propose Salary Revision
        </Button>
      </div>

      {/* Filters Bar */}
      <Card noPadding style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            padding: '1rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
            <div style={{ maxWidth: '280px', width: '100%' }}>
              <Input
                placeholder="Search employee name or number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search size={14} />}
              />
            </div>

            <div style={{ width: '170px' }}>
              <Select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                options={[
                  { value: '', label: 'All Statuses' },
                  { value: 'ACTIVE', label: 'Active Salaries' },
                  { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
                  { value: 'SUPERSEDED', label: 'Historical Superseded' },
                  { value: 'REJECTED', label: 'Rejected' },
                ]}
              />
            </div>
          </div>

          <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Showing <strong>{filteredSalaries.length}</strong> salary record(s)
          </div>
        </div>
      </Card>

      {/* Salary Records Table */}
      <Card noPadding>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner message="Loading salary structures..." />
          </div>
        ) : filteredSalaries.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No salary records match the selected filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', backgroundColor: '#f8fafc' }}>
                  <th style={{ padding: '0.875rem 1.25rem' }}>Employee</th>
                  <th style={{ padding: '0.875rem 1.25rem' }}>Position &amp; Station</th>
                  <th style={{ padding: '0.875rem 1.25rem' }}>Basic Salary</th>
                  <th style={{ padding: '0.875rem 1.25rem' }}>Effective Date</th>
                  <th style={{ padding: '0.875rem 1.25rem' }}>Overtime Eligible</th>
                  <th style={{ padding: '0.875rem 1.25rem' }}>Status</th>
                  <th style={{ padding: '0.875rem 1.25rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSalaries.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            backgroundColor: '#eff6ff',
                            color: '#2563eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                          }}
                        >
                          {s.employee?.fullName?.charAt(0) || 'E'}
                        </div>
                        <div>
                          <Link
                            href={`/hr/employees/${s.employeeId}`}
                            style={{ fontWeight: 700, color: '#0f1c3f', textDecoration: 'none' }}
                          >
                            {s.employee?.fullName}
                          </Link>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                            {s.employee?.employeeNumber}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <div style={{ fontWeight: 600, color: '#334155' }}>
                        {s.employee?.jobTitle || s.employee?.position?.title || 'Security Guard'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {s.employee?.station?.name || s.employee?.branch?.name || 'Nairobi HQ'}
                      </div>
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem', fontWeight: 800, fontSize: '0.9375rem', color: '#0f1c3f' }}>
                      {s.currency} {s.basicSalary.toLocaleString()}
                      <span style={{ fontSize: '0.6875rem', fontWeight: 400, color: '#64748b', marginLeft: '0.25rem' }}>
                        / {s.payFrequency.toLowerCase()}
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem', color: '#475569' }}>
                      <div>{new Date(s.effectiveFrom).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                      {s.effectiveTo && (
                        <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>
                          to {new Date(s.effectiveTo).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <Badge variant={s.isOvertimeEligible ? 'success' : 'neutral'} size="sm">
                        {s.isOvertimeEligible ? 'Eligible (1.5x/2.0x)' : 'Exempt'}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <Badge
                        variant={
                          s.status === 'ACTIVE'
                            ? 'success'
                            : s.status === 'PENDING_APPROVAL'
                            ? 'warning'
                            : s.status === 'SUPERSEDED'
                            ? 'neutral'
                            : 'danger'
                        }
                        size="sm"
                      >
                        {s.status}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right' }}>
                      {s.status === 'PENDING_APPROVAL' ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setSelectedSalary(s);
                            setReviewModalOpen(true);
                          }}
                        >
                          Review
                        </Button>
                      ) : (
                        <Link href={`/hr/employees/${s.employeeId}`} style={{ textDecoration: 'none' }}>
                          <Button variant="ghost" size="sm" leftIcon={<ExternalLink size={13} />}>
                            Profile
                          </Button>
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Propose Revision Modal */}
      <Modal
        isOpen={isProposeOpen}
        onClose={() => setIsProposeOpen(false)}
        title="Propose Employee Salary Revision"
        size="md"
      >
        <form onSubmit={handleProposeSalary} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Select
            label="Select Employee"
            value={proposeData.employeeId}
            onChange={(e) => setProposeData({ ...proposeData, employeeId: e.target.value })}
            options={[
              { value: '', label: '-- Select Employee --' },
              ...employees.map((emp) => ({
                value: emp.id,
                label: `${emp.fullName} (${emp.employeeNumber} - ${emp.jobTitle})`,
              })),
            ]}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
            <Input
              label="Proposed Basic Salary (KES)"
              type="number"
              value={proposeData.proposedSalary}
              onChange={(e) => setProposeData({ ...proposeData, proposedSalary: e.target.value })}
              placeholder="e.g. 35000"
              required
            />
            <Input
              label="Effective Date"
              type="date"
              value={proposeData.effectiveFrom}
              onChange={(e) => setProposeData({ ...proposeData, effectiveFrom: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Select
              label="Pay Frequency"
              value={proposeData.payFrequency}
              onChange={(e) => setProposeData({ ...proposeData, payFrequency: e.target.value })}
              options={[
                { value: 'MONTHLY', label: 'Monthly' },
                { value: 'WEEKLY', label: 'Weekly' },
                { value: 'BI_WEEKLY', label: 'Bi-Weekly' },
                { value: 'DAILY', label: 'Daily' },
              ]}
            />

            <Select
              label="Overtime Eligibility"
              value={proposeData.isOvertimeEligible ? 'true' : 'false'}
              onChange={(e) => setProposeData({ ...proposeData, isOvertimeEligible: e.target.value === 'true' })}
              options={[
                { value: 'true', label: 'Eligible (Guards / Patrol)' },
                { value: 'false', label: 'Exempt (Management)' },
              ]}
            />
          </div>

          <Input
            label="Revision Justification / Reason"
            value={proposeData.changeReason}
            onChange={(e) => setProposeData({ ...proposeData, changeReason: e.target.value })}
            placeholder="e.g. Annual Merit Review, Promotion to Senior Shift In-Charge"
            required
          />

          <Input
            label="Additional Notes"
            value={proposeData.notes}
            onChange={(e) => setProposeData({ ...proposeData, notes: e.target.value })}
            placeholder="e.g. Approved by Operations Director"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="ghost" type="button" onClick={() => setIsProposeOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              Submit For Review
            </Button>
          </div>
        </form>
      </Modal>

      {/* Review Modal */}
      {selectedSalary && (
        <Modal
          isOpen={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          title="Review Proposed Salary Revision"
          size="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div
              style={{
                padding: '1rem',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Employee:</span>
                <strong style={{ fontSize: '0.875rem', color: '#0f1c3f' }}>
                  {selectedSalary.employee?.fullName} ({selectedSalary.employee?.employeeNumber})
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Proposed Basic Salary:</span>
                <strong style={{ fontSize: '1rem', color: '#059669' }}>
                  {selectedSalary.currency} {selectedSalary.basicSalary.toLocaleString()} / mo
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Effective Date:</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                  {new Date(selectedSalary.effectiveFrom).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Justification:</span>
                <span style={{ fontSize: '0.8125rem', color: '#334155' }}>{selectedSalary.changeReason}</span>
              </div>
            </div>

            <Input
              label="Manager Review Comments"
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="e.g. Approved per 2026 corporate salary scale review"
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button
                variant="danger"
                type="button"
                onClick={() => handleReviewAction('REJECT')}
                isLoading={isReviewing}
                leftIcon={<XCircle size={14} />}
              >
                Reject Proposal
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={() => handleReviewAction('APPROVE')}
                isLoading={isReviewing}
                leftIcon={<CheckCircle2 size={14} />}
              >
                Approve &amp; Activate
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
