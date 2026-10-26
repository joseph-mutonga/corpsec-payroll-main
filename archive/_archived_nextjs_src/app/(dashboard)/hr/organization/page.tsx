'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import {
  Building2,
  GitFork,
  MapPin,
  Briefcase,
  Users,
  ChevronRight,
  ChevronDown,
  Shield,
  Layers,
  ArrowRight,
} from 'lucide-react';

export default function OrganizationHierarchyPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedBranches, setExpandedBranches] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadHierarchy();
  }, []);

  const loadHierarchy = async () => {
    try {
      setIsLoading(true);
      const [bRes, dRes, sRes, pRes] = await Promise.all([
        fetch('/api/branches'),
        fetch('/api/departments'),
        fetch('/api/stations'),
        fetch('/api/positions'),
      ]);

      const bData = await bRes.json();
      const dData = await dRes.json();
      const sData = await sRes.json();
      const pData = await pRes.json();

      if (bData.success) {
        setBranches(bData.data);
        const initExpanded: Record<string, boolean> = {};
        bData.data.forEach((b: any) => {
          initExpanded[b.id] = true;
        });
        setExpandedBranches(initExpanded);
      }
      if (dData.success) setDepartments(dData.data);
      if (sData.success) setStations(sData.data);
      if (pData.success) setPositions(pData.data);
    } catch (err) {
      console.error('Failed to load organizational tree:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleBranch = (id: string) => {
    setExpandedBranches((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (isLoading) {
    return <Spinner fullHeight message="Loading organizational hierarchy..." />;
  }

  return (
    <div className="animate-fade-in">
      <Breadcrumb items={[{ label: 'Organization', href: '/hr' }, { label: 'Organizational Structure' }]} />

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
            Corporate Organizational Structure
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
            Interactive hierarchy: Company &rarr; Regional Branches &rarr; Departments &amp; Guarding Stations &rarr; Job Positions.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href="/hr/branches" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm">
              Branches
            </Button>
          </Link>
          <Link href="/hr/departments" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm">
              Departments
            </Button>
          </Link>
          <Link href="/hr/stations" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm">
              Stations
            </Button>
          </Link>
          <Link href="/hr/positions" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm">
              Positions
            </Button>
          </Link>
        </div>
      </div>

      {/* Root Company Node */}
      <Card noPadding style={{ marginBottom: '1.5rem', backgroundColor: '#0f1c3f', color: '#ffffff' }}>
        <div style={{ padding: '1.5rem 1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '10px',
                backgroundColor: 'var(--corp-gold-500)',
                color: '#0f1c3f',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1.25rem',
              }}
            >
              CS
            </div>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                CorpSec Investigations &amp; Guarding Services
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#cbd5e1' }}>
                Corporate Headquarters &bull; Kenya National Security Operations
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Badge variant="gold" size="md">
              {branches.length} Operating Branches
            </Badge>
            <Badge variant="neutral" size="md">
              {departments.length} Departments
            </Badge>
            <Badge variant="neutral" size="md">
              {stations.length} Guarding Stations
            </Badge>
          </div>
        </div>
      </Card>

      {/* Branch Hierarchy Tree */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {branches.map((branch) => {
          const branchStations = stations.filter((s) => s.branchId === branch.id);
          const isExpanded = expandedBranches[branch.id] ?? true;

          return (
            <Card key={branch.id} noPadding>
              {/* Branch Header Row */}
              <div
                style={{
                  padding: '1.25rem 1.5rem',
                  backgroundColor: '#f8fafc',
                  borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
                onClick={() => toggleBranch(branch.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                  <div style={{ color: '#0f1c3f' }}>
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </div>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      backgroundColor: '#eff6ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#2563eb',
                    }}
                  >
                    <Building2 size={18} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '0.9375rem', color: '#0f172a' }}>{branch.name}</strong>
                      <Badge variant="gold" size="sm">{branch.code}</Badge>
                      <Badge variant={branch.isActive ? 'success' : 'neutral'} size="sm" dot={branch.isActive}>
                        {branch.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                      {branch.location || branch.townCity} &bull; Manager:{' '}
                      <strong>{branch.branchManager ? branch.branchManager.fullName : 'Unassigned'}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Badge variant="neutral" size="sm">
                    {branch._count?.employees || 0} Staff
                  </Badge>
                  <Link href={`/hr/branches/${branch.id}`} onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none' }}>
                    <Button variant="ghost" size="sm" rightIcon={<ArrowRight size={13} />}>
                      View
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Branch Sub-Entities */}
              {isExpanded && (
                <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Stations under Branch */}
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <MapPin size={14} color="#d97706" />
                      Guarding Stations &amp; Client Posts ({branchStations.length})
                    </div>

                    {branchStations.length > 0 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
                        {branchStations.map((stn) => {
                          const diff = stn.staffingDifference ?? (stn.requiredStaffing - (stn.currentStaffing || 0));
                          return (
                            <div
                              key={stn.id}
                              style={{
                                padding: '0.875rem 1rem',
                                backgroundColor: '#ffffff',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.35rem',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Link
                                  href={`/hr/stations/${stn.id}`}
                                  style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#0f1c3f', textDecoration: 'none' }}
                                >
                                  {stn.name}
                                </Link>
                                <Badge variant="neutral" size="sm">{stn.code}</Badge>
                              </div>
                              <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                                {stn.clientLocationName || 'Client Site'}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.35rem' }}>
                                <span style={{ fontSize: '0.75rem', color: '#475569' }}>
                                  Supervisor: {stn.supervisor?.fullName ? stn.supervisor.fullName.split(' ')[0] : 'None'}
                                </span>
                                <Badge variant={diff > 0 ? 'warning' : 'success'} size="sm">
                                  {stn.currentStaffing || 0}/{stn.requiredStaffing} Guards
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No guarding stations assigned to this branch.</p>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Departments & Position Overview Grid */}
      <div style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0f1c3f', marginBottom: '1rem' }}>
          Functional Departments &amp; Position Catalog
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {departments.map((dept) => {
            const deptPositions = positions.filter((p) => p.departmentId === dept.id);
            return (
              <Card key={dept.id} title={dept.name} subtitle={`Code: ${dept.code} • Head: ${dept.departmentHead ? dept.departmentHead.fullName : 'Unassigned'}`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {deptPositions.map((pos) => (
                    <div
                      key={pos.id}
                      style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: '#f8fafc',
                        borderRadius: '6px',
                        border: '1px solid #f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '0.8125rem', color: '#0f172a' }}>{pos.title}</strong>
                        <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{pos.code}</div>
                      </div>
                      <Badge variant="gold" size="sm">
                        {pos._count?.employees || 0} Staff
                      </Badge>
                    </div>
                  ))}

                  {deptPositions.length === 0 && (
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No job positions created for this department.</p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
