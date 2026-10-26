'use client';

import React, { useState, useEffect } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { Plus, AlertTriangle, CheckCircle2, ShieldAlert, Filter, Search, FileText } from 'lucide-react';

export default function AbsencesPage() {
  const { success, error: toastError } = useToast();
  const [absences, setAbsences] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [selectedAbsence, setSelectedAbsence] = useState<any | null>(null);

  const [createFormData, setCreateFormData] = useState({
    employeeId: '',
    date: new Date().toISOString().split('T')[0],
    absenceType: 'UNEXCUSED',
    reason: '',
    status: 'OPEN',
  });

  const [resolveFormData, setResolveFormData] = useState({
    status: 'EXCUSED',
    resolutionNotes: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    fetchAbsences();
  }, [statusFilter]);

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees?pageSize=100&status=ACTIVE');
      const json = await res.json();
      if (json.success && json.data.employees?.length > 0) {
        setEmployees(json.data.employees);
        setCreateFormData((prev) => ({ ...prev, employeeId: json.data.employees[0].id }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAbsences = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const res = await fetch(`/api/leave/absences?${params.toString()}`);
      const json = await res.json();
      if (json.success) setAbsences(json.data.absences);
    } catch (err) {
      toastError('Failed to load absence records');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const res = await fetch('/api/leave/absences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createFormData),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      success('Absence incident recorded successfully.');
      setIsCreateModalOpen(false);
      fetchAbsences();
    } catch (err: any) {
      toastError(err.message || 'Failed to record absence.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAbsence) return;

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/leave/absences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          absenceId: selectedAbsence.id,
          status: resolveFormData.status,
          resolutionNotes: resolveFormData.resolutionNotes,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      success('Absence incident resolved successfully.');
      setIsResolveModalOpen(false);
      fetchAbsences();
    } catch (err: any) {
      toastError(err.message || 'Failed to resolve absence.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <Badge variant="danger">OPEN INCIDENT</Badge>;
      case 'EXCUSED':
        return <Badge variant="success">EXCUSED</Badge>;
      case 'UNEXCUSED':
        return <Badge variant="danger">UNEXCUSED</Badge>;
      case 'RESOLVED':
        return <Badge variant="info">RESOLVED</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <Breadcrumb
            items={[
              { label: 'Leave Management', href: '/leave' },
              { label: 'Absence Incident Management' },
            ]}
          />
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
            Absence Management &amp; Excusal Desk
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
            Track unscheduled absences, sick callouts, unexcused incidents, and document excusal decisions
          </p>
        </div>

        <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
          <Plus size={16} style={{ marginRight: '0.5rem' }} /> Log Absence Incident
        </Button>
      </div>

      {/* Filter Bar */}
      <Card>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ width: '220px' }}>
            <Select
              label="Filter Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'All Incidents' },
                { value: 'OPEN', label: 'Open Incidents' },
                { value: 'EXCUSED', label: 'Excused' },
                { value: 'UNEXCUSED', label: 'Unexcused' },
                { value: 'RESOLVED', label: 'Resolved' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Absences Table */}
      <Card>
        {isLoading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" />
          </div>
        ) : absences.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No absence incidents found matching filter.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Incident #</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Date</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Type</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Reason / Details</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {absences.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#ef4444' }}>
                      {a.absenceNumber}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{a.employee.fullName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {a.employee.employeeNumber} &bull; {a.employee.department?.name || 'General'}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                      {new Date(a.date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant="neutral" size="sm">{a.absenceType}</Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                      <div>{a.reason}</div>
                      {a.resolutionNotes && (
                        <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.2rem' }}>
                          <strong>Resolution:</strong> {a.resolutionNotes}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      {getStatusBadge(a.status)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedAbsence(a);
                          setResolveFormData({
                            status: a.status === 'OPEN' ? 'EXCUSED' : a.status,
                            resolutionNotes: a.resolutionNotes || '',
                          });
                          setIsResolveModalOpen(true);
                        }}
                      >
                        Resolve / Excuse
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Absence Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Log Unscheduled Absence Incident"
      >
        <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
          <Select
            label="Employee"
            value={createFormData.employeeId}
            onChange={(e) => setCreateFormData({ ...createFormData, employeeId: e.target.value })}
            options={employees.map((e) => ({
              value: e.id,
              label: `${e.fullName} (${e.employeeNumber} — ${e.department?.name || 'General'})`,
            }))}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Input
              label="Absence Date"
              type="date"
              value={createFormData.date}
              onChange={(e) => setCreateFormData({ ...createFormData, date: e.target.value })}
              required
            />
            <Select
              label="Absence Classification"
              value={createFormData.absenceType}
              onChange={(e) => setCreateFormData({ ...createFormData, absenceType: e.target.value })}
              options={[
                { value: 'SICK', label: 'Emergency Sick Absence' },
                { value: 'EMERGENCY', label: 'Family Emergency' },
                { value: 'BEREAVEMENT', label: 'Bereavement / Funeral' },
                { value: 'UNEXCUSED', label: 'Unexcused / No Show' },
                { value: 'TRAINING', label: 'Authorized Training' },
                { value: 'OTHER', label: 'Other Reason' },
              ]}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
              Incident Details &amp; Supervisor Notes
            </label>
            <textarea
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '0.625rem',
                border: '1px solid #cbd5e1',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
              placeholder="Detail the circumstances of the absence, notification timing, etc."
              value={createFormData.reason}
              onChange={(e) => setCreateFormData({ ...createFormData, reason: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="outline" type="button" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Logging...' : 'Save Absence Incident'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Resolve Modal */}
      {selectedAbsence && (
        <Modal
          isOpen={isResolveModalOpen}
          onClose={() => setIsResolveModalOpen(false)}
          title={`Resolve Absence Incident — ${selectedAbsence.absenceNumber}`}
        >
          <form onSubmit={handleResolveSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
            <div style={{ padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }}>
              <div><strong>Employee:</strong> {selectedAbsence.employee.fullName} ({selectedAbsence.employee.employeeNumber})</div>
              <div><strong>Date:</strong> {new Date(selectedAbsence.date).toLocaleDateString()}</div>
              <div><strong>Original Reason:</strong> {selectedAbsence.reason}</div>
            </div>

            <Select
              label="Resolution Determination"
              value={resolveFormData.status}
              onChange={(e) => setResolveFormData({ ...resolveFormData, status: e.target.value })}
              options={[
                { value: 'EXCUSED', label: 'Excused (Doctor note / Valid justification provided)' },
                { value: 'UNEXCUSED', label: 'Unexcused (Subject to disciplinary / unpaid deduction)' },
                { value: 'RESOLVED', label: 'Resolved & Closed' },
              ]}
            />

            <div>
              <label style={{ display: 'block', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                Resolution Documentation / HR Notes
              </label>
              <textarea
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '0.625rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
                placeholder="Explain the HR determination and any corrective actions taken..."
                value={resolveFormData.resolutionNotes}
                onChange={(e) => setResolveFormData({ ...resolveFormData, resolutionNotes: e.target.value })}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button variant="outline" type="button" onClick={() => setIsResolveModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Commit Determination'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
