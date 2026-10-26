'use client';

import React, { useState, useEffect } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Table, Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import {
  UserPlus,
  Search,
  Shield,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Key,
  ShieldAlert,
} from 'lucide-react';
import { UserWithRoles } from '@/types';

export default function UsersPage() {
  const { success, error: toastError } = useToast();

  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Create/Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    password: '',
    role: 'hr_admin',
    isActive: true,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete Confirmation State
  const [deleteTarget, setDeleteTarget] = useState<UserWithRoles | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
      } else {
        toastError('Access Denied', data.error?.message || 'Cannot fetch users.');
      }
    } catch (err) {
      console.error('Fetch users error:', err);
      toastError('Error', 'Failed to retrieve system users.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setModalMode('create');
    setEditingUserId(null);
    setFormData({
      email: '',
      firstName: '',
      lastName: '',
      phone: '',
      password: '',
      role: 'hr_admin',
      isActive: true,
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (user: UserWithRoles) => {
    setModalMode('edit');
    setEditingUserId(user.id);
    setFormData({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone || '',
      password: '',
      role: user.userRoles?.[0]?.role?.name || 'employee',
      isActive: user.isActive,
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormErrors({});

    try {
      if (modalMode === 'create') {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            firstName: formData.firstName,
            lastName: formData.lastName,
            phone: formData.phone || undefined,
            roles: [formData.role],
            isActive: formData.isActive,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          if (data.error?.code === 'VALIDATION_ERROR' && data.error.details) {
            setFormErrors(data.error.details);
          } else {
            toastError('Create User Failed', data.error?.message || 'Error creating user');
          }
          setIsSubmitting(false);
          return;
        }

        success('User Created', `Account for ${formData.email} created successfully.`);
      } else if (editingUserId) {
        const updatePayload: any = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
          isActive: formData.isActive,
          roles: [formData.role],
        };
        if (formData.password) {
          updatePayload.password = formData.password;
        }

        const res = await fetch(`/api/users/${editingUserId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          if (data.error?.code === 'VALIDATION_ERROR' && data.error.details) {
            setFormErrors(data.error.details);
          } else {
            toastError('Update User Failed', data.error?.message || 'Error updating user');
          }
          setIsSubmitting(false);
          return;
        }

        success('User Updated', `Account details updated successfully.`);
      }

      setIsModalOpen(false);
      fetchUsers();
    } catch (err) {
      console.error('Submit error:', err);
      toastError('Error', 'Network error occurred while saving user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      const res = await fetch(`/api/users/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        toastError('Delete Failed', data.error?.message || 'Could not delete user.');
        setIsDeleting(false);
        return;
      }

      success('User Deactivated', `Account for ${deleteTarget.email} has been deactivated.`);
      setDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      toastError('Delete Error', 'Network error occurred.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.lastName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole =
      roleFilter === 'ALL' || u.userRoles?.some((ur: any) => ur.role.name === roleFilter);

    return matchesSearch && matchesRole;
  });

  const columns: Column<UserWithRoles>[] = [
    {
      header: 'User / Email',
      accessor: (user) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0f172a' }}>
            {user.firstName} {user.lastName}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{user.email}</div>
        </div>
      ),
    },
    {
      header: 'Assigned Role',
      accessor: (user) => (
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          {user.userRoles?.map((ur: any) => (
            <Badge key={ur.role.id} variant="gold" size="sm">
              {ur.role.displayName}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      header: 'Phone',
      accessor: (user) => user.phone || <span style={{ color: '#94a3b8' }}>—</span>,
    },
    {
      header: 'Status',
      accessor: (user) =>
        user.isActive ? (
          <Badge variant="success" size="sm" dot>
            Active
          </Badge>
        ) : (
          <Badge variant="danger" size="sm" dot>
            Inactive
          </Badge>
        ),
    },
    {
      header: 'Last Login',
      accessor: (user) =>
        user.lastLoginAt ? (
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            {new Date(user.lastLoginAt).toLocaleDateString()} {new Date(user.lastLoginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        ) : (
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Never</span>
        ),
    },
    {
      header: 'Actions',
      align: 'right',
      accessor: (user) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.375rem' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenEditModal(user)}
            leftIcon={<Edit2 size={13} />}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteTarget(user)}
            style={{ color: '#dc2626' }}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <Breadcrumb items={[{ label: 'System & Security', href: '/users' }, { label: 'User Management' }]} />

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
            User Accounts & Role Management
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
            Manage staff accounts, assign granular permissions, and control system activation.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={handleOpenCreateModal}
          leftIcon={<UserPlus size={16} />}
        >
          Create New User
        </Button>
      </div>

      <Card noPadding>
        {/* Filter and Search Bar */}
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
          <div style={{ maxWidth: '320px', width: '100%' }}>
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search size={15} />}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 600 }}>
              Filter by Role:
            </span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.8125rem',
                color: '#0f172a',
                outline: 'none',
              }}
            >
              <option value="ALL">All Roles</option>
              <option value="super_admin">Super Administrator</option>
              <option value="hr_admin">HR Administrator</option>
              <option value="payroll_officer">Payroll Officer</option>
              <option value="hr_manager">HR Manager</option>
              <option value="finance">Finance / Approver</option>
              <option value="employee">Employee</option>
            </select>
          </div>
        </div>

        {/* Users Table */}
        <Table
          columns={columns}
          data={filteredUsers}
          keyExtractor={(u) => u.id}
          isLoading={isLoading}
          emptyText="No users found matching the search criteria."
        />
      </Card>

      {/* User Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalMode === 'create' ? 'Create User Account' : 'Edit User Account'}
        subtitle="Configure corporate user profile, credentials, and assigned role."
        maxWidth="520px"
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Input
              label="First Name"
              requiredIndicator
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              error={formErrors.firstName?.[0]}
              placeholder="e.g. John"
            />
            <Input
              label="Last Name"
              requiredIndicator
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              error={formErrors.lastName?.[0]}
              placeholder="e.g. Kamau"
            />
          </div>

          <Input
            label="Corporate Email Address"
            type="email"
            requiredIndicator
            disabled={modalMode === 'edit'}
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            error={formErrors.email?.[0]}
            placeholder="name@corpsec.co.ke"
            helperText={modalMode === 'edit' ? 'Email cannot be changed after account creation.' : undefined}
          />

          <Input
            label="Phone Number (Optional)"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            error={formErrors.phone?.[0]}
            placeholder="+254 722 000 000"
          />

          <Select
            label="Assigned System Role"
            requiredIndicator
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            options={[
              { value: 'super_admin', label: 'Super Administrator (Full System Access)' },
              { value: 'hr_admin', label: 'HR Administrator (HR & Org Management)' },
              { value: 'payroll_officer', label: 'Payroll Officer (Payroll Runs & Allowances)' },
              { value: 'hr_manager', label: 'HR Manager (Review & Approval)' },
              { value: 'finance', label: 'Finance / Approver (Disbursement & Audits)' },
              { value: 'employee', label: 'Employee (Self-Service)' },
            ]}
          />

          <Input
            label={modalMode === 'create' ? 'Initial Account Password' : 'New Password (leave blank to keep current)'}
            type="password"
            requiredIndicator={modalMode === 'create'}
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            error={formErrors.password?.[0]}
            placeholder="••••••••••••"
            helperText="Minimum 8 characters with at least one uppercase, lowercase, and digit."
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', paddingTop: '0.25rem' }}>
            <input
              type="checkbox"
              id="isActiveToggle"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <label htmlFor="isActiveToggle" style={{ fontSize: '0.875rem', color: '#1e293b', cursor: 'pointer' }}>
              Account is Active (can log into the system)
            </label>
          </div>

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
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isSubmitting}
            >
              {modalMode === 'create' ? 'Create Account' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete / Deactivate Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteUser}
        title="Deactivate & Delete User"
        message={`Are you sure you want to deactivate and remove user ${deleteTarget?.email}? They will no longer be able to log into the CorpSec portal.`}
        confirmText="Deactivate User"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}
