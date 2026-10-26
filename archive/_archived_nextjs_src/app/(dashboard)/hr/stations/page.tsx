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
  MapPin,
  Plus,
  Search,
  Eye,
  Edit2,
  Power,
  Shield,
  Users,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { StationData, BranchData, EmployeeData } from '@/types';

export default function StationsPage() {
  const { success, error: toastError } = useToast();

  const [stations, setStations] = useState<StationData[]>([]);
  const [branches, setBranches] = useState<BranchData[]>([]);
  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [branchFilter, setBranchFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStation, setEditingStation] = useState<StationData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    clientLocationName: '',
    physicalLocation: '',
    county: 'Nairobi',
    townCity: 'Nairobi',
    address: '',
    branchId: '',
    supervisorId: '',
    requiredStaffing: 10,
    isActive: true,
  });

  // Deactivate confirmation
  const [toggleTarget, setToggleTarget] = useState<StationData | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    fetchStations();
    fetchBranches();
    fetchEmployees();
  }, [statusFilter, branchFilter]);

  const fetchStations = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (branchFilter !== 'ALL') params.set('branchId', branchFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/stations?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setStations(data.data);
      } else {
        toastError('Error', data.error?.message || 'Failed to fetch guarding stations');
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
      if (data.success) {
        setBranches(data.data);
      }
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
    fetchStations();
  };

  const openCreateModal = () => {
    setEditingStation(null);
    setFormData({
      code: '',
      name: '',
      clientLocationName: '',
      physicalLocation: '',
      county: 'Nairobi',
      townCity: 'Nairobi',
      address: '',
      branchId: branches[0]?.id || '',
      supervisorId: '',
      requiredStaffing: 10,
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (station: StationData) => {
    setEditingStation(station);
    setFormData({
      code: station.code,
      name: station.name,
      clientLocationName: station.clientLocationName || '',
      physicalLocation: station.physicalLocation || '',
      county: station.county || 'Nairobi',
      townCity: station.townCity || 'Nairobi',
      address: station.address || '',
      branchId: station.branchId || '',
      supervisorId: station.supervisorId || '',
      requiredStaffing: station.requiredStaffing || 0,
      isActive: station.isActive,
    });
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const url = editingStation ? `/api/stations/${editingStation.id}` : '/api/stations';
      const method = editingStation ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Failed', data.error?.message || 'Error saving station');
        setIsSubmitting(false);
        return;
      }

      success('Station Saved', `Station ${data.data.name} saved successfully.`);
      setIsModalOpen(false);
      fetchStations();
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
      const res = await fetch(`/api/stations/${toggleTarget.id}`, {
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

      success('Status Updated', `Station is now ${data.data.isActive ? 'Active' : 'Inactive'}.`);
      setToggleTarget(null);
      fetchStations();
    } catch (err) {
      toastError('Error', 'Network error.');
    } finally {
      setIsToggling(false);
    }
  };

  const columns: Column<StationData>[] = [
    {
      header: 'Station Code & Name',
      accessor: (s) => (
        <div>
          <Link
            href={`/hr/stations/${s.id}`}
            style={{ fontWeight: 700, color: '#0f1c3f', fontSize: '0.875rem', textDecoration: 'none' }}
          >
            {s.name}
          </Link>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            <span style={{ fontWeight: 600, color: '#d97706' }}>{s.code}</span>
            {s.clientLocationName && <span> &bull; {s.clientLocationName}</span>}
          </div>
        </div>
      ),
    },
    {
      header: 'Branch & Location',
      accessor: (s) => (
        <div style={{ fontSize: '0.8125rem', color: '#475569' }}>
          <div>{s.branch?.name || 'Nairobi HQ'}</div>
          <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{s.physicalLocation || s.county || 'Nairobi'}</div>
        </div>
      ),
    },
    {
      header: 'Station Supervisor',
      accessor: (s) => (
        <div style={{ fontSize: '0.8125rem' }}>
          {s.supervisor ? (
            <div style={{ fontWeight: 600, color: '#0f172a' }}>
              {s.supervisor.fullName}
              <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{s.supervisor.jobTitle}</div>
            </div>
          ) : (
            <span style={{ color: '#94a3b8' }}>Unassigned</span>
          )}
        </div>
      ),
    },
    {
      header: 'Staffing Quota & Deficit',
      accessor: (s) => {
        const current = s.currentStaffing ?? (s._count?.employees || 0);
        const required = s.requiredStaffing;
        const diff = s.staffingDifference ?? (required - current);
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Badge variant="gold" size="sm">
                {current} / {required} Guards
              </Badge>
              {diff > 0 && (
                <Badge variant="warning" size="sm">
                  Shortage: -{diff}
                </Badge>
              )}
              {diff <= 0 && required > 0 && (
                <Badge variant="success" size="sm">
                  Full
                </Badge>
              )}
            </div>
          </div>
        );
      },
    },
    {
      header: 'Status',
      accessor: (s) => (
        <Badge variant={s.isActive ? 'success' : 'neutral'} size="sm" dot={s.isActive}>
          {s.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
      width: '100px',
    },
    {
      header: 'Actions',
      align: 'right',
      accessor: (s) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.375rem' }}>
          <Link href={`/hr/stations/${s.id}`} style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm" leftIcon={<Eye size={13} />}>
              Profile
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => openEditModal(s)}>
            <Edit2 size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setToggleTarget(s)}
            title={s.isActive ? 'Deactivate Station' : 'Activate Station'}
            style={{ color: s.isActive ? '#dc2626' : '#059669' }}
          >
            <Power size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <Breadcrumb items={[{ label: 'Organization', href: '/hr' }, { label: 'Guarding Stations' }]} />

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
            Security Guarding Stations & Outposts
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
            Client security locations, guard deployment posts, and staffing quota capacity tracking.
          </p>
        </div>

        <Button variant="primary" size="md" onClick={openCreateModal} leftIcon={<Plus size={16} />}>
          Add New Station
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
              placeholder="Search by station name, code, or client site..."
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
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.8125rem',
                color: '#0f172a',
                outline: 'none',
              }}
            >
              <option value="ALL">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
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
          data={stations}
          keyExtractor={(s) => s.id}
          isLoading={isLoading}
          emptyText="No guarding station records found."
        />
      </Card>

      {/* Create / Edit Station Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingStation ? 'Edit Guarding Station' : 'Register New Guarding Station'}
        subtitle="Configure client deployment location, required guard quota, and supervisor"
        maxWidth="560px"
      >
        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
            <Input
              label="Station Code"
              requiredIndicator
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="e.g. STN-CBD01"
            />
            <Input
              label="Station Name"
              requiredIndicator
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Nairobi Central Guarding Station"
            />
          </div>

          <Input
            label="Client / Site Name"
            value={formData.clientLocationName}
            onChange={(e) => setFormData({ ...formData, clientLocationName: e.target.value })}
            placeholder="e.g. Commercial Banking & Corporate Towers Zone"
          />

          <Input
            label="Physical Location / Street"
            value={formData.physicalLocation}
            onChange={(e) => setFormData({ ...formData, physicalLocation: e.target.value })}
            placeholder="e.g. Mama Ngina & Wabera St, Nairobi"
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Select
              label="Operating Branch"
              requiredIndicator
              value={formData.branchId}
              onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
              options={branches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }))}
            />
            <Input
              label="Required Guard Quota"
              type="number"
              requiredIndicator
              value={formData.requiredStaffing}
              onChange={(e) => setFormData({ ...formData, requiredStaffing: parseInt(e.target.value, 10) || 0 })}
              helperText="Target number of active guards"
            />
          </div>

          <Select
            label="Station Supervisor"
            value={formData.supervisorId}
            onChange={(e) => setFormData({ ...formData, supervisorId: e.target.value })}
            options={[
              { value: '', label: 'Select station supervisor (optional)' },
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
              {editingStation ? 'Save Station' : 'Create Station'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Dialog for Activation / Deactivation */}
      <ConfirmDialog
        isOpen={toggleTarget !== null}
        onClose={() => setToggleTarget(null)}
        onConfirm={handleToggleStatus}
        title={toggleTarget?.isActive ? 'Deactivate Station' : 'Activate Station'}
        message={
          toggleTarget?.isActive
            ? `Deactivating "${toggleTarget?.name}" will prevent new guards from being assigned to this station. Existing guard assignments and historical records will remain intact.`
            : `Are you sure you want to activate "${toggleTarget?.name}"?`
        }
        confirmText={toggleTarget?.isActive ? 'Deactivate Station' : 'Activate Station'}
        variant={toggleTarget?.isActive ? 'danger' : 'primary'}
        isLoading={isToggling}
      />
    </div>
  );
}
