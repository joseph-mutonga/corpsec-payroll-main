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
  Layers,
  Plus,
  Search,
  Filter,
  Users,
  Building2,
  DollarSign,
  Edit2,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { AllowanceTypeData, EmployeeAllowanceData } from '@/types';
import Link from 'next/link';

export default function AllowancesPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'types' | 'assignments'>('types');

  // State
  const [allowanceTypes, setAllowanceTypes] = useState<AllowanceTypeData[]>([]);
  const [assignments, setAssignments] = useState<EmployeeAllowanceData[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter
  const [search, setSearch] = useState('');

  // Create Allowance Type Modal
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [typeForm, setTypeForm] = useState({
    code: '',
    name: '',
    description: '',
    calculationMethod: 'FIXED_AMOUNT',
    defaultAmount: '',
    percentageValue: '',
    isTaxable: true,
    isPensionable: false,
    isRecurring: true,
    status: 'ACTIVE',
  });
  const [isSubmittingType, setIsSubmittingType] = useState(false);

  // Assign Allowance Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({
    employeeId: '',
    allowanceTypeId: '',
    amount: '',
    calculationMethod: 'FIXED_AMOUNT',
    percentageValue: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: '',
    isRecurring: true,
    notes: '',
  });
  const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);

  useEffect(() => {
    fetchAllowanceData();
    fetchEmployeesList();
  }, []);

  const fetchAllowanceData = async () => {
    try {
      setLoading(true);
      const [tRes, aRes] = await Promise.all([
        fetch('/api/payroll/allowances/types'),
        fetch('/api/payroll/allowances/assignments'),
      ]);
      if (tRes.ok) {
        const d = await tRes.json();
        if (d.success) setAllowanceTypes(d.data || []);
      }
      if (aRes.ok) {
        const d = await aRes.json();
        if (d.success) setAssignments(d.data || []);
      }
    } catch (err) {
      console.error('Error fetching allowances data:', err);
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
      const res = await fetch('/api/payroll/allowances/types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...typeForm,
          defaultAmount: parseFloat(typeForm.defaultAmount || '0'),
          percentageValue: typeForm.percentageValue ? parseFloat(typeForm.percentageValue) : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Success', message: 'Allowance type created successfully', type: 'success' });
        setIsTypeModalOpen(false);
        fetchAllowanceData();
      } else {
        toast({ title: 'Error', message: data.error?.message || 'Failed to create allowance type', type: 'error' });
      }
    } catch (err) {
      toast({ title: 'Error', message: 'An unexpected error occurred', type: 'error' });
    } finally {
      setIsSubmittingType(false);
    }
  };

  const handleAssignAllowance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmittingAssign(true);
      const res = await fetch('/api/payroll/allowances/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...assignForm,
          amount: parseFloat(assignForm.amount || '0'),
          percentageValue: assignForm.percentageValue ? parseFloat(assignForm.percentageValue) : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Success', message: 'Allowance assigned to employee successfully', type: 'success' });
        setIsAssignModalOpen(false);
        fetchAllowanceData();
      } else {
        toast({ title: 'Error', message: data.error?.message || 'Failed to assign allowance', type: 'error' });
      }
    } catch (err) {
      toast({ title: 'Error', message: 'An unexpected error occurred', type: 'error' });
    } finally {
      setIsSubmittingAssign(false);
    }
  };

  const onSelectAllowanceTypeInAssign = (typeId: string) => {
    const selected = allowanceTypes.find((t) => t.id === typeId);
    if (selected) {
      setAssignForm({
        ...assignForm,
        allowanceTypeId: typeId,
        calculationMethod: selected.calculationMethod,
        amount: selected.defaultAmount ? String(selected.defaultAmount) : '',
        percentageValue: selected.percentageValue ? String(selected.percentageValue) : '',
      });
    } else {
      setAssignForm({ ...assignForm, allowanceTypeId: typeId });
    }
  };

  const filteredTypes = allowanceTypes.filter(
    (t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.code.toLowerCase().includes(search.toLowerCase())
  );

  const filteredAssignments = assignments.filter(
    (a) =>
      a.employee?.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      a.employee?.employeeNumber?.toLowerCase().includes(search.toLowerCase()) ||
      a.allowanceType?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'Payroll Management', href: '/payroll' },
          { label: 'Allowances' },
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
            Allowances Management &amp; Benefits
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Configure standard earnings, tactical hazard allowances, nocturnal guarding subsidies, and employee benefit assignments.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.625rem' }}>
          <Button variant="outline" size="sm" onClick={() => setIsTypeModalOpen(true)} leftIcon={<Plus size={14} />}>
            New Allowance Type
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
          Allowance Types Catalog ({allowanceTypes.length})
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
          Employee Allowance Assignments ({assignments.length})
        </button>
      </div>

      {/* Search Input */}
      <div style={{ maxWidth: '320px', marginBottom: '1.25rem' }}>
        <Input
          placeholder="Search allowances or personnel..."
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
              <Spinner message="Loading allowance types..." />
            </div>
          ) : filteredTypes.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              No allowance types found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', backgroundColor: '#f8fafc' }}>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Code</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Allowance Name</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Calculation Method</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Default Rate / Value</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Taxable</th>
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
                      <td style={{ padding: '0.875rem 1.25rem', fontWeight: 700, color: '#0f172a' }}>
                        {t.calculationMethod === 'PERCENTAGE_OF_BASIC'
                          ? `${t.percentageValue}% of Basic`
                          : `KES ${(t.defaultAmount || 0).toLocaleString()}`}
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <Badge variant={t.isTaxable ? 'warning' : 'success'} size="sm">
                          {t.isTaxable ? 'Taxable (PAYE)' : 'Non-Taxable'}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem', color: '#334155' }}>
                        <strong>{t._count?.employeeAllowances ?? 0}</strong> staff
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
              <Spinner message="Loading employee allowances..." />
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              No employee allowance assignments found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', backgroundColor: '#f8fafc' }}>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Employee</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Allowance Type</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Amount / Rate</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Effective Date</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>Recurring</th>
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
                        <span style={{ fontWeight: 600, color: '#334155' }}>{a.allowanceType?.name}</span>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                          {a.allowanceType?.code}
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem', fontWeight: 700, color: '#059669' }}>
                        {a.calculationMethod === 'PERCENTAGE_OF_BASIC'
                          ? `${a.percentageValue}% (Est: KES ${a.amount.toLocaleString()})`
                          : `KES ${a.amount.toLocaleString()}`}
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem', color: '#475569' }}>
                        {new Date(a.effectiveFrom).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <Badge variant={a.isRecurring ? 'info' : 'neutral'} size="sm">
                          {a.isRecurring ? 'Monthly Recurring' : 'One-Off'}
                        </Badge>
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

      {/* Modal: Create Allowance Type */}
      <Modal
        isOpen={isTypeModalOpen}
        onClose={() => setIsTypeModalOpen(false)}
        title="Create New Allowance Type"
        size="md"
      >
        <form onSubmit={handleCreateType} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1rem' }}>
            <Input
              label="Allowance Code"
              value={typeForm.code}
              onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value })}
              placeholder="e.g. ALW-RESP"
              required
            />
            <Input
              label="Allowance Name"
              value={typeForm.name}
              onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
              placeholder="e.g. Commander Responsibility"
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
                { value: 'MANUAL', label: 'Manual Input' },
              ]}
            />

            {typeForm.calculationMethod === 'PERCENTAGE_OF_BASIC' ? (
              <Input
                label="Percentage (%)"
                type="number"
                value={typeForm.percentageValue}
                onChange={(e) => setTypeForm({ ...typeForm, percentageValue: e.target.value })}
                placeholder="e.g. 15.0"
                required
              />
            ) : (
              <Input
                label="Default Amount (KES)"
                type="number"
                value={typeForm.defaultAmount}
                onChange={(e) => setTypeForm({ ...typeForm, defaultAmount: e.target.value })}
                placeholder="e.g. 3000"
              />
            )}
          </div>

          <Input
            label="Description & Mandate"
            value={typeForm.description}
            onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
            placeholder="e.g. Duty compensation for shift leads"
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Select
              label="Taxability (PAYE)"
              value={typeForm.isTaxable ? 'true' : 'false'}
              onChange={(e) => setTypeForm({ ...typeForm, isTaxable: e.target.value === 'true' })}
              options={[
                { value: 'true', label: 'Taxable Benefit' },
                { value: 'false', label: 'Non-Taxable Subsidy' },
              ]}
            />
            <Select
              label="Frequency"
              value={typeForm.isRecurring ? 'true' : 'false'}
              onChange={(e) => setTypeForm({ ...typeForm, isRecurring: e.target.value === 'true' })}
              options={[
                { value: 'true', label: 'Recurring Monthly' },
                { value: 'false', label: 'One-Off' },
              ]}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="ghost" type="button" onClick={() => setIsTypeModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmittingType}>
              Save Allowance Type
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Assign Allowance */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="Assign Allowance to Employee"
        size="md"
      >
        <form onSubmit={handleAssignAllowance} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
            label="Allowance Type"
            value={assignForm.allowanceTypeId}
            onChange={(e) => onSelectAllowanceTypeInAssign(e.target.value)}
            options={[
              { value: '', label: '-- Select Allowance --' },
              ...allowanceTypes.map((t) => ({
                value: t.id,
                label: `${t.name} (${t.code})`,
              })),
            ]}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Input
              label="Allowance Amount (KES)"
              type="number"
              value={assignForm.amount}
              onChange={(e) => setAssignForm({ ...assignForm, amount: e.target.value })}
              placeholder="e.g. 2500"
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

          <Input
            label="Notes / Reason"
            value={assignForm.notes}
            onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
            placeholder="e.g. Guard deployment to high-risk embassy sector"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="ghost" type="button" onClick={() => setIsAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmittingAssign}>
              Assign Allowance
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
