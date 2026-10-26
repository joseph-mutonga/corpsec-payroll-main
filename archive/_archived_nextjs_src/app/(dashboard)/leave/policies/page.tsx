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
import { Plus, Edit2, Trash2, Shield, Layers, Calendar } from 'lucide-react';

export default function LeavePoliciesPage() {
  const { success, error: toastError } = useToast();
  const [policies, setPolicies] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<any | null>(null);

  const [formData, setFormData] = useState({
    policyCode: '',
    policyName: '',
    leaveTypeId: '',
    entitledDays: 21,
    accrualMethod: 'ANNUAL_ALLOCATION',
    accrualFrequency: 'YEARLY',
    allowCarryForward: true,
    maxCarryForwardDays: 5,
    carryForwardExpiryMonths: 3,
    minServiceDays: 90,
    prorationRule: 'PRORATED_BY_MONTH',
    excludeWeekends: true,
    excludeHolidays: true,
    allowAdvanceLeave: false,
    minRequestDays: 0.5,
    maxConsecutiveDays: '',
    noticePeriodDays: 0,
    probationEligible: false,
    approvalHierarchy: 'MANAGER_HR',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchPolicies();
    fetchLeaveTypes();
  }, []);

  const fetchPolicies = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/leave/policies');
      const json = await res.json();
      if (json.success) setPolicies(json.data.policies);
    } catch (err) {
      toastError('Failed to load leave policies');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLeaveTypes = async () => {
    try {
      const res = await fetch('/api/leave/types?status=ACTIVE');
      const json = await res.json();
      if (json.success) setLeaveTypes(json.data.leaveTypes);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenModal = (policyToEdit?: any) => {
    if (policyToEdit) {
      setEditingPolicy(policyToEdit);
      setFormData({
        policyCode: policyToEdit.policyCode,
        policyName: policyToEdit.policyName,
        leaveTypeId: policyToEdit.leaveTypeId,
        entitledDays: policyToEdit.entitledDays,
        accrualMethod: policyToEdit.accrualMethod,
        accrualFrequency: policyToEdit.accrualFrequency,
        allowCarryForward: policyToEdit.allowCarryForward,
        maxCarryForwardDays: policyToEdit.maxCarryForwardDays,
        carryForwardExpiryMonths: policyToEdit.carryForwardExpiryMonths,
        minServiceDays: policyToEdit.minServiceDays,
        prorationRule: policyToEdit.prorationRule,
        excludeWeekends: policyToEdit.excludeWeekends,
        excludeHolidays: policyToEdit.excludeHolidays,
        allowAdvanceLeave: policyToEdit.allowAdvanceLeave,
        minRequestDays: policyToEdit.minRequestDays || 0.5,
        maxConsecutiveDays: policyToEdit.maxConsecutiveDays ? policyToEdit.maxConsecutiveDays.toString() : '',
        noticePeriodDays: policyToEdit.noticePeriodDays || 0,
        probationEligible: policyToEdit.probationEligible,
        approvalHierarchy: policyToEdit.approvalHierarchy || 'MANAGER_HR',
      });
    } else {
      setEditingPolicy(null);
      setFormData({
        policyCode: '',
        policyName: '',
        leaveTypeId: leaveTypes.length > 0 ? leaveTypes[0].id : '',
        entitledDays: 21,
        accrualMethod: 'ANNUAL_ALLOCATION',
        accrualFrequency: 'YEARLY',
        allowCarryForward: true,
        maxCarryForwardDays: 5,
        carryForwardExpiryMonths: 3,
        minServiceDays: 90,
        prorationRule: 'PRORATED_BY_MONTH',
        excludeWeekends: true,
        excludeHolidays: true,
        allowAdvanceLeave: false,
        minRequestDays: 0.5,
        maxConsecutiveDays: '',
        noticePeriodDays: 0,
        probationEligible: false,
        approvalHierarchy: 'MANAGER_HR',
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const payload = {
        ...formData,
        entitledDays: parseFloat(formData.entitledDays.toString()),
        maxCarryForwardDays: parseFloat(formData.maxCarryForwardDays.toString()),
        carryForwardExpiryMonths: parseInt(formData.carryForwardExpiryMonths.toString(), 10),
        minServiceDays: parseInt(formData.minServiceDays.toString(), 10),
        minRequestDays: parseFloat(formData.minRequestDays.toString()),
        maxConsecutiveDays: formData.maxConsecutiveDays ? parseFloat(formData.maxConsecutiveDays) : undefined,
        noticePeriodDays: parseInt(formData.noticePeriodDays.toString(), 10) || 0,
      };

      const url = editingPolicy ? `/api/leave/policies/${editingPolicy.id}` : '/api/leave/policies';
      const method = editingPolicy ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      success(editingPolicy ? 'Leave policy updated' : 'Leave policy created');
      setIsModalOpen(false);
      fetchPolicies();
    } catch (err: any) {
      toastError(err.message || 'Error saving policy');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this leave policy?')) return;
    try {
      const res = await fetch(`/api/leave/policies/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      success('Leave policy removed');
      fetchPolicies();
    } catch (err: any) {
      toastError(err.message || 'Failed to delete policy');
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
              { label: 'Leave Policies' },
            ]}
          />
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
            Leave Policy Administration
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
            Define eligibility rules, accrual methodologies, carry-forward caps, probation exemptions, and approval hierarchies
          </p>
        </div>

        <Button variant="primary" onClick={() => handleOpenModal()}>
          <Plus size={16} style={{ marginRight: '0.5rem' }} /> Add Leave Policy
        </Button>
      </div>

      {/* Policies Table Card */}
      <Card>
        {isLoading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" />
          </div>
        ) : policies.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No leave policies configured. Click &quot;Add Leave Policy&quot; to establish leave governance.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Code</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Policy Name</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Leave Category</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Allocation</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Accrual Method</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Carry-Fwd Cap</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Probation Allowed</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Approval Chain</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#3b82f6' }}>
                      {p.policyCode}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f172a' }}>
                      {p.policyName}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant="neutral" size="sm">
                        {p.leaveType.name}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>
                      {p.entitledDays}d
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#64748b' }}>
                      {p.accrualMethod.replace('_', ' ')}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#64748b' }}>
                      {p.allowCarryForward ? `${p.maxCarryForwardDays}d (Exp ${p.carryForwardExpiryMonths}m)` : 'Disabled'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <Badge variant={p.probationEligible ? 'success' : 'neutral'} size="sm">
                        {p.probationEligible ? 'Yes' : 'No'}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <Badge variant="info" size="sm">
                        {p.approvalHierarchy || 'MANAGER_HR'}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <Button variant="outline" size="sm" onClick={() => handleOpenModal(p)}>
                          <Edit2 size={14} />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(p.id)}>
                          <Trash2 size={14} color="#ef4444" />
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

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPolicy ? 'Edit Leave Policy' : 'Create Leave Policy'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
            <Input
              label="Policy Code"
              placeholder="e.g. POL-ANN-STD"
              value={formData.policyCode}
              onChange={(e) => setFormData({ ...formData, policyCode: e.target.value })}
              required
            />
            <Input
              label="Policy Name"
              placeholder="e.g. Standard Annual Leave Policy"
              value={formData.policyName}
              onChange={(e) => setFormData({ ...formData, policyName: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Select
              label="Associated Leave Category"
              value={formData.leaveTypeId}
              onChange={(e) => setFormData({ ...formData, leaveTypeId: e.target.value })}
              options={leaveTypes.map((lt) => ({ value: lt.id, label: `${lt.name} (${lt.code})` }))}
              required
            />
            <Input
              label="Entitled Days (Annual)"
              type="number"
              value={formData.entitledDays}
              onChange={(e) => setFormData({ ...formData, entitledDays: parseFloat(e.target.value) || 0 })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Select
              label="Accrual Method"
              value={formData.accrualMethod}
              onChange={(e) => setFormData({ ...formData, accrualMethod: e.target.value })}
              options={[
                { value: 'ANNUAL_ALLOCATION', label: 'Annual Allocation (100% Upfront)' },
                { value: 'MONTHLY_ACCRUAL', label: 'Monthly Accrual (Prorated 1/12th Monthly)' },
                { value: 'CUSTOM', label: 'Custom Allocation' },
              ]}
            />
            <Select
              label="Approval Hierarchy"
              value={formData.approvalHierarchy}
              onChange={(e) => setFormData({ ...formData, approvalHierarchy: e.target.value })}
              options={[
                { value: 'MANAGER_HR', label: 'Manager Review then HR Approval (Default)' },
                { value: 'MANAGER_ONLY', label: 'Manager Approval Only' },
                { value: 'HR_ONLY', label: 'HR Admin Direct Approval Only' },
                { value: 'SUPERVISOR_MANAGER_HR', label: 'Supervisor -> Manager -> HR' },
              ]}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <Input
              label="Max Carry-Forward (Days)"
              type="number"
              value={formData.maxCarryForwardDays}
              onChange={(e) => setFormData({ ...formData, maxCarryForwardDays: parseFloat(e.target.value) || 0 })}
            />
            <Input
              label="Carry Expiry (Months into New Year)"
              type="number"
              value={formData.carryForwardExpiryMonths}
              onChange={(e) => setFormData({ ...formData, carryForwardExpiryMonths: parseInt(e.target.value, 10) || 3 })}
            />
            <Input
              label="Min Service Days (Waiting Period)"
              type="number"
              value={formData.minServiceDays}
              onChange={(e) => setFormData({ ...formData, minServiceDays: parseInt(e.target.value, 10) || 0 })}
            />
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', padding: '0.5rem 0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.allowCarryForward}
                onChange={(e) => setFormData({ ...formData, allowCarryForward: e.target.checked })}
              />
              Allow Carry Forward
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.probationEligible}
                onChange={(e) => setFormData({ ...formData, probationEligible: e.target.checked })}
              />
              Eligible During Probation
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.excludeWeekends}
                onChange={(e) => setFormData({ ...formData, excludeWeekends: e.target.checked })}
              />
              Exclude Weekends from Count
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.excludeHolidays}
                onChange={(e) => setFormData({ ...formData, excludeHolidays: e.target.checked })}
              />
              Exclude Public Holidays from Count
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingPolicy ? 'Save Changes' : 'Create Policy'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
