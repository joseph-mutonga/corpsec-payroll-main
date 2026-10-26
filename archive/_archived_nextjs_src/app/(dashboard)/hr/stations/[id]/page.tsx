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
  MapPin,
  ArrowLeft,
  Shield,
  Users,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Building2,
} from 'lucide-react';
import { StationData } from '@/types';

export default function StationProfilePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { error: toastError } = useToast();

  const [station, setStation] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStation();
  }, [params.id]);

  const fetchStation = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/stations/${params.id}`);
      const data = await res.json();
      if (data.success) {
        setStation(data.data);
      } else {
        toastError('Not Found', data.error?.message || 'Station not found.');
      }
    } catch (err) {
      toastError('Error', 'Network error.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <Spinner fullHeight message="Loading station profile..." />;
  }

  if (!station) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <h2>Station record not found</h2>
        <Link href="/hr/stations">Return to Stations</Link>
      </div>
    );
  }

  const current = station.currentStaffing ?? 0;
  const required = station.requiredStaffing ?? 0;
  const diff = station.staffingDifference ?? (required - current);

  const guardColumns: Column<any>[] = [
    {
      header: 'Employee No & Guard Name',
      accessor: (emp) => (
        <div>
          <Link
            href={`/hr/employees/${emp.id}`}
            style={{ fontWeight: 600, color: '#0f1c3f', textDecoration: 'none' }}
          >
            {emp.fullName}
          </Link>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            {emp.employeeNumber} &bull; {emp.position?.title || emp.jobTitle}
          </div>
        </div>
      ),
    },
    {
      header: 'Employment Type',
      accessor: (emp) => (
        <span style={{ fontSize: '0.75rem', color: '#475569', textTransform: 'capitalize' }}>
          {emp.employmentType.toLowerCase().replace('_', ' ')}
        </span>
      ),
    },
    {
      header: 'Primary Contact',
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
          { label: 'Guarding Stations', href: '/hr/stations' },
          { label: station.name },
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
              {station.name}
            </h1>
            <Badge variant="gold" size="sm">
              {station.code}
            </Badge>
            <Badge variant={station.isActive ? 'success' : 'neutral'} size="sm" dot={station.isActive}>
              {station.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
            {station.clientLocationName || 'Client Site'} &bull; Branch: {station.branch?.name || 'HQ'}
          </p>
        </div>

        <Button variant="outline" size="md" onClick={() => router.back()} leftIcon={<ArrowLeft size={16} />}>
          Back to Stations
        </Button>
      </div>

      {/* Station Overview & Staffing Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Station Supervisor
            </span>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f1c3f', marginTop: '0.35rem' }}>
              {station.supervisor ? station.supervisor.fullName : 'Not Assigned'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
              {station.supervisor?.jobTitle || station.supervisor?.primaryPhone || '—'}
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Current Guard Staffing
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669', marginTop: '0.25rem' }}>
              {current} Guards
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
              Actively deployed personnel
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Required Quota Capacity
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', marginTop: '0.25rem' }}>
              {required} Guards
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
              Agreed client site capacity
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Staffing Deficit / Surplus
            </span>
            <div
              style={{
                fontSize: '1.5rem',
                fontWeight: 800,
                color: diff > 0 ? '#d97706' : '#059669',
                marginTop: '0.25rem',
              }}
            >
              {diff > 0 ? `-${diff} Shortage` : diff === 0 ? 'Full Quota' : `+${Math.abs(diff)} Surplus`}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
              Required ({required}) - Current ({current})
            </div>
          </div>
        </Card>
      </div>

      {/* Guard Roster at Station */}
      <Card title={`Guards Deployed to ${station.name} (${station.employees?.length || 0})`}>
        <Table
          columns={guardColumns}
          data={station.employees || []}
          keyExtractor={(emp) => emp.id}
          emptyText="No guards currently deployed to this station."
        />
      </Card>
    </div>
  );
}
