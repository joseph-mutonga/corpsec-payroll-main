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
import { Search, Sliders, History, Plus, Minus, ArrowRight, ShieldCheck } from 'lucide-react';

export default function LeaveBalancesPage() {
  const { success, error: toastError } = useToast();
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [balances, setBalances] = useState<any[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBalancesLoading, setIsBalancesLoading] = useState(false);

  // Adjustment Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [selectedLeaveType, setSelectedLeaveType] = useState<any | null>(null);

  const [adjustFormData, setAdjustFormData] = useState({
    direction: 'ADD',
    days: 1,
    reason: '',
    supportingReference: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (selectedEmployeeId) {
      fetchBalances(selectedEmployeeId);
    }
  }, [selectedEmployeeId]);

  const fetchEmployees = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/employees?pageSize=100&status=ACTIVE');
      const json = await res.json();
      if (json.success && json.data.employees?.length > 0) {
        setEmployees(json.data.employees);
        setSelectedEmployeeId(json.data.employees[0].id);
      }
    } catch (err) {
      toastError('Failed to fetch employees');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBalances = async (empId: string) => {
    try {
      setIsBalancesLoading(true);
      const res = await fetch(`/api/leave/balances?employeeId=${empId}`);
      const json = await res.json();
      if (json.success) setBalances(json.data.balances);
    } catch (err) {
      toastError('Failed to load leave balances');
    } finally {
      setIsBalancesLoading(false);
    }
  };

  const fetchLedger = async (empId: string, leaveTypeId?: string) => {
    try {
      const url = leaveTypeId
        ? `/api/leave/ledger?employeeId=${empId}&leaveTypeId=${leaveTypeId}`
        : `/api/leave/ledger?employeeId=${empId}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) setLedgerEntries(json.data.entries);
    } catch (err) {
      toastError('Failed to fetch leave ledger movements');
    }
  };

  const handleOpenAdjustModal = (balance: any) => {
    setSelectedLeaveType(balance);
    setAdjustFormData({
      direction: 'ADD',
      days: 1,
      reason: '',
      supportingReference: '',
    });
    setIsAdjustModalOpen(true);
  };

  const handleOpenLedgerModal = (balance?: any) => {
    setSelectedLeaveType(balance || null);
    fetchLedger(selectedEmployeeId, balance?.leaveTypeId);
    setIsLedgerModalOpen(true);
  };

  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustFormData.reason || adjustFormData.reason.trim().length < 5) {
      toastError('Detailed reason (minimum 5 characters) is required for manual balance adjustments.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/leave/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          leaveTypeId: selectedLeaveType.leaveTypeId,
          direction: adjustFormData.direction,
          days: parseFloat(adjustFormData.days.toString()),
          reason: adjustFormData.reason,
          supportingReference: adjustFormData.supportingReference,
        }),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      success('Balance adjusted successfully and logged to immutable ledger.');
      setIsAdjustModalOpen(false);
      fetchBalances(selectedEmployeeId);
    } catch (err: any) {
      toastError(err.message || 'Failed to adjust balance.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <Breadcrumb
          items={[
            { label: 'Leave Management', href: '/leave' },
            { label: 'Employee Leave Balances' },
          ]}
        />
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
          Leave Balance Matrix &amp; Ledger
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
          Inspect deterministic balance allocations, accrued days, utilized quotas, and execute audited manual balance adjustments
        </p>
      </div>

      {/* Employee Selector Bar */}
      <Card>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '280px' }}>
            <Select
              label="Select Employee"
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              options={employees.map((e) => ({
                value: e.id,
                label: `${e.fullName} (${e.employeeNumber} — ${e.department?.name || 'General'})`,
              }))}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-end' }}>
            <Button variant="outline" onClick={() => handleOpenLedgerModal()}>
              <History size={16} style={{ marginRight: '0.5rem' }} /> Full Audit Ledger
            </Button>
          </div>
        </div>
      </Card>

      {/* Balances Matrix Table */}
      <Card
        title={selectedEmployee ? `${selectedEmployee.fullName}'s Leave Entitlements` : 'Leave Entitlements'}
        subtitle="Closing Balance = Opening + Accrued + Adjustments + Carry Forward - Used - Expired"
      >
        {isBalancesLoading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" />
          </div>
        ) : balances.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No leave entitlements found for this employee.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Leave Type</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Opening</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Accrued</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Carry-Fwd</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Adjustments</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Used</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Pending</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Expired</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center', backgroundColor: '#f0fdf4' }}>
                    Available Balance
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.leaveTypeId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{b.leaveTypeName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{b.leaveTypeCode} &bull; {b.isPaid ? 'Paid' : 'Unpaid'}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{b.openingBalance}d</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{b.accruedDays}d</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{b.carriedForwardDays}d</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: b.adjustmentDays < 0 ? '#ef4444' : b.adjustmentDays > 0 ? '#10b981' : '#64748b' }}>
                      {b.adjustmentDays > 0 ? `+${b.adjustmentDays}` : b.adjustmentDays}d
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#ef4444', fontWeight: 600 }}>
                      {b.usedDays}d
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#f59e0b' }}>
                      {b.pendingDays}d
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
                      {b.expiredDays}d
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', backgroundColor: '#f0fdf4', fontWeight: 800, fontSize: '1rem', color: '#059669' }}>
                      {b.availableBalance}d
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <Button variant="outline" size="sm" onClick={() => handleOpenAdjustModal(b)}>
                          <Sliders size={14} style={{ marginRight: '0.25rem' }} /> Adjust
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleOpenLedgerModal(b)}>
                          <History size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Manual Balance Adjustment Modal */}
      {selectedLeaveType && (
        <Modal
          isOpen={isAdjustModalOpen}
          onClose={() => setIsAdjustModalOpen(false)}
          title={`Manual Balance Adjustment — ${selectedLeaveType.leaveTypeName}`}
        >
          <form onSubmit={handleAdjustmentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
            <div style={{ padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }}>
              <div><strong>Employee:</strong> {selectedEmployee?.fullName} ({selectedEmployee?.employeeNumber})</div>
              <div><strong>Current Closing Balance:</strong> {selectedLeaveType.closingBalance} Days</div>
              <div><strong>Current Available:</strong> {selectedLeaveType.availableBalance} Days</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <Select
                label="Adjustment Direction"
                value={adjustFormData.direction}
                onChange={(e) => setAdjustFormData({ ...adjustFormData, direction: e.target.value })}
                options={[
                  { value: 'ADD', label: 'Credit (+) Add Days' },
                  { value: 'DEDUCT', label: 'Debit (-) Deduct Days' },
                ]}
              />
              <Input
                label="Number of Days"
                type="number"
                step="0.5"
                min="0.5"
                value={adjustFormData.days}
                onChange={(e) => setAdjustFormData({ ...adjustFormData, days: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>

            <Input
              label="Supporting Reference (Optional)"
              placeholder="e.g. HR-MEMO-2026-042 or Board Approval"
              value={adjustFormData.supportingReference}
              onChange={(e) => setAdjustFormData({ ...adjustFormData, supportingReference: e.target.value })}
            />

            <div>
              <label style={{ display: 'block', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                Reason for Adjustment (Mandatory Audit Requirement)
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
                placeholder="Explain the operational or statutory justification for manually adjusting this employee balance..."
                value={adjustFormData.reason}
                onChange={(e) => setAdjustFormData({ ...adjustFormData, reason: e.target.value })}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button variant="outline" type="button" onClick={() => setIsAdjustModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Recording...' : 'Commit Adjustment'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Ledger History Modal */}
      <Modal
        isOpen={isLedgerModalOpen}
        onClose={() => setIsLedgerModalOpen(false)}
        title={`Immutable Leave Balance Ledger — ${selectedEmployee?.fullName}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '65vh', overflowY: 'auto' }}>
          {ledgerEntries.length === 0 ? (
            <p style={{ color: '#94a3b8', fontStyle: 'italic', padding: '1rem 0' }}>
              No ledger transactions recorded yet.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0.5rem' }}>Date</th>
                  <th style={{ padding: '0.5rem' }}>Type</th>
                  <th style={{ padding: '0.5rem' }}>Category</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Days</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Prev &rarr; New</th>
                  <th style={{ padding: '0.5rem' }}>Reference &amp; Reason</th>
                </tr>
              </thead>
              <tbody>
                {ledgerEntries.map((e) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.5rem', color: '#64748b' }}>
                      {new Date(e.date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <Badge variant="neutral" size="sm">{e.transactionType}</Badge>
                    </td>
                    <td style={{ padding: '0.5rem', fontWeight: 600 }}>{e.leaveType.name}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700, color: e.days > 0 ? '#10b981' : '#ef4444' }}>
                      {e.days > 0 ? `+${e.days}` : e.days}d
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>
                      {e.previousBalance} &rarr; {e.newBalance}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{e.reference || '—'}</div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{e.reason || '—'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <Button variant="primary" onClick={() => setIsLedgerModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
