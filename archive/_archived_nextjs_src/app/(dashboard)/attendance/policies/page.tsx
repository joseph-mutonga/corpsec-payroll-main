'use client';

import React, { useState, useEffect } from 'react';
import {
  Sliders,
  CheckCircle2,
  Save,
  RefreshCw,
  Clock,
  Shield,
  FileCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';

export default function AttendancePoliciesPage() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/attendance/policies');
      const json = await res.json();
      if (json.success) {
        setSettings(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const res = await fetch('/api/attendance/policies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (json.success) {
        showToast({ type: 'success', title: 'Attendance policy updated successfully!' });
      } else {
        showToast({ type: 'error', title: json.error || 'Failed to update policy' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Error saving settings' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '900px' }}>
      <Breadcrumb
        items={[
          { label: 'Attendance', href: '/attendance' },
          { label: 'Attendance Policies & Rules' },
        ]}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Attendance Policies & Overtime Rules
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
            Configure grace periods, rounding intervals, early departure thresholds, and payroll locking controls.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <Spinner size="lg" />
          <p style={{ marginTop: '0.5rem', color: '#64748b' }}>Loading policy rules...</p>
        </div>
      ) : (
        <form onSubmit={handleSave}>
          <Card style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>
              Punctuality & Working Time Bounds
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  Grace Period for Lateness (Minutes)
                </label>
                <input
                  type="number"
                  value={settings?.gracePeriodMinutes ?? 15}
                  onChange={(e) => setSettings({ ...settings, gracePeriodMinutes: parseInt(e.target.value, 10) || 0 })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Employees arriving within this window will not be flagged as late.</span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  Early Departure Threshold (Minutes)
                </label>
                <input
                  type="number"
                  value={settings?.earlyDepartureThresholdMins ?? 15}
                  onChange={(e) => setSettings({ ...settings, earlyDepartureThresholdMins: parseInt(e.target.value, 10) || 0 })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Threshold before clocking out early triggers an early departure alert.</span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  Default Break Duration (Minutes)
                </label>
                <input
                  type="number"
                  value={settings?.breakDurationMinutes ?? 60}
                  onChange={(e) => setSettings({ ...settings, breakDurationMinutes: parseInt(e.target.value, 10) || 0 })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  Rounding Interval (Minutes)
                </label>
                <select
                  value={settings?.roundingIntervalMinutes ?? 1}
                  onChange={(e) => setSettings({ ...settings, roundingIntervalMinutes: parseInt(e.target.value, 10) || 1 })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                >
                  <option value="1">Exact 1 Minute</option>
                  <option value="5">5 Minutes</option>
                  <option value="15">15 Minutes</option>
                </select>
              </div>
            </div>
          </Card>

          <Card style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>
              Overtime & Payroll Controls
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  Maximum Daily Overtime (Minutes)
                </label>
                <input
                  type="number"
                  value={settings?.maxDailyOvertimeMinutes ?? 360}
                  onChange={(e) => setSettings({ ...settings, maxDailyOvertimeMinutes: parseInt(e.target.value, 10) || 0 })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Maximum allowable overtime per shift (Security standard: 360 mins / 6h).</span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  Auto-Absence Evaluation Cutoff Hour
                </label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={settings?.autoAbsenceCheckHour ?? 23}
                  onChange={(e) => setSettings({ ...settings, autoAbsenceCheckHour: parseInt(e.target.value, 10) || 23 })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings?.requireSupervisorOvertimeApproval ?? true}
                  onChange={(e) => setSettings({ ...settings, requireSupervisorOvertimeApproval: e.target.checked })}
                />
                <span style={{ fontSize: '0.875rem', color: '#1e293b', fontWeight: 500 }}>
                  Require Station Supervisor & HR Approval for Overtime Pay Export
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings?.requireAttendanceLockForPayroll ?? true}
                  onChange={(e) => setSettings({ ...settings, requireAttendanceLockForPayroll: e.target.checked })}
                />
                <span style={{ fontSize: '0.875rem', color: '#1e293b', fontWeight: 500 }}>
                  Enforce Period Lock: Lock timesheets upon payroll finalization (Immutable attendance)
                </span>
              </label>
            </div>
          </Card>

          <Button variant="primary" type="submit" disabled={isSaving} leftIcon={<Save size={16} />}>
            {isSaving ? 'Saving...' : 'Save Policy Settings'}
          </Button>
        </form>
      )}
    </div>
  );
}
