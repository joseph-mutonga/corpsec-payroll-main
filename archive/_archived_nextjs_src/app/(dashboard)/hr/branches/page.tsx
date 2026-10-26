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
  Building2,
  Plus,
  Search,
  Eye,
  Edit2,
  Power,
  MapPin,
  Phone,
  Mail,
  UserCheck,
} from 'lucide-react';
import { BranchData, EmployeeData } from '@/types';

export default function BranchesPage() {
  const { success, error: toastError } = useToast();

  const [branches, setBranches] = useState<BranchData[]>([]);
  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    location: '',
    county: 'Nairobi',
    townCity: 'Nairobi',
    physicalAddress: '',
    contactPerson: '',
    phone: '',
    email: '',
    branchManagerId: '',
    isActive: true,
  });

  // Deactivate confirmation
  const [toggleTarget, setToggleTarget] = useState<BranchData | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    fetchBranches();
    fetchEmployees();
  }, [statusFilter]);

  const fetchBranches = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/branches?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setBranches(data.data);
      } else {
        toastError('Error', data.error?.message || 'Failed to fetch branches');
      }
    } catch (err) {
      toastError('Error', 'Network error.');
    } finally {
      setIsLoading(false);
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
    fetchBranches();
  };

  const openCreateModal = () => {
    setEditingBranch(null);
    setFormData({
      code: '',
      name: '',
      location: '',
      county: 'Nairobi',
      townCity: 'Nairobi',
      physicalAddress: '',
      contactPerson: '',
      phone: '',
      email: '',
      branchManagerId: '',
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (branch: BranchData) => {
    setEditingBranch(branch);
    setFormData({
      code: branch.code,
      name: branch.name,
      location: branch.location || '',
      county: branch.county || 'Nairobi',
      townCity: branch.townCity || 'Nairobi',
      physicalAddress: branch.physicalAddress || '',
      contactPerson: branch.contactPerson || '',
      phone: branch.phone || '',
      email: branch.email || '',
      branchManagerId: branch.branchManagerId || '',
      isActive: branch.isActive,
    });
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const url = editingBranch ? `/api/branches/${editingBranch.id}` : '/api/branches';
      const method = editingBranch ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Failed', data.error?.message || 'Error saving branch');
        setIsSubmitting(false);
        return;
      }

      success('Branch Saved', `Branch ${data.data.name} saved successfully.`);
      setIsModalOpen(false);
      fetchBranches();
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
      const res = await fetch(`/api/branches/${toggleTarget.id}`, {
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

      success('Status Updated', `Branch is now ${data.data.isActive ? 'Active' : 'Inactive'}.`);
      setToggleTarget(null);
      fetchBranches();
    } catch (err) {
      toastError('Error', 'Network error.');
    } finally {
      setIsToggling(false);
    }
  };

  const columns: Column<BranchData>[] = [
    {
      header: 'Branch Code & Name',
      accessor: (b) => (
        <div>
          <Link
            href={`/hr/branches/${b.id}`}
            style={{ fontWeight: 700, color: '#0f1c3f', fontSize: '0.875rem', textDecoration: 'none' }}
          >
            {b.name}
          </Link>
          <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, color: '#d97706' }}>{b.code}</span> &bull;
            <span>{b.location || b.townCity || 'Nairobi'}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Regional Location',
      accessor: (b) => (
        <div style={{ fontSize: '0.8125rem', color: '#475569' }}>
          <div>{b.county || 'Nairobi'} &bull; {b.townCity || 'Nairobi'}</div>
          {b.physicalAddress && <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{b.physicalAddress}</div>}
        </div>
      ),
    },
    {
      header: 'Branch Manager',
      accessor: (b) => (
        <div style={{ fontSize: '0.8125rem' }}>
          {b.branchManager ? (
            <div style={{ fontWeight: 600, color: '#0f172a' }}>
              {b.branchManager.fullName}
              <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{b.branchManager.jobTitle}</div>
            </div>
          ) : (
            <span style={{ color: '#94a3b8' }}>{b.contactPerson || 'Unassigned'}</span>
          )}
        </div>
      ),
    },
    {
      header: 'Staff & Stations',
      accessor: (b) => (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Badge variant="gold" size="sm">
            {b._count?.employees || 0} Staff
          </Badge>
          <Badge variant="neutral" size="sm">
            {b._count?.stations || 0} Stations
          </Badge>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (b) => (
        <Badge variant={b.isActive ? 'success' : 'neutral'} size="sm" dot={b.isActive}>
          {b.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
      width: '100px',
    },
    {
      header: 'Actions',
      align: 'right',
      accessor: (b) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.375rem' }}>
          <Link href={`/hr/branches/${b.id}`} style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm" leftIcon={<Eye size={13} />}>
              Profile
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => openEditModal(b)}>
            <Edit2 size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setToggleTarget(b)}
            title={b.isActive ? 'Deactivate Branch' : 'Activate Branch'}
            style={{ color: b.isActive ? '#dc2626' : '#059669' }}
          >
            <Power size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <Breadcrumb items={[{ label: 'Organization', href: '/hr' }, { label: 'Operating Branches' }]} />

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
            Company Operating Branches
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
            Regional management offices, head office, and operational command branches in Kenya.
          </p>
        </div>

        <Button variant="primary" size="md" onClick={openCreateModal} leftIcon={<Plus size={16} />}>
          Add New Branch
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
              placeholder="Search by branch name, code, or county..."
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
          data={branches}
          keyExtractor={(b) => b.id}
          isLoading={isLoading}
          emptyText="No branch records found."
        />
      </Card>

      {/* Create / Edit Branch Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBranch ? 'Edit Operating Branch' : 'Register New Operating Branch'}
        subtitle="Manage branch profile, regional office location, and manager"
        maxWidth="560px"
      >
        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
            <Input
              label="Branch Code"
              requiredIndicator
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="e.g. BR-MSA"
            />
            <Input
              label="Branch Name"
              requiredIndicator
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Mombasa Coast Regional Branch"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Input
              label="County"
              value={formData.county}
              onChange={(e) => setFormData({ ...formData, county: e.target.value })}
              placeholder="e.g. Mombasa"
            />
            <Input
              label="Town / City"
              value={formData.townCity}
              onChange={(e) => setFormData({ ...formData, townCity: e.target.value })}
              placeholder="e.g. Nyali, Mombasa"
            />
          </div>

          <Input
            label="Physical Address / Building"
            value={formData.physicalAddress}
            onChange={(e) => setFormData({ ...formData, physicalAddress: e.target.value })}
            placeholder="e.g. Nyali Executive Centre, Links Road"
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Input
              label="Official Phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+254 711 100 200"
            />
            <Input
              label="Official Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="mombasa@corpsec.co.ke"
            />
          </div>

          <Select
            label="Designated Branch Manager"
            value={formData.branchManagerId}
            onChange={(e) => setFormData({ ...formData, branchManagerId: e.target.value })}
            options={[
              { value: '', label: 'Select branch manager (optional)' },
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
              {editingBranch ? 'Save Branch Changes' : 'Create Branch'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Dialog for Activation / Deactivation */}
      <ConfirmDialog
        isOpen={toggleTarget !== null}
        onClose={() => setToggleTarget(null)}
        onConfirm={handleToggleStatus}
        title={toggleTarget?.isActive ? 'Deactivate Branch' : 'Activate Branch'}
        message={
          toggleTarget?.isActive
            ? `Deactivating "${toggleTarget?.name}" will prevent new employees from being assigned to this branch. Historical assignments and payroll records will remain intact.`
            : `Are you sure you want to activate "${toggleTarget?.name}"?`
        }
        confirmText={toggleTarget?.isActive ? 'Deactivate Branch' : 'Activate Branch'}
        variant={toggleTarget?.isActive ? 'danger' : 'primary'}
        isLoading={isToggling}
      />
    </div>
  );
}
