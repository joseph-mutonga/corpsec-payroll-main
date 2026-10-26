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
  UserMinus,
  CheckCircle2,
  Circle,
  Clock,
  ArrowRight,
  Shield,
  FileText,
  DollarSign,
  Briefcase,
  AlertOctagon,
  Calculator,
} from 'lucide-react';

export default function OffboardingHubPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ total: 0, inProgress: 0, completed: 0 });
  const [stageFilter, setStageFilter] = useState('ALL');
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [settlementData, setSettlementData] = useState<any>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSettlementOpen, setIsSettlementOpen] = useState(false);
  const [isNewCaseOpen, setIsNewCaseOpen] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [newForm, setNewForm] = useState({
    employeeId: '',
    exitType: 'RESIGNATION',
    noticeDate: '',
    exitDate: '',
    reason: '',
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
      const url = `/api/hr/offboarding?stage=${stageFilter}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setCases(json.data.cases || []);
        setStats(json.data.stats || { total: 0, inProgress: 0, completed: 0 });
      }
    } catch (err) {
      console.error('Error fetching offboarding cases:', err);
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
      const res = await fetch(`/api/hr/offboarding/${c.id}`);
      const json = await res.json();
      if (json.success) {
        setSelectedCase(json.data);
        setIsDetailOpen(true);
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Failed to load offboarding case detail' });
    }
  };

  const handleOpenSettlement = async (c: any) => {
    try {
      const res = await fetch(`/api/hr/offboarding/${c.id}/settlement`);
      const json = await res.json();
      if (json.success) {
        setSettlementData(json.data);
        setSelectedCase(c);
        setIsSettlementOpen(true);
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Failed to calculate final settlement' });
    }
  };

  const handleToggleTask = async (taskId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/hr/offboarding/${selectedCase.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          isCompleted: !currentStatus,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast({ type: 'success', title: 'Clearance task updated' });
        setSelectedCase((prev: any) => ({
          ...prev,
          stage: json.data.offboardingCase.stage,
          status: json.data.offboardingCase.status,
          tasks: json.data.offboardingCase.tasks,
        }));
        fetchCases();
      } else {
        showToast({ type: 'error', title: json.error || 'Failed to update task' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Network error updating clearance task' });
    }
  };

  const handleCompleteExit = async () => {
    if (!confirm('Are you sure you want to mark clearance complete and formally exit this employee?')) return;
    try {
      const res = await fetch(`/api/hr/offboarding/${selectedCase.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'COMPLETE' }),
      });
      const json = await res.json();
      if (json.success) {
        showToast({ type: 'success', title: 'Employee offboarding clearance completed successfully' });
        setIsDetailOpen(false);
        fetchCases();
      } else {
        showToast({ type: 'error', title: json.error || 'Failed to complete exit' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Network error completing exit' });
    }
  };

  const handleCreateOffboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.employeeId || !newForm.exitDate) {
      showToast({ type: 'error', title: 'Please select employee and effective exit date' });
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch('/api/hr/offboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      });
      const json = await res.json();
      if (json.success) {
        showToast({ type: 'success', title: 'Offboarding exit case initiated successfully' });
        setIsNewCaseOpen(false);
        setNewForm({ employeeId: '', exitType: 'RESIGNATION', noticeDate: '', exitDate: '', reason: '', notes: '' });
        fetchCases();
      } else {
        showToast({ type: 'error', title: json.error || 'Failed to initiate offboarding' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Network error initiating offboarding' });
    } finally {
      setSubmitting(false);
    }
  };

  const getStageBadge = (stage: string) => {
    switch (stage) {
      case 'INITIATED':
        return <Badge variant="neutral">1. Initiated</Badge>;
      case 'NOTICE':
        return <Badge variant="warning">2. Notice Period</Badge>;
      case 'CLEARANCE':
        return <Badge variant="info">3. Clearance</Badge>;
      case 'FINAL_PAYROLL':
        return <Badge variant="gold">4. Final Payroll</Badge>;
      case 'EXITED':
        return <Badge variant="danger">5. Exited</Badge>;
      default:
        return <Badge variant="neutral">{stage}</Badge>;
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Breadcrumb items={[{ label: 'Human Resources', href: '/hr' }, { label: 'Offboarding & Clearance' }]} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserMinus size={28} color="#0f1c3f" />
            Employee Offboarding, Clearance & Final Settlement
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
            Controlled exit workflow, asset recovery, loan deductions, leave encashment, and final settlement audit.
          </p>
        </div>

        <Button variant="danger" onClick={() => setIsNewCaseOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <UserMinus size={16} /> Initiate Exit Case
        </Button>
      </div>

      {/* Counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div style={{ padding: '1rem', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total Exit Cases</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', marginTop: '0.25rem' }}>{stats.total}</div>
        </div>
        <div style={{ padding: '1rem', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>In Notice / Clearance</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ea580c', marginTop: '0.25rem' }}>{stats.inProgress}</div>
        </div>
        <div style={{ padding: '1rem', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Completed Exits</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#475569', marginTop: '0.25rem' }}>{stats.completed}</div>
        </div>
      </div>

      {/* Stage Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {['ALL', 'INITIATED', 'NOTICE', 'CLEARANCE', 'FINAL_PAYROLL', 'EXITED'].map((st) => (
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
            No offboarding cases found matching the selected filter.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Case Number</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Employee</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Exit Type</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Effective Date</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Stage</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Clearance Tasks</th>
                  <th style={{ padding: '0.875rem 1rem', color: '#475569', fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => {
                  const completedTasks = c.tasks?.filter((t: any) => t.isCompleted).length || 0;
                  const totalTasks = c.tasks?.length || 8;
                  const percent = Math.round((completedTasks / totalTasks) * 100);

                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.875rem 1rem', fontWeight: 700, color: '#0f1c3f' }}>{c.caseNumber}</td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#0f1c3f' }}>{c.employee?.fullName}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.employee?.employeeNumber}</div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <Badge variant="neutral" size="sm">{c.exitType}</Badge>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', color: '#475569' }}>
                        {new Date(c.exitDate).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>{getStageBadge(c.stage)}</td>
                      <td style={{ padding: '0.875rem 1rem', minWidth: '150px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                          <span>{completedTasks} / {totalTasks} Tasks</span>
                          <span>{percent}%</span>
                        </div>
                        <div style={{ height: '6px', width: '100%', backgroundColor: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${percent}%`, backgroundColor: percent === 100 ? '#16a34a' : '#ea580c', borderRadius: '3px' }} />
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', display: 'flex', gap: '0.5rem' }}>
                        <Button size="sm" variant="outline" onClick={() => handleOpenDetail(c)}>
                          Clearance
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => handleOpenSettlement(c)}>
                          Settlement
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

      {/* Clearance Checklist Modal */}
      {selectedCase && (
        <Modal
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          title={`Clearance Checklist — ${selectedCase.caseNumber}`}
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ padding: '1rem', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f1c3f' }}>
                  {selectedCase.employee?.fullName}
                </h3>
                <div style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '2px' }}>
                  {selectedCase.employee?.employeeNumber} • Exit Type: {selectedCase.exitType} • Effective: {new Date(selectedCase.exitDate).toLocaleDateString()}
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
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                        Category: {task.category}
                        {task.completedAt && ` • Completed on ${new Date(task.completedAt).toLocaleDateString()}`}
                      </div>
                    </div>
                  </div>
                  <Badge variant={task.isCompleted ? 'success' : 'neutral'} size="sm">
                    {task.isCompleted ? 'Cleared' : 'Pending'}
                  </Badge>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
              <div>
                {selectedCase.stage !== 'EXITED' && (
                  <Button variant="danger" onClick={handleCompleteExit}>
                    Approve Clearance & Mark Exited
                  </Button>
                )}
              </div>
              <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Final Settlement Calculation Modal */}
      {settlementData && (
        <Modal
          isOpen={isSettlementOpen}
          onClose={() => setIsSettlementOpen(false)}
          title={`Final Settlement Calculation — ${settlementData.employeeName}`}
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ padding: '1rem', borderRadius: '8px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.8125rem', color: '#166534', fontWeight: 700 }}>NET PAYABLE FINAL SETTLEMENT</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#15803d', marginTop: '4px' }}>
                  KES {settlementData.netPayableSettlement?.toLocaleString()}
                </div>
              </div>
              <Badge variant="success" size="md">Ready for Final Run</Badge>
            </div>

            {/* Breakdown matrix */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* Earnings column */}
              <div style={{ padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: 700, color: '#0f1c3f' }}>Settlement Earnings</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
                  <span>Unpaid Salary ({settlementData.unpaidDaysWorked} days @ {settlementData.dailyRate}/day):</span>
                  <span style={{ fontWeight: 700 }}>KES {settlementData.unpaidSalaryAmount?.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
                  <span>Leave Encashment ({settlementData.unusedLeaveDays} unused days):</span>
                  <span style={{ fontWeight: 700 }}>KES {settlementData.leaveEncashmentAmount?.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 800, paddingTop: '0.5rem', borderTop: '1px solid #cbd5e1', color: '#0f1c3f' }}>
                  <span>Gross Settlement:</span>
                  <span>KES {settlementData.grossSettlement?.toLocaleString()}</span>
                </div>
              </div>

              {/* Deductions column */}
              <div style={{ padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: 700, color: '#0f1c3f' }}>Outstanding Recoveries</h4>
                {settlementData.outstandingLoans?.length === 0 ? (
                  <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>No outstanding loan balances or recoveries found.</div>
                ) : (
                  settlementData.outstandingLoans.map((l: any) => (
                    <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
                      <span>{l.name}:</span>
                      <span style={{ fontWeight: 700, color: '#dc2626' }}>- KES {l.balance?.toLocaleString()}</span>
                    </div>
                  ))
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 800, paddingTop: '0.5rem', borderTop: '1px solid #cbd5e1', color: '#dc2626' }}>
                  <span>Total Recoveries:</span>
                  <span>- KES {settlementData.totalDeductions?.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
              <Button variant="outline" onClick={() => setIsSettlementOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* New Exit Case Modal */}
      <Modal
        isOpen={isNewCaseOpen}
        onClose={() => setIsNewCaseOpen(false)}
        title="Initiate Employee Exit & Offboarding"
      >
        <form onSubmit={handleCreateOffboarding} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              Select Exiting Employee *
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

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              Exit Type *
            </label>
            <select
              value={newForm.exitType}
              onChange={(e) => setNewForm({ ...newForm, exitType: e.target.value })}
              style={{
                width: '100%',
                padding: '0.625rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.875rem',
              }}
            >
              <option value="RESIGNATION">Resignation (Employee Notice)</option>
              <option value="TERMINATION">Administrative Termination</option>
              <option value="CONTRACT_EXPIRY">Fixed-Term Contract Expiration</option>
              <option value="RETIREMENT">Retirement</option>
              <option value="DISMISSAL">Disciplinary Dismissal</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Input
              label="Notice Received Date"
              type="date"
              value={newForm.noticeDate}
              onChange={(e) => setNewForm({ ...newForm, noticeDate: e.target.value })}
            />
            <Input
              label="Effective Exit Date *"
              type="date"
              required
              value={newForm.exitDate}
              onChange={(e) => setNewForm({ ...newForm, exitDate: e.target.value })}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              Reason for Exit
            </label>
            <Input
              value={newForm.reason}
              onChange={(e) => setNewForm({ ...newForm, reason: e.target.value })}
              placeholder="e.g. Relocating to Nakuru; completed 2-year guard deployment."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="outline" type="button" onClick={() => setIsNewCaseOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" type="submit" disabled={submitting}>
              {submitting ? 'Initiating...' : 'Start Exit Workflow'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
