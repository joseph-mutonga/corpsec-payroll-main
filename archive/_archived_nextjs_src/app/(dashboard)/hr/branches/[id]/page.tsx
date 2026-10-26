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
  Building2,
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  Users,
  Shield,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import { BranchData } from '@/types';

export default function BranchProfilePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { error: toastError } = useToast();

  const [branch, setBranch] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchBranch();
  }, [params.id]);

  const fetchBranch = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/branches/${params.id}`);
      const data = await res.json();
      if (data.success) {
        setBranch(data.data);
      } else {
        toastError('Not Found', data.error?.message || 'Branch not found.');
      }
    } catch (err) {
      toastError('Error', 'Network error.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <Spinner fullHeight message="Loading branch profile..." />;
  }

  if (!branch) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <h2>Branch record not found</h2>
        <Link href="/hr/branches">Return to Branches</Link>
      </div>
    );
  }

  const stationColumns: Column<any>[] = [
    {
      header: 'Station Code & Name',
      accessor: (s) => (
        <div>
          <Link
            href={`/hr/stations/${s.id}`}
            style={{ fontWeight: 600, color: '#0f1c3f', textDecoration: 'none' }}
          >
            {s.name}
          </Link>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            {s.code} &bull; {s.clientLocationName || 'Client Site'}
          </div>
        </div>
      ),
    },
    {
      header: 'Guard Quota & Deployment',
      accessor: (s) => {
        const current = s._count?.employees || 0;
        const required = s.requiredStaffing || 0;
        const diff = required - current;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Badge variant="neutral" size="sm">
              {current} / {required} Guards
            </Badge>
            {diff > 0 && (
              <Badge variant="warning" size="sm">
                Shortage: {diff}
              </Badge>
            )}
            {diff <= 0 && required > 0 && (
              <Badge variant="success" size="sm">
                Full Quota
              </Badge>
            )}
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
      header: 'Action',
      align: 'right',
      accessor: (s) => (
        <Link href={`/hr/stations/${s.id}`} style={{ textDecoration: 'none' }}>
          <Button variant="outline" size="sm" leftIcon={<Eye size={13} />}>
            View Station
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
      header: 'Station / Department',
      accessor: (emp) => (
        <div style={{ fontSize: '0.75rem', color: '#475569' }}>
          <div>{emp.station?.name || 'HQ / Unassigned Station'}</div>
          <div style={{ color: '#94a3b8' }}>{emp.department?.name}</div>
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
          { label: 'Operating Branches', href: '/hr/branches' },
          { label: branch.name },
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
              {branch.name}
            </h1>
            <Badge variant="gold" size="sm">
              {branch.code}
            </Badge>
            <Badge variant={branch.isActive ? 'success' : 'neutral'} size="sm" dot={branch.isActive}>
              {branch.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
            {branch.location || branch.townCity} &bull; County: {branch.county || 'Nairobi'}
          </p>
        </div>

        <Button variant="outline" size="md" onClick={() => router.back()} leftIcon={<ArrowLeft size={16} />}>
          Back to Branches
        </Button>
      </div>

      {/* Branch Header Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Branch Manager
            </span>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f1c3f', marginTop: '0.35rem' }}>
              {branch.branchManager ? branch.branchManager.fullName : 'Not Assigned'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
              {branch.branchManager?.jobTitle || branch.phone || '—'}
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Total Deployed Staff
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669', marginTop: '0.25rem' }}>
              {branch._count?.employees || 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
              Active personnel in this branch
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Guarding Stations
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#d97706', marginTop: '0.25rem' }}>
              {branch._count?.stations || 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
              Client sites & operational posts
            </div>
          </div>
        </Card>
      </div>

      {/* Stations in Branch */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <Card title={`Guarding Stations in ${branch.name} (${branch.stations?.length || 0})`}>
          <Table
            columns={stationColumns}
            data={branch.stations || []}
            keyExtractor={(s) => s.id}
            emptyText="No guarding stations registered under this branch yet."
          />
        </Card>

        {/* Employees in Branch */}
        <Card title={`Employees Deployed to ${branch.name} (${branch.employees?.length || 0})`}>
          <Table
            columns={employeeColumns}
            data={branch.employees || []}
            keyExtractor={(emp) => emp.id}
            emptyText="No employees currently assigned to this branch."
          />
        </Card>
      </div>
    </div>
  );
}
