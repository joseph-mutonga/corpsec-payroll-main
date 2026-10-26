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
import { Plus, Edit2, Trash2, Power, Layers, CheckCircle2, XCircle } from 'lucide-react';

export default function LeaveTypesPage() {
  const { success, error: toastError } = useToast();
  const [types, setTypes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<any | null>(null);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    isPaid: true,
    defaultDays: 21,
    maxDays: '',
    minNoticeDays: 0,
    accrualEnabled: true,
    carryForwardEnabled: true,
    requiresApproval: true,
    requiresDocument: false,
    requiresMedicalCert: false,
    genderApplicability: 'ALL',
    color: '#2563eb',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchLeaveTypes();
  }, []);

  const fetchLeaveTypes = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/leave/types');
      const json = await res.json();
      if (json.success) setTypes(json.data.leaveTypes);
    } catch (err) {
      toastError('Failed to load leave types');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (typeToEdit?: any) => {
    if (typeToEdit) {
      setEditingType(typeToEdit);
      setFormData({
        code: typeToEdit.code,
        name: typeToEdit.name,
        description: typeToEdit.description || '',
        isPaid: typeToEdit.isPaid,
        defaultDays: typeToEdit.defaultDays,
        maxDays: typeToEdit.maxDays ? typeToEdit.maxDays.toString() : '',
        minNoticeDays: typeToEdit.minNoticeDays || 0,
        accrualEnabled: typeToEdit.accrualEnabled,
        carryForwardEnabled: typeToEdit.carryForwardEnabled,
        requiresApproval: typeToEdit.requiresApproval,
        requiresDocument: typeToEdit.requiresDocument,
        requiresMedicalCert: typeToEdit.requiresMedicalCert,
        genderApplicability: typeToEdit.genderApplicability || 'ALL',
        color: typeToEdit.color || '#2563eb',
      });
    } else {
      setEditingType(null);
      setFormData({
        code: '',
        name: '',
        description: '',
        isPaid: true,
        defaultDays: 21,
        maxDays: '',
        minNoticeDays: 0,
        accrualEnabled: true,
        carryForwardEnabled: true,
        requiresApproval: true,
        requiresDocument: false,
        requiresMedicalCert: false,
        genderApplicability: 'ALL',
        color: '#2563eb',
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
        defaultDays: parseFloat(formData.defaultDays.toString()),
        maxDays: formData.maxDays ? parseFloat(formData.maxDays) : undefined,
        minNoticeDays: parseInt(formData.minNoticeDays.toString(), 10) || 0,
      };

      const url = editingType ? `/api/leave/types/${editingType.id}` : '/api/leave/types';
      const method = editingType ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      success(editingType ? 'Leave type updated successfully' : 'Leave type created successfully');
      setIsModalOpen(false);
      fetchLeaveTypes();
    } catch (err: any) {
      toastError(err.message || 'Error saving leave type');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete or deactivate this leave type?')) return;
    try {
      const res = await fetch(`/api/leave/types/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      success('Leave type deleted / archived');
      fetchLeaveTypes();
    } catch (err: any) {
      toastError(err.message || 'Failed to delete leave type');
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Breadcrumb & Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <Breadcrumb
            items={[
              { label: 'Leave Management', href: '/leave' },
              { label: 'Leave Types Configuration' },
            ]}
          />
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
            Leave Types Configuration
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
            Configure corporate leave categories, paid/unpaid statuses, accrual rules, medical document mandates, and notice periods
          </p>
        </div>

        <Button variant="primary" onClick={() => handleOpenModal()}>
          <Plus size={16} style={{ marginRight: '0.5rem' }} /> Add Leave Type
        </Button>
      </div>

      {/* Leave Types Table Card */}
      <Card>
        {isLoading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" />
          </div>
        ) : types.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No leave types configured. Click &quot;Add Leave Type&quot; to define your first corporate leave category.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Code</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Name &amp; Description</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Type</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Default Days</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Min Notice</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Accrual / Carry</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Docs Mandated</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: t.color || '#2563eb' }}>
                      {t.code}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{t.name}</div>
                      {t.description && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>{t.description}</div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <Badge variant={t.isPaid ? 'success' : 'neutral'} size="sm">
                        {t.isPaid ? 'PAID' : 'UNPAID'}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>
                      {t.defaultDays}d
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#64748b' }}>
                      {t.minNoticeDays > 0 ? `${t.minNoticeDays}d notice` : 'Immediate'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {t.accrualEnabled ? 'Accrues' : 'Fixed'} &bull; {t.carryForwardEnabled ? 'Carry-fwd' : 'No carry'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      {t.requiresMedicalCert ? (
                        <Badge variant="danger" size="sm">Medical Cert</Badge>
                      ) : t.requiresDocument ? (
                        <Badge variant="warning" size="sm">Letter Req</Badge>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Optional</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <Badge variant={t.status === 'ACTIVE' ? 'success' : 'danger'} size="sm">
                        {t.status}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <Button variant="outline" size="sm" onClick={() => handleOpenModal(t)}>
                          <Edit2 size={14} />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(t.id)}>
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

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingType ? 'Edit Leave Type' : 'Add New Leave Type'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
            <Input
              label="Type Code"
              placeholder="e.g. LT-ANNUAL"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              required
            />
            <Input
              label="Leave Type Name"
              placeholder="e.g. Annual Leave"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <Input
            label="Description"
            placeholder="Brief explanation of policy applicability"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <Select
              label="Payment Status"
              value={formData.isPaid ? 'PAID' : 'UNPAID'}
              onChange={(e) => setFormData({ ...formData, isPaid: e.target.value === 'PAID' })}
              options={[
                { value: 'PAID', label: 'Paid Leave' },
                { value: 'UNPAID', label: 'Unpaid Leave' },
              ]}
            />
            <Input
              label="Default Entitlement (Days)"
              type="number"
              value={formData.defaultDays}
              onChange={(e) => setFormData({ ...formData, defaultDays: parseFloat(e.target.value) || 0 })}
              required
            />
            <Input
              label="Minimum Notice (Days)"
              type="number"
              value={formData.minNoticeDays}
              onChange={(e) => setFormData({ ...formData, minNoticeDays: parseInt(e.target.value, 10) || 0 })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Select
              label="Gender Applicability"
              value={formData.genderApplicability}
              onChange={(e) => setFormData({ ...formData, genderApplicability: e.target.value })}
              options={[
                { value: 'ALL', label: 'All Genders (Universal)' },
                { value: 'FEMALE', label: 'Female Only (Maternity)' },
                { value: 'MALE', label: 'Male Only (Paternity)' },
              ]}
            />
            <Input
              label="Badge Theme Color"
              type="color"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', padding: '0.5rem 0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.accrualEnabled}
                onChange={(e) => setFormData({ ...formData, accrualEnabled: e.target.checked })}
              />
              Enable Accrual Calculations
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.carryForwardEnabled}
                onChange={(e) => setFormData({ ...formData, carryForwardEnabled: e.target.checked })}
              />
              Allow Year-End Carry Forward
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.requiresMedicalCert}
                onChange={(e) => setFormData({ ...formData, requiresMedicalCert: e.target.checked })}
              />
              Require Medical Certificate
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingType ? 'Save Changes' : 'Create Leave Type'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
