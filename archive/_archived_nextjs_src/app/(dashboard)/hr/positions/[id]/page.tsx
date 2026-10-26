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
  Briefcase,
  ArrowLeft,
  Users,
  Eye,
  GitFork,
} from 'lucide-react';
import { PositionData } from '@/types';

export default function PositionProfilePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { error: toastError } = useToast();

  const [position, setPosition] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchPosition();
  }, [params.id]);

  const fetchPosition = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/positions/${params.id}`);
      const data = await res.json();
      if (data.success) {
        setPosition(data.data);
      } else {
        toastError('Not Found', data.error?.message || 'Position not found.');
      }
    } catch (err) {
      toastError('Error', 'Network error.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <Spinner fullHeight message="Loading position profile..." />;
  }

  if (!position) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <h2>Job Position not found</h2>
        <Link href="/hr/positions">Return to Positions</Link>
      </div>
    );
  }

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
            {emp.employeeNumber} &bull; {emp.primaryPhone}
          </div>
        </div>
      ),
    },
    {
      header: 'Assigned Branch / Station',
      accessor: (emp) => (
        <div style={{ fontSize: '0.75rem', color: '#475569' }}>
          <div>{emp.branch?.name || 'Nairobi HQ'}</div>
          <div style={{ color: '#94a3b8' }}>{emp.station?.name || 'Field Floating'}</div>
        </div>
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
          { label: 'Job Positions', href: '/hr/positions' },
          { label: position.title },
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
              {position.title}
            </h1>
            <Badge variant="gold" size="sm">
              {position.code}
            </Badge>
            <Badge variant={position.isActive ? 'success' : 'neutral'} size="sm" dot={position.isActive}>
              {position.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
            Department: <strong>{position.department?.name}</strong> &bull; Category:{' '}
            <span style={{ textTransform: 'capitalize' }}>
              {position.employmentCategory.toLowerCase().replace('_', ' ')}
            </span>
          </p>
        </div>

        <Button variant="outline" size="md" onClick={() => router.back()} leftIcon={<ArrowLeft size={16} />}>
          Back to Positions
        </Button>
      </div>

      {/* Position Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Department
            </span>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f1c3f', marginTop: '0.35rem' }}>
              {position.department?.name || 'Unassigned'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
              {position.department?.code || '—'}
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Active Staff in this Role
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669', marginTop: '0.25rem' }}>
              {position.employees?.length || 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
              Active personnel with this position
            </div>
          </div>
        </Card>
      </div>

      {/* Employees with this position */}
      <Card title={`Employees in "${position.title}" (${position.employees?.length || 0})`}>
        <Table
          columns={employeeColumns}
          data={position.employees || []}
          keyExtractor={(emp) => emp.id}
          emptyText="No active employees currently holding this position."
        />
      </Card>
    </div>
  );
}
