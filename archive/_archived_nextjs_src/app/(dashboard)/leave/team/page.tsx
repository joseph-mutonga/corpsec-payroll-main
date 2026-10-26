'use client';

import React, { useState, useEffect } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { Users, Phone, Calendar, CheckCircle2, Clock, AlertTriangle, XCircle, Shield } from 'lucide-react';

export default function TeamAvailabilityPage() {
  const { toastError } = useToast() as any;
  const [team, setTeam] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    fetchTeam();
  }, [departmentFilter]);

  const fetchDepartments = async () => {
    try {
      const res = await fetch('/api/departments');
      const json = await res.json();
      if (json.success) setDepartments(json.data.departments || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTeam = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (departmentFilter !== 'ALL') params.append('departmentId', departmentFilter);

      const res = await fetch(`/api/leave/team?${params.toString()}`);
      const json = await res.json();
      if (json.success) setTeam(json.data.team);
    } catch (err) {
      console.error('Failed to load team availability', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTeam = team.filter((member) => {
    if (statusFilter === 'ALL') return true;
    return member.status === statusFilter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return <Badge variant="success">AVAILABLE ON DUTY</Badge>;
      case 'ON_LEAVE':
        return <Badge variant="warning">ON LEAVE</Badge>;
      case 'PENDING_LEAVE':
        return <Badge variant="info">PENDING LEAVE</Badge>;
      case 'ABSENT':
        return <Badge variant="danger">ABSENT</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const countAvailable = team.filter((m) => m.status === 'AVAILABLE').length;
  const countOnLeave = team.filter((m) => m.status === 'ON_LEAVE').length;
  const countPending = team.filter((m) => m.status === 'PENDING_LEAVE').length;
  const countAbsent = team.filter((m) => m.status === 'ABSENT').length;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <Breadcrumb
          items={[
            { label: 'Leave Management', href: '/leave' },
            { label: 'Team Availability Board' },
          ]}
        />
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
          Team Availability &amp; Roster Board
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
          Live view of staff on duty, personnel on active leave, returning dates, and open unscheduled absences
        </p>
      </div>

      {/* Summary KPI Status Chips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <Card style={{ borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>AVAILABLE ON DUTY</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981', marginTop: '0.25rem' }}>{countAvailable}</div>
        </Card>
        <Card style={{ borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>ON AUTHORIZED LEAVE</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b', marginTop: '0.25rem' }}>{countOnLeave}</div>
        </Card>
        <Card style={{ borderLeft: '4px solid #3b82f6' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>PENDING LEAVE</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#3b82f6', marginTop: '0.25rem' }}>{countPending}</div>
        </Card>
        <Card style={{ borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>UNEXCUSED / ABSENT</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ef4444', marginTop: '0.25rem' }}>{countAbsent}</div>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ width: '220px' }}>
            <Select
              label="Filter Department"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'All Departments' },
                ...departments.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />
          </div>

          <div style={{ width: '220px' }}>
            <Select
              label="Availability Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'All Statuses' },
                { value: 'AVAILABLE', label: 'Available on Duty' },
                { value: 'ON_LEAVE', label: 'On Leave' },
                { value: 'PENDING_LEAVE', label: 'Pending Leave' },
                { value: 'ABSENT', label: 'Absent' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Team Member Cards Grid */}
      <Card>
        {isLoading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" />
          </div>
        ) : filteredTeam.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No personnel found matching the selected filters.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {filteredTeam.map((member) => (
              <div
                key={member.employeeId}
                style={{
                  padding: '1.25rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>{member.fullName}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {member.jobTitle} &bull; {member.employeeNumber}
                    </div>
                  </div>
                  {getStatusBadge(member.status)}
                </div>

                <div style={{ fontSize: '0.8125rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div><strong>Department:</strong> {member.department} ({member.station})</div>
                  {member.primaryPhone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#2563eb' }}>
                      <Phone size={13} /> {member.primaryPhone}
                    </div>
                  )}
                </div>

                {member.currentLeaveDetails && (
                  <div
                    style={{
                      padding: '0.625rem',
                      backgroundColor: member.status === 'ON_LEAVE' ? '#f0fdf4' : '#fffbeb',
                      border: `1px solid ${member.status === 'ON_LEAVE' ? '#bbf7d0' : '#fde68a'}`,
                      borderRadius: '0.375rem',
                      fontSize: '0.75rem',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>
                      {member.currentLeaveDetails.leaveTypeName} ({member.currentLeaveDetails.durationDays}d)
                    </div>
                    <div>
                      {new Date(member.currentLeaveDetails.startDate).toLocaleDateString()} &ndash;{' '}
                      {new Date(member.currentLeaveDetails.endDate).toLocaleDateString()}
                    </div>
                    {member.currentLeaveDetails.returnDate && (
                      <div style={{ marginTop: '0.2rem', color: '#059669', fontWeight: 600 }}>
                        Expected Return: {new Date(member.currentLeaveDetails.returnDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
