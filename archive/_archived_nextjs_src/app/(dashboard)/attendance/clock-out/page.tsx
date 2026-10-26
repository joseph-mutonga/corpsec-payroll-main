'use client';

import React, { useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  LogOut,
  Coffee,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';

export default function ClockOutTerminalPage() {
  const { showToast } = useToast();
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusInfo, setStatusInfo] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    fetchEmployees();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedEmployeeId) {
      fetchEmployeeStatus(selectedEmployeeId);
    }
  }, [selectedEmployeeId]);

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees?pageSize=100');
      const json = await res.json();
      if (json.success) {
        setEmployees(Array.isArray(json.data) ? json.data : json.data?.employees || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEmployeeStatus = async (empId: string) => {
    try {
      const attRes = await fetch(`/api/attendance/employees?employeeId=${empId}&startDate=${new Date().toISOString().split('T')[0]}`);
      const attJson = await attRes.json();
      if (attJson.success && attJson.data?.length > 0) {
        setStatusInfo(attJson.data[0]);
      } else {
        setStatusInfo(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleClockOut = async () => {
    if (!selectedEmployeeId) {
      showToast({ type: 'error', title: 'Please select an employee to clock out' });
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/attendance/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CLOCK_OUT',
          employeeId: selectedEmployeeId,
          source: 'WEB_TERMINAL',
          notes: notes || undefined,
        }),
      });

      const json = await res.json();
      if (json.success) {
        showToast({
          type: 'success',
          title: `Clock Out Successful! Worked: ${(json.data.workedMinutes / 60).toFixed(2)}h`,
        });
        fetchEmployeeStatus(selectedEmployeeId);
        setNotes('');
      } else {
        showToast({ type: 'error', title: json.error || 'Clock out failed' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Network error clocking out' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { label: 'Attendance', href: '/attendance' },
          { label: 'Clock Out Terminal' },
        ]}
      />

      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'inline-flex', padding: '0.75rem', borderRadius: '50%', background: '#fee2e2', color: '#b91c1c', marginBottom: '0.75rem' }}>
          <LogOut size={36} />
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
          Workforce Clock-Out Terminal
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.9375rem', margin: '0.25rem 0 0 0' }}>
          Finalize working hours, deduct unpaid break durations, and record shift conclusion.
        </p>

        {/* Live Digital Clock */}
        <div style={{ marginTop: '1rem', display: 'inline-block', background: '#0f172a', color: '#f87171', padding: '0.75rem 1.5rem', borderRadius: '0.75rem', fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.05em' }}>
          {currentTime.toLocaleTimeString('en-KE', { hour12: false })} <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>EAT (UTC+3)</span>
        </div>
      </div>

      <Card style={{ padding: '2rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>
            Select Employee *
          </label>
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid #cbd5e1',
              fontSize: '0.9375rem',
            }}
          >
            <option value="">-- Choose Employee / Guard --</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.fullName} ({emp.employeeNumber}) — {emp.station?.name || emp.department?.name || 'General'}
              </option>
            ))}
          </select>
        </div>

        {statusInfo && (
          <div style={{ padding: '1rem', borderRadius: '0.5rem', background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 600 }}>CURRENT SESSION</span>
              <Badge variant={statusInfo.actualClockIn && !statusInfo.actualClockOut ? 'success' : 'danger'}>
                {statusInfo.actualClockIn && !statusInfo.actualClockOut ? 'CLOCKED IN — READY TO CLOCK OUT' : 'NOT CLOCKED IN'}
              </Badge>
            </div>
            {statusInfo.actualClockIn && (
              <div style={{ fontSize: '0.875rem', color: '#334155' }}>
                Shift Clocked In: <strong>{new Date(statusInfo.actualClockIn).toLocaleTimeString('en-KE')}</strong>
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>
            Shift Departure Notes (Optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Handover completed with relief officer..."
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid #cbd5e1',
              fontSize: '0.875rem',
            }}
          />
        </div>

        <Button
          variant="danger"
          onClick={handleClockOut}
          disabled={!selectedEmployeeId || isSubmitting || !statusInfo?.actualClockIn || !!statusInfo?.actualClockOut}
          leftIcon={<LogOut size={18} />}
          style={{ width: '100%', padding: '0.875rem', fontSize: '1rem', fontWeight: 700 }}
        >
          {isSubmitting ? 'Clocking Out...' : 'CONFIRM CLOCK OUT'}
        </Button>
      </Card>
    </div>
  );
}
