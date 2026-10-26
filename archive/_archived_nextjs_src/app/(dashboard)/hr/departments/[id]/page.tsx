'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Table, Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import {
  GitFork,
  ArrowLeft,
  Briefcase,
  Users,
  Eye,
  Building2,
} from 'lucide-react';
import { DepartmentData } from '@/types';

export default function DepartmentProfilePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { error: toastError } = useToast();

  const [department, setDepartment] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDepartment();
  }, [params.id]);

  const fetchDepartment = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/departments/${params.id}`);
      const data = await res.json();
      if (data.success) {
        setDepartment(data.data);
      } else {
        toastError('Not Found', data.error?.message || 'Department not found.');
      }
    } catch (err) {
      toastError('Error', 'Network error.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <Spinner fullHeight message="Loading department profile..." />;
  }

  if (!department) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <h2>Department record not found</h2>
        <Link href="/hr/departments">Return to Departments</Link>
      </div>
    );
  }

  const positionColumns: Column<any>[] = [
    {
      header: 'Position Code & Title',
      accessor: (p) => (
        <div>
          <Link
            href={`/hr/positions/${p.id}`}
            style={{ fontWeight: 600, color: '#0f1c3f', textDecoration: 'none' }}
          >
            {p.title}
          </Link>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            <span style={{ fontWeight: 600, color: '#d97706' }}>{p.code}</span> &bull;
            <span>{p.employmentCategory.toLowerCase().replace('_', ' ')}</span>
          </div>
        </div>
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
      header: 'Action',
      align: 'right',
      accessor: (p) => (
        <Link href={`/hr/positions/${p.id}`} style={{ textDecoration: 'none' }}>
          <Button variant="outline" size="sm" leftIcon={<Eye size={13} />}>
            View Position
          </Button>
        </Link>
      ),
    },
  ];

  const employeeColumns: Column<any>[] = [
    {
      header: 'Employee No & Name',
      accessor: (emp) => (
        <div>
          <Link
            href={`/hr/employees/${emp.id}`}
            style={{ fontWeight: 600, color: '#0f1c3f', textDecoration: 'none' }}
          >
            {emp.fullName}
          </Link>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            {emp.employeeNumber} &bull; {emp.jobTitle}
          </div>
        </div>
      ),
    },
    {
      header: 'Branch / Station Deployment',
      accessor: (emp) => (
        <div style={{ fontSize: '0.75rem', color: '#475569' }}>
          <div>{emp.branch?.name || 'Nairobi HQ'}</div>
          <div style={{ color: '#94a3b8' }}>{emp.station?.name || 'Field Floating'}</div>
        </div>
      ),
    },
    {
      header: 'Contact',
      accessor: (emp) => (
        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{emp.primaryPhone}</span>
      ),
    },
    {
      header: 'Status',
      accessor: (emp) => (
        <Badge variant={emp.employmentStatus === 'ACTIVE' ? 'success' : 'neutral'} size="sm" dot={emp.employmentStatus === 'ACTIVE'}>
          {emp.employmentStatus}
        </Badge>
      ),
      width: '100px',
    },
    {
      header: 'Action',
      align: 'right',
      accessor: (emp) => (
        <Link href={`/hr/employees/${emp.id}`} style={{ textDecoration: 'none' }}>
          <Button variant="ghost" size="sm" leftIcon={<Eye size={13} />}>
            Profile
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'Organization', href: '/hr' },
          { label: 'Departments', href: '/hr/departments' },
          { label: department.name },
        ]}
      />

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0f1c3f' }}>
              {department.name}
            </h1>
            <Badge variant="gold" size="sm">
              {department.code}
            </Badge>
            <Badge variant={department.isActive ? 'success' : 'neutral'} size="sm" dot={department.isActive}>
              {department.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
            {department.description || 'Functional organizational division'} &bull; Branch: {department.branch?.name || 'Head Office'}
          </p>
        </div>

        <Button variant="outline" size="md" onClick={() => router.back()} leftIcon={<ArrowLeft size={16} />}>
          Back to Departments
        </Button>
      </div>

      {/* Department Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Department Head
            </span>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f1c3f', marginTop: '0.35rem' }}>
              {department.departmentHead ? department.departmentHead.fullName : 'Not Appointed'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
              {department.departmentHead?.jobTitle || 'Executive Lead'}
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Department Personnel
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669', marginTop: '0.25rem' }}>
              {department._count?.employees || 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
              Active personnel in this department
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Registered Job Positions
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#d97706', marginTop: '0.25rem' }}>
              {department._count?.positions || 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
              Role designations in this unit
            </div>
          </div>
        </Card>
      </div>

      {/* Positions in Department */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <Card title={`Job Positions in ${department.name} (${department.positions?.length || 0})`}>
          <Table
            columns={positionColumns}
            data={department.positions || []}
            keyExtractor={(p) => p.id}
            emptyText="No positions configured for this department."
          />
        </Card>

        {/* Employees in Department */}
        <Card title={`Employees in ${department.name} (${department.employees?.length || 0})`}>
          <Table
            columns={employeeColumns}
            data={department.employees || []}
            keyExtractor={(emp) => emp.id}
            emptyText="No employees assigned to this department."
          />
        </Card>
      </div>
    </div>
  );
}
