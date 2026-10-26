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
  CreditCard,
  Plus,
  Search,
  Users,
  ShieldCheck,
  Building2,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { DeductionTypeData, EmployeeDeductionData } from '@/types';
import Link from 'next/link';

export default function DeductionsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'types' | 'assignments'>('types');

  // State
  const [deductionTypes, setDeductionTypes] = useState<DeductionTypeData[]>([]);
  const [assignments, setAssignments] = useState<EmployeeDeductionData[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter
  const [search, setSearch] = useState('');

  // Create Deduction Type Modal
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [typeForm, setTypeForm] = useState({
    code: '',
    name: '',
    description: '',
    calculationMethod: 'FIXED_AMOUNT',
    isStatutory: false,
    isRecurring: true,
    status: 'ACTIVE',
  });
  const [isSubmittingType, setIsSubmittingType] = useState(false);

  // Assign Deduction Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({
    employeeId: '',
    deductionTypeId: '',
    amount: '',
    totalTargetAmount: '',
    currentBalance: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: '',
    isRecurring: true,
    notes: '',
  });
  const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);

  useEffect(() => {
    fetchDeductionData();
    fetchEmployeesList();
  }, []);

  const fetchDeductionData = async () => {
    try {
      setLoading(true);
      const [tRes, aRes] = await Promise.all([
        fetch('/api/payroll/deductions/types'),
        fetch('/api/payroll/deductions/assignments'),
      ]);
      if (tRes.ok) {
        const d = await tRes.json();
        if (d.success) setDeductionTypes(d.data || []);
      }
      if (aRes.ok) {
        const d = await aRes.json();
        if (d.success) setAssignments(d.data || []);
      }
    } catch (err) {
      console.error('Error fetching deductions data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployeesList = async () => {
    try {
      const res = await fetch('/api/employees?pageSize=100');
      const data = await res.json();
      if (data.success) setEmployees(data.data.employees || []);
    } catch (err) {
      console.error('Error loading employees:', err);
    }
  };

  const handleCreateType = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmittingType(true);
      const res = await fetch('/api/payroll/deductions/types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(typeForm),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Success', message: 'Deduction type created successfully', type: 'success' });
        setIsTypeModalOpen(false);
        fetchDeductionData();
      } else {
        toast({ title: 'Error', message: data.error?.message || 'Failed to create deduction type', type: 'error' });
      }
    } catch (err) {
      toast({ title: 'Error', message: 'An unexpected error occurred', type: 'error' });
    } finally {
      setIsSubmittingType(false);
    }
  };

  const handleAssignDeduction = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmittingAssign(true);
      const res = await fetch('/api/payroll/deductions/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...assignForm,
          amount: parseFloat(assignForm.amount || '0'),
          totalTargetAmount: assignForm.totalTargetAmount ? parseFloat(assignForm.totalTargetAmount) : null,
          currentBalance: assignForm.currentBalance ? parseFloat(assignForm.currentBalance) : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Success', message: 'Deduction assigned to employee successfully', type: 'success' });
        setIsAssignModalOpen(false);
        fetchDeductionData();
      } else {
        toast({ title: 'Error', message: data.error?.message || 'Failed to assign deduction', type: 'error' });
      }
    } catch (err) {
      toast({ title: 'Error', message: 'An unexpected error occurred', type: 'error' });
    } finally {
      setIsSubmittingAssign(false);
    }
  };

  const filteredTypes = deductionTypes.filter(
    (t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.code.toLowerCase().includes(search.toLowerCase())
  );

  const filteredAssignments = assignments.filter(
    (a) =>
      a.employee?.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      a.employee?.employeeNumber?.toLowerCase().includes(search.toLowerCase()) ||
      a.deductionType?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'Payroll Management', href: '/payroll' },
          { label: 'Deductions & Recoveries' },
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
            Deductions &amp; Recoveries Management
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Configure voluntary contributions, SACCO savings, welfare schemes, and salary advance balance-based recoveries.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.625rem' }}>
          <Button variant="outline" size="sm" onClick={() => setIsTypeModalOpen(true)} leftIcon={<Plus size={14} />}>
            New Deduction Type
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsAssignModalOpen(true)} leftIcon={<Users size={14} />}>
            Assign To Employee
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0' }}>
        <button
          onClick={() => setActiveTab('types')}
          style={{
            padding: '0.625rem 1.25rem',
            border: 'none',
            borderBottom: activeTab === 'types' ? '2px solid #2563eb' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'types' ? '#2563eb' : '#64748b',
            fontWeight: activeTab === 'types' ? 700 : 500,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Deduction Types Catalog ({deductionTypes.length})
        </button>
        <button
          onClick={() => setActiveTab('assignments')}
          style={{
            padding: '0.625rem 1.25rem',
            border: 'none',
            borderBottom: activeTab === 'assignments' ? '2px solid #2563eb' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'assignments' ? '#2563eb' : '#64748b',
            fontWeight: activeTab === 'assignments' ? 700 : 500,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Employee Deduction Assignments ({assignments.length})
        </button>
      </div>

      {/* Search Bar */}
      <div style={{ maxWidth: '320px', marginBottom: '1.25rem' }}>
        <Input
          placeholder="Search deductions or personnel..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search size={14} />}
        />
      </div>

      {/* Tab 1: Types Catalog */}
      {activeTab === 'types' && (
        <Card noPadding>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <Spinner message="Loading deduction types..." />
            </div>
          ) : filteredTypes.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              No deduction types found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', backgroundColor: '#f8fafc' }}>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Code</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Deduction Name</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Method</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Classification</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Assigned Staff</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTypes.map((t) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.875rem 1.25rem', fontFamily: 'monospace', fontWeight: 700, color: '#0f1c3f' }}>
                        {t.code}
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <strong style={{ display: 'block', color: '#0f1c3f' }}>{t.name}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{t.description}</span>
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <Badge variant="neutral" size="sm">
                          {t.calculationMethod.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <Badge variant={t.isStatutory ? 'danger' : 'info'} size="sm">
                          {t.isStatutory ? 'Statutory Mandate' : 'Non-Statutory Voluntary'}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem', color: '#334155' }}>
                        <strong>{t._count?.employeeDeductions ?? 0}</strong> staff
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <Badge variant={t.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm">
                          {t.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Tab 2: Assignments */}
      {activeTab === 'assignments' && (
        <Card noPadding>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <Spinner message="Loading employee deductions..." />
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              No employee deduction assignments found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', backgroundColor: '#f8fafc' }}>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Employee</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Deduction Type</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Monthly Amount</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Outstanding Balance</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Effective Date</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssignments.map((a) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <Link href={`/hr/employees/${a.employeeId}`} style={{ fontWeight: 700, color: '#0f1c3f', textDecoration: 'none' }}>
                          {a.employee?.fullName}
                        </Link>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                          {a.employee?.employeeNumber}
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <span style={{ fontWeight: 600, color: '#334155' }}>{a.deductionType?.name}</span>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                          {a.deductionType?.code}
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem', fontWeight: 700, color: '#dc2626' }}>
                        KES {a.amount.toLocaleString()} / mo
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem', color: '#475569' }}>
                        {a.currentBalance !== null && a.currentBalance !== undefined ? (
                          <span>KES {a.currentBalance.toLocaleString()}</span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Recurring Fixed</span>
                        )}
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem', color: '#475569' }}>
                        {new Date(a.effectiveFrom).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <Badge variant={a.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm">
                          {a.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Modal: Create Deduction Type */}
      <Modal
        isOpen={isTypeModalOpen}
        onClose={() => setIsTypeModalOpen(false)}
        title="Create New Deduction Type"
        size="md"
      >
        <form onSubmit={handleCreateType} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1rem' }}>
            <Input
              label="Deduction Code"
              value={typeForm.code}
              onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value })}
              placeholder="e.g. DED-WELFARE"
              required
            />
            <Input
              label="Deduction Name"
              value={typeForm.name}
              onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
              placeholder="e.g. Staff Welfare Scheme"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Select
              label="Calculation Method"
              value={typeForm.calculationMethod}
              onChange={(e) => setTypeForm({ ...typeForm, calculationMethod: e.target.value })}
              options={[
                { value: 'FIXED_AMOUNT', label: 'Fixed Amount (KES)' },
                { value: 'PERCENTAGE_OF_BASIC', label: 'Percentage of Basic Salary' },
                { value: 'BALANCE_BASED', label: 'Balance-Based (Loan/Advance Recovery)' },
              ]}
            />

            <Select
              label="Classification"
              value={typeForm.isStatutory ? 'true' : 'false'}
              onChange={(e) => setTypeForm({ ...typeForm, isStatutory: e.target.value === 'true' })}
              options={[
                { value: 'false', label: 'Voluntary / Internal Deduction' },
                { value: 'true', label: 'Statutory Mandate' },
              ]}
            />
          </div>

          <Input
            label="Description & Mandate"
            value={typeForm.description}
            onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
            placeholder="e.g. Staff monthly emergency welfare fund"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="ghost" type="button" onClick={() => setIsTypeModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmittingType}>
              Save Deduction Type
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Assign Deduction */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="Assign Deduction to Employee"
        size="md"
      >
        <form onSubmit={handleAssignDeduction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Select
            label="Select Employee"
            value={assignForm.employeeId}
            onChange={(e) => setAssignForm({ ...assignForm, employeeId: e.target.value })}
            options={[
              { value: '', label: '-- Select Personnel --' },
              ...employees.map((emp) => ({
                value: emp.id,
                label: `${emp.fullName} (${emp.employeeNumber} - ${emp.jobTitle})`,
              })),
            ]}
            required
          />

          <Select
            label="Deduction Type"
            value={assignForm.deductionTypeId}
            onChange={(e) => setAssignForm({ ...assignForm, deductionTypeId: e.target.value })}
            options={[
              { value: '', label: '-- Select Deduction --' },
              ...deductionTypes.map((t) => ({
                value: t.id,
                label: `${t.name} (${t.code})`,
              })),
            ]}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Input
              label="Monthly Instalment (KES)"
              type="number"
              value={assignForm.amount}
              onChange={(e) => setAssignForm({ ...assignForm, amount: e.target.value })}
              placeholder="e.g. 2000"
              required
            />
            <Input
              label="Effective From Date"
              type="date"
              value={assignForm.effectiveFrom}
              onChange={(e) => setAssignForm({ ...assignForm, effectiveFrom: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Input
              label="Total Principal / Target (Optional)"
              type="number"
              value={assignForm.totalTargetAmount}
              onChange={(e) => setAssignForm({ ...assignForm, totalTargetAmount: e.target.value, currentBalance: e.target.value })}
              placeholder="e.g. 10000 for 5-month advance"
            />
            <Input
              label="Remaining Balance (KES)"
              type="number"
              value={assignForm.currentBalance}
              onChange={(e) => setAssignForm({ ...assignForm, currentBalance: e.target.value })}
              placeholder="e.g. 10000"
            />
          </div>

          <Input
            label="Justification / Ref Notes"
            value={assignForm.notes}
            onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
            placeholder="e.g. Approved emergency advance request #ADV-889"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="ghost" type="button" onClick={() => setIsAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmittingAssign}>
              Assign Deduction
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
