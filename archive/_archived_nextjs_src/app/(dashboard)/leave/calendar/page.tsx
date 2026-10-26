'use client';

import React, { useState, useEffect } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Users, Filter, Layers } from 'lucide-react';

export default function LeaveCalendarPage() {
  const { toastError } = useToast() as any;
  const [events, setEvents] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'MONTH' | 'LIST'>('MONTH');

  useEffect(() => {
    fetchFilters();
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [currentDate, departmentFilter, leaveTypeFilter]);

  const fetchFilters = async () => {
    try {
      const [tRes, dRes] = await Promise.all([
        fetch('/api/leave/types'),
        fetch('/api/departments'),
      ]);
      const [tj, dj] = await Promise.all([tRes.json(), dRes.json()]);
      if (tj.success) setLeaveTypes(tj.data.leaveTypes || []);
      if (dj.success) setDepartments(dj.data.departments || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEvents = async () => {
    try {
      setIsLoading(true);
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();

      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

      const params = new URLSearchParams({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });

      if (departmentFilter !== 'ALL') params.append('departmentId', departmentFilter);
      if (leaveTypeFilter !== 'ALL') params.append('leaveTypeId', leaveTypeFilter);

      const res = await fetch(`/api/leave/calendar?${params.toString()}`);
      const json = await res.json();
      if (json.success) setEvents(json.data.events);
    } catch (err) {
      console.error('Failed to load calendar events', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Generate Month Grid
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <Breadcrumb
            items={[
              { label: 'Leave Management', href: '/leave' },
              { label: 'Corporate Leave Calendar' },
            ]}
          />
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
            Corporate Leave Calendar
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
            Visualize cross-departmental staff leave distribution, team coverage, and planned absences
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant={viewMode === 'MONTH' ? 'primary' : 'outline'} size="sm" onClick={() => setViewMode('MONTH')}>
            Month View
          </Button>
          <Button variant={viewMode === 'LIST' ? 'primary' : 'outline'} size="sm" onClick={() => setViewMode('LIST')}>
            List View
          </Button>
        </div>
      </div>

      {/* Navigation and Filters Bar */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Button variant="outline" size="sm" onClick={handlePrevMonth}>
              <ChevronLeft size={16} />
            </Button>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', minWidth: '180px', textAlign: 'center' }}>
              {monthName}
            </h2>
            <Button variant="outline" size="sm" onClick={handleNextMonth}>
              <ChevronRight size={16} />
            </Button>
            <Button variant="outline" size="sm" onClick={handleToday}>
              Today
            </Button>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ width: '180px' }}>
              <Select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                options={[
                  { value: 'ALL', label: 'All Departments' },
                  ...departments.map((d) => ({ value: d.id, label: d.name })),
                ]}
              />
            </div>
            <div style={{ width: '180px' }}>
              <Select
                value={leaveTypeFilter}
                onChange={(e) => setLeaveTypeFilter(e.target.value)}
                options={[
                  { value: 'ALL', label: 'All Leave Types' },
                  ...leaveTypes.map((lt) => ({ value: lt.id, label: lt.name })),
                ]}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Calendar View Container */}
      <Card>
        {isLoading ? (
          <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" />
          </div>
        ) : viewMode === 'MONTH' ? (
          <div>
            {/* Weekday headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'center', padding: '0.5rem 0', fontWeight: 700, fontSize: '0.75rem', color: '#475569' }}>
              <div>SUN</div>
              <div>MON</div>
              <div>TUE</div>
              <div>WED</div>
              <div>THU</div>
              <div>FRI</div>
              <div>SAT</div>
            </div>

            {/* Grid days */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderLeft: '1px solid #e2e8f0' }}>
              {/* Empty offset cells */}
              {Array.from({ length: firstDayIndex }).map((_, i) => (
                <div key={`empty-${i}`} style={{ minHeight: '110px', backgroundColor: '#f8fafc', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }} />
              ))}

              {/* Month Days */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayEvents = events.filter((e) => e.start <= dateKey && e.end >= dateKey);
                const isToday = new Date().toISOString().split('T')[0] === dateKey;

                return (
                  <div
                    key={`day-${day}`}
                    style={{
                      minHeight: '110px',
                      padding: '0.5rem',
                      borderRight: '1px solid #e2e8f0',
                      borderBottom: '1px solid #e2e8f0',
                      backgroundColor: isToday ? '#eff6ff' : '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: isToday ? 800 : 600, color: isToday ? '#2563eb' : '#334155' }}>
                        {day}
                      </span>
                      {dayEvents.length > 0 && (
                        <span style={{ fontSize: '0.65rem', backgroundColor: '#e2e8f0', color: '#475569', borderRadius: '10px', padding: '0.1rem 0.35rem', fontWeight: 700 }}>
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', overflowY: 'auto', maxHeight: '80px' }}>
                      {dayEvents.map((ev) => (
                        <div
                          key={ev.id}
                          style={{
                            fontSize: '0.65rem',
                            padding: '0.15rem 0.35rem',
                            borderRadius: '0.25rem',
                            backgroundColor: ev.color ? `${ev.color}15` : '#eff6ff',
                            color: ev.color || '#2563eb',
                            borderLeft: `2px solid ${ev.color || '#2563eb'}`,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={`${ev.employeeName} (${ev.departmentName}): ${ev.leaveTypeName}`}
                        >
                          {ev.employeeName.split(' ')[0]} &bull; {ev.leaveTypeName}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Department</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Leave Category</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Dates</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Working Days</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f172a' }}>
                      {ev.employeeName}
                      <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 400, color: '#64748b' }}>
                        {ev.employeeNumber}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{ev.departmentName}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant="neutral" size="sm">{ev.leaveTypeName}</Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                      {ev.start} to {ev.end}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700 }}>
                      {ev.durationDays}d
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <Badge variant={ev.status === 'APPROVED' ? 'success' : 'warning'} size="sm">
                        {ev.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
