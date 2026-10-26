'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Table, Column } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import {
  Users,
  UserPlus,
  Search,
  Download,
  Upload,
  Eye,
  Edit2,
  Filter,
  Shield,
  Activity,
  Archive,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { EmployeeData, BranchData, DepartmentData, StationData } from '@/types';

export default function EmployeesListPage() {
  const { success, error: toastError } = useToast();

  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [branches, setBranches] = useState<BranchData[]>([]);
  const [departments, setDepartments] = useState<DepartmentData[]>([]);
  const [stations, setStations] = useState<StationData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [stationFilter, setStationFilter] = useState('ALL');
  const [archivedFilter, setArchivedFilter] = useState(false);
  const [sortBy, setSortBy] = useState('employeeNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Status Change Modal State
  const [statusModalTarget, setStatusModalTarget] = useState<EmployeeData | null>(null);
  const [newStatus, setNewStatus] = useState('ACTIVE');
  const [statusReason, setStatusReason] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Archive / Restore Modal State
  const [archiveTarget, setArchiveTarget] = useState<EmployeeData | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);

  const [restoreTarget, setRestoreTarget] = useState<EmployeeData | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<any | null>(null);

  useEffect(() => {
    loadOrgUnits();
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [page, statusFilter, typeFilter, deptFilter, branchFilter, stationFilter, archivedFilter, sortBy, sortOrder]);

  const loadOrgUnits = async () => {
    try {
      const [bRes, dRes, sRes] = await Promise.all([
        fetch('/api/branches'),
        fetch('/api/departments'),
        fetch('/api/stations'),
      ]);
      const bData = await bRes.json();
      const dData = await dRes.json();
      const sData = await sRes.json();

      if (bData.success) setBranches(bData.data);
      if (dData.success) setDepartments(dData.data);
      if (sData.success) setStations(sData.data);
    } catch (err) {
      console.error('Failed to load organization reference units:', err);
    }
  };

  const fetchEmployees = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        sortBy,
        sortOrder,
      });

      if (search) params.set('search', search);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (typeFilter !== 'ALL') params.set('type', typeFilter);
      if (deptFilter !== 'ALL') params.set('departmentId', deptFilter);
      if (branchFilter !== 'ALL') params.set('branchId', branchFilter);
      if (stationFilter !== 'ALL') params.set('stationId', stationFilter);
      if (archivedFilter) params.set('isArchived', 'true');

      const res = await fetch(`/api/employees?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setEmployees(data.data);
        setTotal(data.meta?.total || 0);
      } else {
        toastError('Access Denied', data.error?.message || 'Cannot fetch employee directory.');
      }
    } catch (err) {
      console.error('Fetch employees error:', err);
      toastError('Error', 'Failed to retrieve employee directory.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchEmployees();
  };

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (deptFilter !== 'ALL') params.set('departmentId', deptFilter);
    if (branchFilter !== 'ALL') params.set('branchId', branchFilter);
    window.open(`/api/employees/export?${params.toString()}`, '_blank');
  };

  const handleStatusChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusModalTarget) return;

    try {
      setIsUpdatingStatus(true);
      const res = await fetch(`/api/employees/${statusModalTarget.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          reason: statusReason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Status Update Failed', data.error?.message || 'Error updating status');
        setIsUpdatingStatus(false);
        return;
      }

      success('Status Updated', `Employee status changed to ${newStatus}.`);
      setStatusModalTarget(null);
      setStatusReason('');
      fetchEmployees();
    } catch (err) {
      toastError('Error', 'Network error while changing status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleArchiveSubmit = async () => {
    if (!archiveTarget) return;

    try {
      setIsArchiving(true);
      const res = await fetch(`/api/employees/${archiveTarget.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: archiveReason || 'Archived via Employee Directory' }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Archive Failed', data.error?.message || 'Could not archive employee');
        setIsArchiving(false);
        return;
      }

      success('Employee Archived', `${archiveTarget.fullName} has been archived.`);
      setArchiveTarget(null);
      setArchiveReason('');
      fetchEmployees();
    } catch (err) {
      toastError('Error', 'Network error.');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleRestoreSubmit = async () => {
    if (!restoreTarget) return;

    try {
      setIsRestoring(true);
      const res = await fetch(`/api/employees/${restoreTarget.id}/restore`, {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Restore Failed', data.error?.message || 'Could not restore employee');
        setIsRestoring(false);
        return;
      }

      success('Employee Restored', `${restoreTarget.fullName} restored to active directory.`);
      setRestoreTarget(null);
      fetchEmployees();
    } catch (err) {
      toastError('Error', 'Network error.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importCsvText.trim()) return;

    try {
      setIsImporting(true);
      setImportResults(null);

      // Parse CSV text to objects
      const lines = importCsvText.trim().split('\n');
      if (lines.length < 2) {
        toastError('Invalid CSV', 'CSV must contain a header row and at least one data row.');
        setIsImporting(false);
        return;
      }

      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
      const records = lines.slice(1).map((line) => {
        const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
        const obj: any = {};
        headers.forEach((h, i) => {
          obj[h] = values[i] || '';
        });
        return obj;
      });

      const res = await fetch('/api/employees/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setImportResults(data.error?.details || { message: data.error?.message });
        toastError('Import Errors', data.error?.message || 'Validation errors in CSV');
        setIsImporting(false);
        return;
      }

      success('Import Complete', data.data.message);
      setImportResults(data.data);
      setIsImporting(false);
      fetchEmployees();
    } catch (err) {
      toastError('Import Error', 'Failed to execute import.');
      setIsImporting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success" size="sm" dot>Active</Badge>;
      case 'ON_LEAVE':
        return <Badge variant="warning" size="sm" dot>On Leave</Badge>;
      case 'SUSPENDED':
        return <Badge variant="danger" size="sm" dot>Suspended</Badge>;
      case 'TERMINATED':
        return <Badge variant="danger" size="sm">Terminated</Badge>;
      case 'RESIGNED':
        return <Badge variant="neutral" size="sm">Resigned</Badge>;
      case 'RETIRED':
        return <Badge variant="neutral" size="sm">Retired</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{status}</Badge>;
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const columns: Column<EmployeeData>[] = [
    {
      header: 'Employee No.',
      accessor: (emp) => (
        <div>
          <strong style={{ color: '#0f1c3f', fontSize: '0.8125rem' }}>{emp.employeeNumber}</strong>
          <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>ID: {emp.nationalId}</div>
        </div>
      ),
      width: '130px',
    },
    {
      header: 'Employee Name & Contact',
      accessor: (emp) => (
        <div>
          <Link
            href={`/hr/employees/${emp.id}`}
            style={{ fontWeight: 600, color: '#0f172a', textDecoration: 'none' }}
          >
            {emp.fullName}
          </Link>
          <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', gap: '0.5rem' }}>
            <span>{emp.primaryPhone}</span>
            {emp.email && <span>&bull; {emp.email}</span>}
          </div>
        </div>
      ),
    },
    {
      header: 'Job Title & Type',
      accessor: (emp) => (
        <div>
          <div style={{ fontWeight: 500, color: '#0f172a' }}>{emp.jobTitle}</div>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'capitalize' }}>
            {emp.employmentType.toLowerCase().replace('_', ' ')}
          </div>
        </div>
      ),
    },
    {
      header: 'Department / Branch / Station',
      accessor: (emp) => (
        <div style={{ fontSize: '0.75rem' }}>
          <div style={{ color: '#0f172a', fontWeight: 500 }}>
            {emp.department?.name || <span style={{ color: '#94a3b8' }}>No Dept</span>}
          </div>
          <div style={{ color: '#64748b' }}>
            {emp.branch?.code || 'HQ'} &bull; {emp.station?.name || 'Unassigned Station'}
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (emp) => (
        <div>
          {getStatusBadge(emp.employmentStatus)}
          {emp.isArchived && (
            <span style={{ fontSize: '0.625rem', color: '#dc2626', display: 'block', marginTop: '2px' }}>
              Archived
            </span>
          )}
        </div>
      ),
      width: '110px',
    },
    {
      header: 'Employed Since',
      accessor: (emp) => (
        <span style={{ fontSize: '0.75rem', color: '#475569' }}>
          {new Date(emp.employmentDate).toLocaleDateString()}
        </span>
      ),
      width: '110px',
    },
    {
      header: 'Actions',
      align: 'right',
      accessor: (emp) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.375rem' }}>
          <Link href={`/hr/employees/${emp.id}`} style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm" leftIcon={<Eye size={13} />}>
              View
            </Button>
          </Link>
          <Link href={`/hr/employees/${emp.id}/edit`} style={{ textDecoration: 'none' }}>
            <Button variant="ghost" size="sm" leftIcon={<Edit2 size={13} />}>
              Edit
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusModalTarget(emp);
              setNewStatus(emp.employmentStatus);
            }}
            title="Change Status"
          >
            <Activity size={14} color="#d97706" />
          </Button>
          {emp.isArchived ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRestoreTarget(emp)}
              title="Restore from Archive"
              style={{ color: '#059669' }}
            >
              <RotateCcw size={14} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setArchiveTarget(emp)}
              title="Archive Employee"
              style={{ color: '#dc2626' }}
            >
              <Archive size={14} />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <Breadcrumb items={[{ label: 'HR Management', href: '/hr' }, { label: 'Employee Directory' }]} />

      {/* Page Header */}
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
            Employee Master Directory
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
            Central personnel records, security station deployment assignments, and bio-data.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
          <Button
            variant="outline"
            size="md"
            onClick={handleExportCsv}
            leftIcon={<Download size={15} />}
          >
            Export CSV
          </Button>

          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              setIsImportModalOpen(true);
              setImportResults(null);
            }}
            leftIcon={<Upload size={15} />}
          >
            Import CSV
          </Button>

          <Link href="/hr/employees/new" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="md" leftIcon={<UserPlus size={16} />}>
              Add New Employee
            </Button>
          </Link>
        </div>
      </div>

      <Card noPadding>
        {/* Search and Multi-Criteria Filters Bar */}
        <div
          style={{
            padding: '1.25rem',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {/* Top Search Bar */}
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', maxWidth: '460px' }}>
            <Input
              placeholder="Search by name, employee #, national ID, phone, job title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search size={16} />}
            />
            <Button type="submit" variant="secondary" size="md">
              Search
            </Button>
          </form>

          {/* Filter Dropdowns Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
              alignItems: 'center',
            }}
          >
            {/* Status Filter */}
            <div>
              <label style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.65rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.8125rem',
                  color: '#0f172a',
                  outline: 'none',
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="ON_LEAVE">On Leave</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="TERMINATED">Terminated</option>
                <option value="RESIGNED">Resigned</option>
                <option value="RETIRED">Retired</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>

            {/* Department Filter */}
            <div>
              <label style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>
                Department
              </label>
              <select
                value={deptFilter}
                onChange={(e) => {
                  setDeptFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.65rem',
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
            </div>

            {/* Branch Filter */}
            <div>
              <label style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>
                Branch
              </label>
              <select
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.65rem',
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
            </div>

            {/* Station Filter */}
            <div>
              <label style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>
                Guarding Station
              </label>
              <select
                value={stationFilter}
                onChange={(e) => {
                  setStationFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.65rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.8125rem',
                  color: '#0f172a',
                  outline: 'none',
                }}
              >
                <option value="ALL">All Stations</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Archived Filter Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.2rem' }}>
              <input
                type="checkbox"
                id="archivedToggle"
                checked={archivedFilter}
                onChange={(e) => {
                  setArchivedFilter(e.target.checked);
                  setPage(1);
                }}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="archivedToggle" style={{ fontSize: '0.8125rem', color: '#475569', cursor: 'pointer' }}>
                Show Archived Records
              </label>
            </div>
          </div>
        </div>

        {/* Directory Table */}
        <Table
          columns={columns}
          data={employees}
          keyExtractor={(e) => e.id}
          isLoading={isLoading}
          emptyText="No employee records found matching your filter criteria."
        />

        <div style={{ padding: '0 1.25rem' }}>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={total}
            pageSize={pageSize}
          />
        </div>
      </Card>

      {/* Change Employment Status Modal */}
      <Modal
        isOpen={statusModalTarget !== null}
        onClose={() => setStatusModalTarget(null)}
        title="Transition Employment Status"
        subtitle={`Employee: ${statusModalTarget?.fullName} (${statusModalTarget?.employeeNumber})`}
        maxWidth="480px"
      >
        <form onSubmit={handleStatusChangeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.35rem' }}>
              New Employment Status:
            </label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.875rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.875rem',
                color: '#0f172a',
                outline: 'none',
              }}
            >
              <option value="ACTIVE">ACTIVE — Active Duty</option>
              <option value="ON_LEAVE">ON_LEAVE — Authorized Leave</option>
              <option value="SUSPENDED">SUSPENDED — Disciplinary / Investigation</option>
              <option value="TERMINATED">TERMINATED — Contract Terminated</option>
              <option value="RESIGNED">RESIGNED — Voluntary Resignation</option>
              <option value="RETIRED">RETIRED — Age / Medical Retirement</option>
              <option value="INACTIVE">INACTIVE — Inactive</option>
            </select>
          </div>

          <Input
            label="Reason / Justification for Status Change"
            requiredIndicator
            value={statusReason}
            onChange={(e) => setStatusReason(e.target.value)}
            placeholder="e.g. Approved 21-day annual leave from Aug 15"
            helperText="This reason will be permanently recorded in the employee career timeline."
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setStatusModalTarget(null)}
              disabled={isUpdatingStatus}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isUpdatingStatus}>
              Apply Status Change
            </Button>
          </div>
        </form>
      </Modal>

      {/* Archive Confirmation Dialog */}
      <Modal
        isOpen={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        title="Archive Employee Record"
        subtitle={`Employee: ${archiveTarget?.fullName} (${archiveTarget?.employeeNumber})`}
        maxWidth="480px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.5 }}>
            Archiving moves this employee to the inactive archive. Historical payroll and attendance records will remain preserved for compliance.
          </p>

          <Input
            label="Reason for Archival"
            requiredIndicator
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
            placeholder="e.g. Resigned to pursue further studies"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem' }}>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setArchiveTarget(null)}
              disabled={isArchiving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              onClick={handleArchiveSubmit}
              isLoading={isArchiving}
            >
              Archive Employee
            </Button>
          </div>
        </div>
      </Modal>

      {/* Restore Confirmation Dialog */}
      <ConfirmDialog
        isOpen={restoreTarget !== null}
        onClose={() => setRestoreTarget(null)}
        onConfirm={handleRestoreSubmit}
        title="Restore Employee Record"
        message={`Are you sure you want to restore ${restoreTarget?.fullName} (${restoreTarget?.employeeNumber}) back to the active directory?`}
        confirmText="Restore to Directory"
        variant="primary"
        isLoading={isRestoring}
      />

      {/* CSV Batch Import Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Bulk Employee CSV Import"
        subtitle="Paste or upload CSV formatted employee master data"
        maxWidth="640px"
      >
        <form onSubmit={handleImportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            style={{
              padding: '0.75rem',
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              fontSize: '0.75rem',
              color: '#475569',
            }}
          >
            <strong>Required CSV Headers:</strong>
            <code style={{ display: 'block', marginTop: '0.25rem', color: '#0f1c3f' }}>
              firstName,lastName,nationalId,primaryPhone,jobTitle,gender,employmentType,branchCode,departmentCode
            </code>
          </div>

          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.35rem' }}>
              Paste CSV Content:
            </label>
            <textarea
              rows={8}
              value={importCsvText}
              onChange={(e) => setImportCsvText(e.target.value)}
              placeholder="firstName,lastName,nationalId,primaryPhone,jobTitle,gender,employmentType,branchCode,departmentCode&#10;Samuel,Kariuki,34918274,+254711223344,Armed Guard,MALE,PERMANENT,HQ-NRB,SEC-OPS"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.8125rem',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
          </div>

          {importResults && (
            <div
              style={{
                padding: '0.875rem',
                borderRadius: '8px',
                backgroundColor: importResults.errorsCount ? '#fffbeb' : '#ecfdf5',
                border: `1px solid ${importResults.errorsCount ? '#fde68a' : '#a7f3d0'}`,
                fontSize: '0.8125rem',
              }}
            >
              {importResults.importedCount !== undefined && (
                <div style={{ color: '#065f46', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Successfully imported: {importResults.importedCount} records.
                </div>
              )}
              {importResults.errors && importResults.errors.length > 0 && (
                <div style={{ color: '#92400e' }}>
                  <strong>Errors ({importResults.errors.length}):</strong>
                  <ul style={{ paddingLeft: '1.25rem', marginTop: '0.25rem' }}>
                    {importResults.errors.map((err: any, idx: number) => (
                      <li key={idx}>
                        Row {err.row}: {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setIsImportModalOpen(false)}
              disabled={isImporting}
            >
              Close
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isImporting}>
              Run Batch Import
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
