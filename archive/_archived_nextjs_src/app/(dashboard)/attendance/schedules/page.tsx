'use client';

import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Users,
  Building2,
  MapPin,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Search,
  Filter,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { WorkScheduleData, EmployeeShiftAssignmentData, ShiftData, EmployeeData, StationData } from '@/types';
import Link from 'next/link';

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<WorkScheduleData[]>([]);
  const [assignments, setAssignments] = useState<EmployeeShiftAssignmentData[]>([]);
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [stations, setStations] = useState<StationData[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Assignment form state
  const [formData, setFormData] = useState({
    employeeId: '',
    shiftId: '',
    workScheduleId: '',
    stationId: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [schRes, asgRes, shRes, empRes, stRes] = await Promise.all([
        fetch('/api/attendance/schedules'),
        fetch('/api/attendance/assignments'),
        fetch('/api/attendance/shifts'),
        fetch('/api/employees?limit=200'),
        fetch('/api/stations'),
      ]);

      const [schData, asgData, shData, empData, stData] = await Promise.all([
        schRes.json(),
        asgRes.json(),
        shRes.json(),
        empRes.json(),
        stRes.json(),
      ]);

      if (schData.success) setSchedules(schData.data);
      if (asgData.success) setAssignments(asgData.data);
      if (shData.success) setShifts(shData.data);
      if (empData.success) setEmployees(empData.data.employees || empData.data);
      if (stData.success) setStations(stData.data);
    } catch (err) {
      console.error('Failed to load schedule data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAssignModal = () => {
    setFormData({
      employeeId: employees[0]?.id || '',
      shiftId: shifts[0]?.id || '',
      workScheduleId: schedules[0]?.id || '',
      stationId: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      notes: '',
    });
    setShowAssignModal(true);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setNotification(null);

      const res = await fetch('/api/attendance/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (data.success) {
        setNotification({ type: 'success', message: 'Shift assigned to employee successfully' });
        setShowAssignModal(false);
        await loadData();
      } else {
        setNotification({ type: 'error', message: data.error?.message || 'Failed to assign shift' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error submitting assignment' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'Attendance', href: '/attendance' },
          { label: 'Work Schedules & Guard Shift Rosters' },
        ]}
      />

      {notification && (
        <div
          style={{
            padding: '0.875rem 1.25rem',
            borderRadius: '8px',
            marginBottom: '1.25rem',
            backgroundColor: notification.type === 'success' ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${notification.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
            color: notification.type === 'success' ? '#065f46' : '#991b1b',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {notification.message}
        </div>
      )}

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
            Work Schedules &amp; Shift Assignments
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Standard 5-day office patterns, security 6-on-1-off rotations, and active personnel duty rosters.
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={handleOpenAssignModal} leftIcon={<Plus size={14} />}>
          Assign Employee to Shift
        </Button>
      </div>

      {/* Schedule Patterns Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.25rem',
          marginBottom: '2rem',
        }}
      >
        {schedules.map((sch) => (
          <Card key={sch.id} noPadding>
            <div style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span
                  style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: '#eff6ff',
                    color: '#2563eb',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  {sch.code}
                </span>
                <Badge variant={sch.isActive ? 'success' : 'neutral'} size="sm">
                  {sch.patternType}
                </Badge>
              </div>

              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
                {sch.name}
              </h3>
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1rem' }}>
                {sch.description || 'Standard corporate work cycle pattern.'}
              </p>

              <div
                style={{
                  padding: '0.625rem 0.875rem',
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  color: '#334155',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>Cycle Length: <strong>{sch.cycleDays} Days</strong></span>
                <span>Active Assigned: <strong>{sch._count?.employeeShiftAssignments ?? 0}</strong></span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Active Shift Assignments Table */}
      <Card
        title="Active Employee Shift Assignments"
        subtitle="Current deployment rosters across guarding stations and headquarters"
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700 }}>
                <th style={{ padding: '0.75rem 1rem' }}>Employee</th>
                <th style={{ padding: '0.75rem 1rem' }}>Assigned Shift</th>
                <th style={{ padding: '0.75rem 1rem' }}>Work Schedule</th>
                <th style={{ padding: '0.75rem 1rem' }}>Station / Branch</th>
                <th style={{ padding: '0.75rem 1rem' }}>Start Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '3rem 1rem', textAlign: 'center' }}>
                    <Spinner size="md" message="Loading shift assignments..." />
                  </td>
                </tr>
              ) : assignments.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748b' }}>
                    No shift assignments registered yet.
                  </td>
                </tr>
              ) : (
                assignments.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Link
                        href={`/hr/employees/${a.employee?.id}`}
                        style={{ textDecoration: 'none', color: '#0f172a', fontWeight: 600 }}
                      >
                        {a.employee?.fullName}
                      </Link>
                      <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>
                        {a.employee?.employeeNumber} &bull; {a.employee?.jobTitle}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#0f172a' }}>
                      <strong>{a.shift?.name || 'Default Day Shift'}</strong>
                      {a.shift && (
                        <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>
                          {a.shift.startTime} - {a.shift.endTime} {a.shift.isOvernight && '(Overnight)'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                      {a.workSchedule?.name || 'Standard 6-on-1-off'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                      {a.station?.name || a.employee?.station?.name || 'HQ Deployment'}
                      <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>
                        {a.employee?.branch?.name}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                      {new Date(a.startDate).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant={a.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm">
                        {a.status}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#64748b', fontSize: '0.75rem' }}>
                      {a.notes || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: Assign Shift */}
      {showAssignModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              maxWidth: '520px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.25rem' }}>
              Assign Shift &amp; Schedule
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1.25rem' }}>
              Assign a guard or employee to a shift schedule pattern. Previous active assignments will be automatically closed.
            </p>

            <form onSubmit={handleAssignSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                    Select Employee *
                  </label>
                  <select
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#ffffff' }}
                    required
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} ({emp.employeeNumber}) &bull; {emp.jobTitle}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Primary Shift *
                    </label>
                    <select
                      value={formData.shiftId}
                      onChange={(e) => setFormData({ ...formData, shiftId: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#ffffff' }}
                      required
                    >
                      {shifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.startTime} - {s.endTime})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Work Schedule Pattern
                    </label>
                    <select
                      value={formData.workScheduleId}
                      onChange={(e) => setFormData({ ...formData, workScheduleId: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#ffffff' }}
                    >
                      <option value="">No fixed schedule</option>
                      {schedules.map((sch) => (
                        <option key={sch.id} value={sch.id}>
                          {sch.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Deployment Station
                    </label>
                    <select
                      value={formData.stationId}
                      onChange={(e) => setFormData({ ...formData, stationId: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#ffffff' }}
                    >
                      <option value="">Use Current Employee Station</option>
                      {stations.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name} ({st.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Start Date *
                    </label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                    Notes / Assignment Details
                  </label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="e.g. Assigned to Main Entry Gate day patrol"
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowAssignModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
                    {isSubmitting ? 'Assigning...' : 'Confirm Assignment'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
