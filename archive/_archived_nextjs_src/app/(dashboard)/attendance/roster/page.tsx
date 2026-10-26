'use client';

import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Filter,
  Users,
  MapPin,
  Building2,
  CheckCircle2,
  AlertTriangle,
  UserX,
  Sparkles,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { BranchData, StationData } from '@/types';
import Link from 'next/link';

export default function RosterPage() {
  const [rosterData, setRosterData] = useState<any>(null);
  const [branches, setBranches] = useState<BranchData[]>([]);
  const [stations, setStations] = useState<StationData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Week offset from current date
  const [weekOffset, setWeekOffset] = useState(0);
  const [filterBranch, setFilterBranch] = useState('');
  const [filterStation, setFilterStation] = useState('');

  useEffect(() => {
    loadMetadata();
  }, []);

  useEffect(() => {
    fetchRoster();
  }, [weekOffset, filterBranch, filterStation]);

  const loadMetadata = async () => {
    try {
      const [brRes, stRes] = await Promise.all([
        fetch('/api/branches'),
        fetch('/api/stations'),
      ]);
      const [brData, stData] = await Promise.all([brRes.json(), stRes.json()]);
      if (brData.success) setBranches(brData.data);
      if (stData.success) setStations(stData.data);
    } catch (err) {
      console.error('Error loading metadata:', err);
    }
  };

  const fetchRoster = async () => {
    try {
      setIsLoading(true);
      const curr = new Date();
      curr.setDate(curr.getDate() + weekOffset * 7);

      // Start on Monday of this week
      const day = curr.getDay();
      const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(curr.setDate(diff));
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      const params = new URLSearchParams();
      params.append('startDate', startOfWeek.toISOString().split('T')[0]);
      params.append('endDate', endOfWeek.toISOString().split('T')[0]);
      if (filterBranch) params.append('branchId', filterBranch);
      if (filterStation) params.append('stationId', filterStation);

      const res = await fetch(`/api/attendance/roster?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setRosterData(data.data);
      }
    } catch (err) {
      console.error('Failed to load roster:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getCellStatusDisplay = (day: any) => {
    if (!day.hasRecord) {
      if (day.status === 'OFF') {
        return (
          <span style={{ fontSize: '0.6875rem', color: '#94a3b8', backgroundColor: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
            Off Day
          </span>
        );
      }
      return (
        <span style={{ fontSize: '0.6875rem', color: '#2563eb', backgroundColor: '#eff6ff', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
          {day.shift?.code || 'Scheduled'}
        </span>
      );
    }

    switch (day.status) {
      case 'PRESENT':
      case 'PRESENT_WITH_OVERTIME':
        return (
          <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.25rem 0.35rem', borderRadius: '4px' }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#065f46', display: 'block' }}>
              Present ({day.workedHours}h)
            </span>
            {day.overtimeMinutes > 0 && (
              <span style={{ fontSize: '0.625rem', color: '#059669', display: 'block' }}>
                +{Math.round((day.overtimeMinutes / 60) * 10) / 10}h OT
              </span>
            )}
          </div>
        );
      case 'LATE':
        return (
          <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fef3c7', padding: '0.25rem 0.35rem', borderRadius: '4px' }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#b45309', display: 'block' }}>
              Late (+{day.lateMinutes}m)
            </span>
            <span style={{ fontSize: '0.625rem', color: '#64748b', display: 'block' }}>{day.workedHours}h worked</span>
          </div>
        );
      case 'ABSENT':
        return (
          <span style={{ fontSize: '0.6875rem', color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '0.2rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
            Absent
          </span>
        );
      case 'ON_LEAVE':
      case 'SICK_LEAVE':
        return (
          <span style={{ fontSize: '0.6875rem', color: '#2563eb', backgroundColor: '#eff6ff', padding: '0.2rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
            On Leave
          </span>
        );
      case 'OFF_DAY':
      case 'REST_DAY':
        return (
          <span style={{ fontSize: '0.6875rem', color: '#64748b', backgroundColor: '#f8fafc', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
            Off Day
          </span>
        );
      default:
        return (
          <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>
            {day.status}
          </span>
        );
    }
  };

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'Attendance', href: '/attendance' },
          { label: 'Duty Station Attendance Roster' },
        ]}
      />

      {/* Header */}
      <div
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '1.5rem 1.75rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0f1c3f', marginBottom: '0.25rem' }}>
            Multi-Day Attendance Roster Matrix
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Scheduled shifts vs actual clocked duty across guarding stations and corporate personnel.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset((prev) => prev - 1)}
            leftIcon={<ChevronLeft size={14} />}
          >
            Prev Week
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekOffset(0)}
          >
            Current Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset((prev) => prev + 1)}
            rightIcon={<ChevronRight size={14} />}
          >
            Next Week
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card noPadding>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ minWidth: '220px' }}>
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.6rem',
                fontSize: '0.8125rem',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                backgroundColor: '#ffffff',
              }}
            >
              <option value="">All Operating Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: '220px' }}>
            <select
              value={filterStation}
              onChange={(e) => setFilterStation(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.6rem',
                fontSize: '0.8125rem',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                backgroundColor: '#ffffff',
              }}
            >
              <option value="">All Guarding Stations</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#64748b' }}>
            Period: <strong>{rosterData?.startDate}</strong> to <strong>{rosterData?.endDate}</strong>
          </div>
        </div>

        {/* Matrix Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700 }}>
                <th style={{ padding: '0.75rem 1rem', width: '220px' }}>Guard / Employee</th>
                <th style={{ padding: '0.75rem 1rem', width: '160px' }}>Assigned Post</th>
                {rosterData?.days?.map((dateStr: string) => {
                  const d = new Date(dateStr);
                  const dayName = d.toLocaleDateString('en-KE', { weekday: 'short' });
                  const dayNum = d.getDate();
                  const isToday = dateStr === new Date().toISOString().split('T')[0];

                  return (
                    <th
                      key={dateStr}
                      style={{
                        padding: '0.75rem 0.5rem',
                        textAlign: 'center',
                        backgroundColor: isToday ? 'rgba(212, 163, 75, 0.15)' : 'inherit',
                        borderLeft: '1px solid #f1f5f9',
                        minWidth: '110px',
                      }}
                    >
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isToday ? 'var(--corp-navy-950)' : '#334155' }}>
                        {dayName}
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{dayNum}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} style={{ padding: '3rem 1rem', textAlign: 'center' }}>
                    <Spinner size="md" message="Loading visual roster grid..." />
                  </td>
                </tr>
              ) : !rosterData?.roster || rosterData.roster.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748b' }}>
                    No personnel rosters found for selected filters.
                  </td>
                </tr>
              ) : (
                rosterData.roster.map((row: any) => (
                  <tr key={row.employee.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Link
                        href={`/hr/employees/${row.employee.id}`}
                        style={{ textDecoration: 'none', color: '#0f172a', fontWeight: 600 }}
                      >
                        {row.employee.fullName}
                      </Link>
                      <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>
                        {row.employee.employeeNumber} &bull; {row.employee.jobTitle}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                      {row.employee.station?.name || 'HQ Deployment'}
                      <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>
                        {row.employee.branch?.name}
                      </span>
                    </td>
                    {row.days.map((day: any) => {
                      const isToday = day.date === new Date().toISOString().split('T')[0];
                      return (
                        <td
                          key={day.date}
                          style={{
                            padding: '0.5rem',
                            textAlign: 'center',
                            borderLeft: '1px solid #f1f5f9',
                            backgroundColor: isToday ? 'rgba(212, 163, 75, 0.05)' : 'inherit',
                          }}
                        >
                          {getCellStatusDisplay(day)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
