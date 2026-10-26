'use client';

import React, { useState, useEffect } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import {
  UserPlus,
  CheckCircle2,
  Circle,
  Clock,
  ArrowRight,
  Shield,
  FileText,
  DollarSign,
  Briefcase,
  Laptop,
  Calendar,
} from 'lucide-react';

export default function OnboardingHubPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ total: 0, inProgress: 0, completed: 0 });
  const [stageFilter, setStageFilter] = useState('ALL');
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isNewCaseOpen, setIsNewCaseOpen] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [newForm, setNewForm] = useState({
    employeeId: '',
    targetCompletionDate: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCases();
    fetchEmployees();
  }, [stageFilter]);

  const fetchCases = async () => {
    try {
      setLoading(true);
      const url = `/api/hr/onboarding?stage=${stageFilter}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setCases(json.data.cases || []);
        setStats(json.data.stats || { total: 0, inProgress: 0, completed: 0 });
      }
    } catch (err) {
      console.error('Error fetching onboarding cases:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees?limit=100');
      const json = await res.json();
      if (json.success) {
        setEmployees(json.data.employees || []);
      }
    } catch (err) {
      console.error('Error fetching employees:', err);
    }
  };

  const handleOpenDetail = async (c: any) => {
    try {
      const res = await fetch(`/api/hr/onboarding/${c.id}`);
      const json = await res.json();
      if (json.success) {
        setSelectedCase(json.data);
        setIsDetailOpen(true);
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Failed to load onboarding case detail' });
    }
  };

  const handleToggleTask = async (taskId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/hr/onboarding/${selectedCase.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          isCompleted: !currentStatus,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast({ type: 'success', title: 'Task status updated successfully' });
        setSelectedCase((prev: any) => ({
          ...prev,
          stage: json.data.onboardingCase.stage,
          status: json.data.onboardingCase.status,
          tasks: json.data.onboardingCase.tasks,
        }));
        fetchCases();
      } else {
        showToast({ type: 'error', title: json.error || 'Failed to update task' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Network error updating task' });
    }
  };

  const handleCreateOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.employeeId) {
      showToast({ type: 'error', title: 'Please select an employee' });
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch('/api/hr/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      });
      const json = await res.json();
      if (json.success) {
        showToast({ type: 'success', title: 'Onboarding case initiated successfully' });
        setIsNewCaseOpen(false);
        setNewForm({ employeeId: '', targetCompletionDate: '', notes: '' });
        fetchCases();
      } else {
        showToast({ type: 'error', title: json.error || 'Failed to initiate onboarding' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Network error initiating onboarding' });
    } finally {
      setSubmitting(false);
    }
  };

  const getStageBadge = (stage: string) => {
    switch (stage) {
      case 'INITIATED':
        return <Badge variant="neutral">1. Initiated</Badge>;
      case 'DOCUMENTS':
        return <Badge variant="warning">2. Documents</Badge>;
      case 'SETUP':
        return <Badge variant="info">3. System Setup</Badge>;
      case 'ORIENTATION':
        return <Badge variant="gold">4. Orientation</Badge>;
      case 'COMPLETED':
        return <Badge variant="success">5. Completed</Badge>;
      default:
        return <Badge variant="neutral">{stage}</Badge>;
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'DOCUMENTS':
        return <FileText size={16} color="#0284c7" />;
      case 'FINANCE':
        return <DollarSign size={16} color="#16a34a" />;
      case 'OPERATIONS':
        return <Briefcase size={16} color="#b45309" />;
      case 'IT':
        return <Laptop size={16} color="#6d28d9" />;
      default:
        return <Shield size={16} color="#475569" />;
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Breadcrumb items={[{ label: 'Human Resources', href: '/hr' }, { label: 'Onboarding Hub' }]} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserPlus size={28} color="#0f1c3f" />
            Employee Onboarding & Induction Hub
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
            Structured 5-stage induction pipeline for new recruits, guards, and corporate officers.
          </p>
        </div>

        <Button variant="primary" onClick={() => setIsNewCaseOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <UserPlus size={16} /> Initiate New Onboarding
        </Button>
      </div>

      {/* KPI Counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div style={{ padding: '1rem', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total Onboardings</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', marginTop: '0.25rem' }}>{stats.total}</div>
        </div>
        <div style={{ padding: '1rem', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Active In Progress</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#d97706', marginTop: '0.25rem' }}>{stats.inProgress}</div>
        </div>
        <div style={{ padding: '1rem', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Completed Inductions</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16a34a', marginTop: '0.25rem' }}>{stats.completed}</div>
        </div>
      </div>

      {/* Stage Filter Buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {['ALL', 'INITIATED', 'DOCUMENTS', 'SETUP', 'ORIENTATION', 'COMPLETED'].map((st) => (
          <Button
            key={st}
            size="sm"
            variant={stageFilter === st ? 'primary' : 'outline'}
            onClick={() => setStageFilter(st)}
          >
            {st.replace(/_/g, ' ')}
          </Button>
        ))}
      </div>

      {/* Cases Table */}
      <Card noPadding>
        {loading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" />
          </div>
        ) : cases.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No onboarding cases found matching the selected filter.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Case Number</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Employee</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Role & Station</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Stage</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Tasks Progress</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Assigned HR</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => {
                  const completedTasks = c.tasks?.filter((t: any) => t.isCompleted).length || 0;
                  const totalTasks = c.tasks?.length || 9;
                  const percent = Math.round((completedTasks / totalTasks) * 100);

                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.875rem 1rem', fontWeight: 700, color: '#0f1c3f' }}>{c.caseNumber}</td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#0f1c3f' }}>{c.employee?.fullName}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.employee?.employeeNumber}</div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div>{c.employee?.jobTitle}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {c.employee?.station?.name || c.employee?.department?.name || 'Unassigned'}
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>{getStageBadge(c.stage)}</td>
                      <td style={{ padding: '0.875rem 1rem', minWidth: '160px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                          <span>{completedTasks} / {totalTasks} Tasks</span>
                          <span>{percent}%</span>
                        </div>
                        <div style={{ height: '6px', width: '100%', backgroundColor: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${percent}%`, backgroundColor: percent === 100 ? '#16a34a' : '#0f1c3f', borderRadius: '3px' }} />
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: '#64748b' }}>
                        {c.assignedTo ? `${c.assignedTo.firstName} ${c.assignedTo.lastName}` : 'Unassigned'}
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <Button size="sm" variant="outline" onClick={() => handleOpenDetail(c)}>
                          Checklist
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Onboarding Checklist Modal */}
      {selectedCase && (
        <Modal
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          title={`Onboarding Checklist — ${selectedCase.caseNumber}`}
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Header info */}
            <div style={{ padding: '1rem', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f1c3f' }}>
                  {selectedCase.employee?.fullName}
                </h3>
                <div style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '2px' }}>
                  {selectedCase.employee?.employeeNumber} • {selectedCase.employee?.jobTitle} • {selectedCase.employee?.department?.name}
                </div>
              </div>
              <div>{getStageBadge(selectedCase.stage)}</div>
            </div>

            {/* Checklist items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {selectedCase.tasks?.map((task: any) => (
                <div
                  key={task.id}
                  onClick={() => handleToggleTask(task.id, task.isCompleted)}
                  style={{
                    padding: '0.875rem 1rem',
                    borderRadius: '8px',
                    border: `1px solid ${task.isCompleted ? '#bbf7d0' : '#e2e8f0'}`,
                    backgroundColor: task.isCompleted ? '#f0fdf4' : '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {task.isCompleted ? (
                      <CheckCircle2 size={20} color="#16a34a" />
                    ) : (
                      <Circle size={20} color="#94a3b8" />
                    )}
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: task.isCompleted ? '#166534' : '#0f1c3f', textDecoration: task.isCompleted ? 'line-through' : 'none' }}>
                        {task.title}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        {getCategoryIcon(task.category)} {task.category}
                        {task.completedAt && ` • Completed ${new Date(task.completedAt).toLocaleDateString()}`}
                      </div>
                    </div>
                  </div>
                  <Badge variant={task.isCompleted ? 'success' : 'neutral'} size="sm">
                    {task.isCompleted ? 'Done' : 'Pending'}
                  </Badge>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
              <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* New Onboarding Case Modal */}
      <Modal
        isOpen={isNewCaseOpen}
        onClose={() => setIsNewCaseOpen(false)}
        title="Initiate New Employee Onboarding"
      >
        <form onSubmit={handleCreateOnboarding} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              Select Employee *
            </label>
            <select
              value={newForm.employeeId}
              onChange={(e) => setNewForm({ ...newForm, employeeId: e.target.value })}
              required
              style={{
                width: '100%',
                padding: '0.625rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.875rem',
              }}
            >
              <option value="">-- Choose Employee --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} ({emp.employeeNumber}) — {emp.jobTitle}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Target Induction Completion Date"
            type="date"
            value={newForm.targetCompletionDate}
            onChange={(e) => setNewForm({ ...newForm, targetCompletionDate: e.target.value })}
          />

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              HR Induction Notes
            </label>
            <textarea
              value={newForm.notes}
              onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
              placeholder="e.g. Deployment to Westlands site; requires uniform fitting & biometric scanner sync."
              rows={3}
              style={{
                width: '100%',
                padding: '0.625rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="outline" type="button" onClick={() => setIsNewCaseOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? 'Initiating...' : 'Start Onboarding Case'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
