'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Table, Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/ToastContext';
import {
  Briefcase,
  Plus,
  Search,
  Eye,
  Edit2,
  Power,
  Users,
  Shield,
} from 'lucide-react';
import { PositionData, DepartmentData } from '@/types';

export default function PositionsPage() {
  const { success, error: toastError } = useToast();

  const [positions, setPositions] = useState<PositionData[]>([]);
  const [departments, setDepartments] = useState<DepartmentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPos, setEditingPos] = useState<PositionData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    title: '',
    description: '',
    departmentId: '',
    employmentCategory: 'SECURITY_GUARD',
    isActive: true,
  });

  // Deactivate confirmation
  const [toggleTarget, setToggleTarget] = useState<PositionData | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    fetchPositions();
    fetchDepartments();
  }, [statusFilter, deptFilter]);

  const fetchPositions = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (deptFilter !== 'ALL') params.set('departmentId', deptFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/positions?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setPositions(data.data);
      } else {
        toastError('Error', data.error?.message || 'Failed to fetch positions');
      }
    } catch (err) {
      toastError('Error', 'Network error.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await fetch('/api/departments');
      const data = await res.json();
      if (data.success) setDepartments(data.data);
    } catch (err) {
      console.error('Fetch departments error:', err);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPositions();
  };

  const openCreateModal = () => {
    setEditingPos(null);
    setFormData({
      code: '',
      title: '',
      description: '',
      departmentId: departments[0]?.id || '',
      employmentCategory: 'SECURITY_GUARD',
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (pos: PositionData) => {
    setEditingPos(pos);
    setFormData({
      code: pos.code,
      title: pos.title,
      description: pos.description || '',
      departmentId: pos.departmentId || '',
      employmentCategory: pos.employmentCategory || 'SECURITY_GUARD',
      isActive: pos.isActive,
    });
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const url = editingPos ? `/api/positions/${editingPos.id}` : '/api/positions';
      const method = editingPos ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Failed', data.error?.message || 'Error saving position');
        setIsSubmitting(false);
        return;
      }

      success('Position Saved', `Job Position ${data.data.title} saved successfully.`);
      setIsModalOpen(false);
      fetchPositions();
    } catch (err) {
      toastError('Error', 'Network error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!toggleTarget) return;

    try {
      setIsToggling(true);
      const res = await fetch(`/api/positions/${toggleTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !toggleTarget.isActive }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Failed', data.error?.message || 'Could not update status');
        setIsToggling(false);
        return;
      }

      success('Status Updated', `Position is now ${data.data.isActive ? 'Active' : 'Inactive'}.`);
      setToggleTarget(null);
      fetchPositions();
    } catch (err) {
      toastError('Error', 'Network error.');
    } finally {
      setIsToggling(false);
    }
  };

  const columns: Column<PositionData>[] = [
    {
      header: 'Position Code & Title',
      accessor: (p) => (
        <div>
          <Link
            href={`/hr/positions/${p.id}`}
            style={{ fontWeight: 700, color: '#0f1c3f', fontSize: '0.875rem', textDecoration: 'none' }}
          >
            {p.title}
          </Link>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            <span style={{ fontWeight: 600, color: '#d97706' }}>{p.code}</span>
            {p.description && <span> &bull; {p.description}</span>}
          </div>
        </div>
      ),
    },
    {
      header: 'Department',
      accessor: (p) => (
        <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#0f172a' }}>
          {p.department?.name || 'Unassigned'}
        </span>
      ),
    },
    {
      header: 'Category',
      accessor: (p) => (
        <Badge variant="neutral" size="sm">
          {p.employmentCategory.toLowerCase().replace('_', ' ')}
        </Badge>
      ),
    },
    {
      header: 'Active Occupants',
      accessor: (p) => (
        <Badge variant="gold" size="sm">
          {p._count?.employees || 0} Employees
        </Badge>
      ),
    },
    {
      header: 'Status',
      accessor: (p) => (
        <Badge variant={p.isActive ? 'success' : 'neutral'} size="sm" dot={p.isActive}>
          {p.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
      width: '100px',
    },
    {
      header: 'Actions',
      align: 'right',
      accessor: (p) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.375rem' }}>
          <Link href={`/hr/positions/${p.id}`} style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm" leftIcon={<Eye size={13} />}>
              Profile
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => openEditModal(p)}>
            <Edit2 size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setToggleTarget(p)}
            title={p.isActive ? 'Deactivate Position' : 'Activate Position'}
            style={{ color: p.isActive ? '#dc2626' : '#059669' }}
          >
            <Power size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <Breadcrumb items={[{ label: 'Organization', href: '/hr' }, { label: 'Job Positions' }]} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0f1c3f' }}>
            Job Positions & Roles Catalog
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
            Standardized job designations: Security Guards, Patrol Supervisors, Command Officers, HR & Finance.
          </p>
        </div>

        <Button variant="primary" size="md" onClick={openCreateModal} leftIcon={<Plus size={16} />}>
          Add New Position
        </Button>
      </div>

      <Card noPadding>
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', maxWidth: '380px', flex: 1 }}>
            <Input
              placeholder="Search by position title or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search size={15} />}
            />
            <Button type="submit" variant="secondary" size="md">
              Search
            </Button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.8125rem',
                color: '#0f172a',
                outline: 'none',
              }}
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.8125rem',
                color: '#0f172a',
                outline: 'none',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
          </div>
        </div>

        <Table
          columns={columns}
          data={positions}
          keyExtractor={(p) => p.id}
          isLoading={isLoading}
          emptyText="No job position records found."
        />
      </Card>

      {/* Create / Edit Position Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPos ? 'Edit Job Position' : 'Register New Job Position'}
        subtitle="Configure title, code, department alignment, and category"
        maxWidth="500px"
      >
        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
            <Input
              label="Position Code"
              requiredIndicator
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="e.g. POS-SEC-GD"
            />
            <Input
              label="Position Title"
              requiredIndicator
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Armed Guard Specialist"
            />
          </div>

          <Select
            label="Department"
            requiredIndicator
            value={formData.departmentId}
            onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
            options={departments.map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }))}
          />

          <Select
            label="Employment Category"
            requiredIndicator
            value={formData.employmentCategory}
            onChange={(e) => setFormData({ ...formData, employmentCategory: e.target.value })}
            options={[
              { value: 'SECURITY_GUARD', label: 'Security Guard / Field Personnel' },
              { value: 'PATROL_SUPERVISOR', label: 'Patrol & Station Supervisor' },
              { value: 'OPERATIONS', label: 'Operations & Control Commander' },
              { value: 'OFFICE_STAFF', label: 'Office & Administrative Staff' },
              { value: 'MANAGEMENT', label: 'Executive Management' },
            ]}
          />

          <Input
            label="Position Description (Optional)"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Key responsibilities and duties"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isSubmitting}>
              {editingPos ? 'Save Position' : 'Create Position'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Dialog for Activation / Deactivation */}
      <ConfirmDialog
        isOpen={toggleTarget !== null}
        onClose={() => setToggleTarget(null)}
        onConfirm={handleToggleStatus}
        title={toggleTarget?.isActive ? 'Deactivate Job Position' : 'Activate Job Position'}
        message={
          toggleTarget?.isActive
            ? `Deactivating "${toggleTarget?.title}" will prevent new employees from being assigned to this position. Existing employee records and history remain intact.`
            : `Are you sure you want to activate "${toggleTarget?.title}"?`
        }
        confirmText={toggleTarget?.isActive ? 'Deactivate Position' : 'Activate Position'}
        variant={toggleTarget?.isActive ? 'danger' : 'primary'}
        isLoading={isToggling}
      />
    </div>
  );
}
