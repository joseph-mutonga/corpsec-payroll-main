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
  GitFork,
  Plus,
  Search,
  Eye,
  Edit2,
  Power,
  Users,
  Briefcase,
} from 'lucide-react';
import { DepartmentData, BranchData, EmployeeData } from '@/types';

export default function DepartmentsPage() {
  const { success, error: toastError } = useToast();

  const [departments, setDepartments] = useState<DepartmentData[]>([]);
  const [branches, setBranches] = useState<BranchData[]>([]);
  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    branchId: '',
    departmentHeadId: '',
    isActive: true,
  });

  // Deactivate confirmation
  const [toggleTarget, setToggleTarget] = useState<DepartmentData | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    fetchDepartments();
    fetchBranches();
    fetchEmployees();
  }, [statusFilter]);

  const fetchDepartments = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/departments?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setDepartments(data.data);
      } else {
        toastError('Error', data.error?.message || 'Failed to fetch departments');
      }
    } catch (err) {
      toastError('Error', 'Network error.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches');
      const data = await res.json();
      if (data.success) setBranches(data.data);
    } catch (err) {
      console.error('Fetch branches error:', err);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees?pageSize=100');
      const data = await res.json();
      if (data.success) setEmployees(data.data);
    } catch (err) {
      console.error('Fetch employees error:', err);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDepartments();
  };

  const openCreateModal = () => {
    setEditingDept(null);
    setFormData({
      code: '',
      name: '',
      description: '',
      branchId: branches[0]?.id || '',
      departmentHeadId: '',
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (dept: DepartmentData) => {
    setEditingDept(dept);
    setFormData({
      code: dept.code,
      name: dept.name,
      description: dept.description || '',
      branchId: dept.branchId || '',
      departmentHeadId: dept.departmentHeadId || '',
      isActive: dept.isActive,
    });
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const url = editingDept ? `/api/departments/${editingDept.id}` : '/api/departments';
      const method = editingDept ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Failed', data.error?.message || 'Error saving department');
        setIsSubmitting(false);
        return;
      }

      success('Department Saved', `Department ${data.data.name} saved successfully.`);
      setIsModalOpen(false);
      fetchDepartments();
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
      const res = await fetch(`/api/departments/${toggleTarget.id}`, {
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

      success('Status Updated', `Department is now ${data.data.isActive ? 'Active' : 'Inactive'}.`);
      setToggleTarget(null);
      fetchDepartments();
    } catch (err) {
      toastError('Error', 'Network error.');
    } finally {
      setIsToggling(false);
    }
  };

  const columns: Column<DepartmentData>[] = [
    {
      header: 'Department Code & Name',
      accessor: (d) => (
        <div>
          <Link
            href={`/hr/departments/${d.id}`}
            style={{ fontWeight: 700, color: '#0f1c3f', fontSize: '0.875rem', textDecoration: 'none' }}
          >
            {d.name}
          </Link>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            <span style={{ fontWeight: 600, color: '#d97706' }}>{d.code}</span>
            {d.description && <span> &bull; {d.description}</span>}
          </div>
        </div>
      ),
    },
    {
      header: 'Department Head',
      accessor: (d) => (
        <div style={{ fontSize: '0.8125rem' }}>
          {d.departmentHead ? (
            <div style={{ fontWeight: 600, color: '#0f172a' }}>
              {d.departmentHead.fullName}
              <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{d.departmentHead.jobTitle}</div>
            </div>
          ) : (
            <span style={{ color: '#94a3b8' }}>Unassigned</span>
          )}
        </div>
      ),
    },
    {
      header: 'Headcount & Positions',
      accessor: (d) => (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Badge variant="gold" size="sm">
            {d._count?.employees || 0} Staff
          </Badge>
          <Badge variant="neutral" size="sm">
            {d._count?.positions || 0} Positions
          </Badge>
        </div>
      ),
    },
    {
      header: 'Branch Alignment',
      accessor: (d) => (
        <span style={{ fontSize: '0.8125rem', color: '#475569' }}>
          {d.branch?.name || 'Nairobi Head Office'}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: (d) => (
        <Badge variant={d.isActive ? 'success' : 'neutral'} size="sm" dot={d.isActive}>
          {d.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
      width: '100px',
    },
    {
      header: 'Actions',
      align: 'right',
      accessor: (d) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.375rem' }}>
          <Link href={`/hr/departments/${d.id}`} style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm" leftIcon={<Eye size={13} />}>
              Profile
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => openEditModal(d)}>
            <Edit2 size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setToggleTarget(d)}
            title={d.isActive ? 'Deactivate Department' : 'Activate Department'}
            style={{ color: d.isActive ? '#dc2626' : '#059669' }}
          >
            <Power size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <Breadcrumb items={[{ label: 'Organization', href: '/hr' }, { label: 'Departments' }]} />

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
            Company Departments
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
            Functional business units: Security Guarding & Operations, HR, Finance, and Logistics.
          </p>
        </div>

        <Button variant="primary" size="md" onClick={openCreateModal} leftIcon={<Plus size={16} />}>
          Add New Department
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
              placeholder="Search by department name, code, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search size={15} />}
            />
            <Button type="submit" variant="secondary" size="md">
              Search
            </Button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
          data={departments}
          keyExtractor={(d) => d.id}
          isLoading={isLoading}
          emptyText="No department records found."
        />
      </Card>

      {/* Create / Edit Department Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingDept ? 'Edit Department' : 'Register New Department'}
        subtitle="Manage department profile, code, and appointed department head"
        maxWidth="520px"
      >
        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
            <Input
              label="Department Code"
              requiredIndicator
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="e.g. SEC-OPS"
            />
            <Input
              label="Department Name"
              requiredIndicator
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Security Guarding & Operations"
            />
          </div>

          <Input
            label="Description / Operational Mandate"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Manned guarding deployment and station operations"
          />

          <Select
            label="Operating Branch Alignment"
            value={formData.branchId}
            onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
            options={[
              { value: '', label: 'Select branch alignment' },
              ...branches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` })),
            ]}
          />

          <Select
            label="Appointed Department Head"
            value={formData.departmentHeadId}
            onChange={(e) => setFormData({ ...formData, departmentHeadId: e.target.value })}
            options={[
              { value: '', label: 'Select department head (optional)' },
              ...employees.map((emp) => ({
                value: emp.id,
                label: `${emp.fullName} (${emp.employeeNumber} - ${emp.jobTitle})`,
              })),
            ]}
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
              {editingDept ? 'Save Department' : 'Create Department'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Dialog for Activation / Deactivation */}
      <ConfirmDialog
        isOpen={toggleTarget !== null}
        onClose={() => setToggleTarget(null)}
        onConfirm={handleToggleStatus}
        title={toggleTarget?.isActive ? 'Deactivate Department' : 'Activate Department'}
        message={
          toggleTarget?.isActive
            ? `Deactivating "${toggleTarget?.name}" will prevent new positions and employees from being assigned to this department. Historical records remain intact.`
            : `Are you sure you want to activate "${toggleTarget?.name}"?`
        }
        confirmText={toggleTarget?.isActive ? 'Deactivate Department' : 'Activate Department'}
        variant={toggleTarget?.isActive ? 'danger' : 'primary'}
        isLoading={isToggling}
      />
    </div>
  );
}
