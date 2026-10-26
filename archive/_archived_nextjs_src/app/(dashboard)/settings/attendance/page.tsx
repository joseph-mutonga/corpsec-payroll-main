'use client';

import React, { useState, useEffect } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import {
  Settings,
  Clock,
  ShieldCheck,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

export default function AttendanceSettingsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    gracePeriodMinutes: 15,
    overtimeThresholdMinutes: 0,
    maxDailyOvertimeMinutes: 360,
    workingDaysPerWeek: 6,
    breakDurationMinutes: 60,
    roundingIntervalMinutes: 1,
    earlyDepartureThresholdMins: 15,
    autoAbsenceCheckHour: 23,
    requireSupervisorOvertimeApproval: true,
    requireAttendanceLockForPayroll: true,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/attendance/settings');
      const json = await res.json();
      if (json.success && json.data) {
        setForm({
          gracePeriodMinutes: json.data.gracePeriodMinutes ?? 15,
          overtimeThresholdMinutes: json.data.overtimeThresholdMinutes ?? 0,
          maxDailyOvertimeMinutes: json.data.maxDailyOvertimeMinutes ?? 360,
          workingDaysPerWeek: json.data.workingDaysPerWeek ?? 6,
          breakDurationMinutes: json.data.breakDurationMinutes ?? 60,
          roundingIntervalMinutes: json.data.roundingIntervalMinutes ?? 1,
          earlyDepartureThresholdMins: json.data.earlyDepartureThresholdMins ?? 15,
          autoAbsenceCheckHour: json.data.autoAbsenceCheckHour ?? 23,
          requireSupervisorOvertimeApproval: json.data.requireSupervisorOvertimeApproval ?? true,
          requireAttendanceLockForPayroll: json.data.requireAttendanceLockForPayroll ?? true,
        });
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await fetch('/api/attendance/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.success) {
        showToast({ type: 'success', title: 'Attendance settings updated successfully' });
      } else {
        showToast({ type: 'error', title: json.error || 'Failed to update settings' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Network error saving settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spinner size="lg" message="Loading attendance configurations..." />
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Breadcrumb items={[{ label: 'Settings', href: '/settings' }, { label: 'Attendance & Shift Rules' }]} />

      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Settings size={28} color="#0f1c3f" />
          Attendance & Shift Rules Configuration
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
          Define company-wide shift thresholds, grace periods, overtime rules, and payroll sealing policies.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Punctuality & Grace Periods */}
        <Card title="Punctuality & Grace Periods">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Shift Grace Period (Minutes)
              </label>
              <Input
                type="number"
                min={0}
                max={60}
                value={form.gracePeriodMinutes}
                onChange={(e) => setForm({ ...form, gracePeriodMinutes: parseInt(e.target.value, 10) || 0 })}
                helperText="Allowed arrival window before flag as LATE (e.g. 15 mins)"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Early Departure Threshold (Minutes)
              </label>
              <Input
                type="number"
                min={0}
                max={120}
                value={form.earlyDepartureThresholdMins}
                onChange={(e) => setForm({ ...form, earlyDepartureThresholdMins: parseInt(e.target.value, 10) || 0 })}
                helperText="Clock out before end time to trigger EARLY_DEPARTURE"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Default Shift Break (Minutes)
              </label>
              <Input
                type="number"
                min={0}
                max={180}
                value={form.breakDurationMinutes}
                onChange={(e) => setForm({ ...form, breakDurationMinutes: parseInt(e.target.value, 10) || 0 })}
                helperText="Deducted from gross duration for unpaid breaks"
              />
            </div>
          </div>
        </Card>

        {/* Overtime & Scheduling Rules */}
        <Card title="Overtime & Scheduling Parameters">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Overtime Eligibility Threshold (Minutes)
              </label>
              <Input
                type="number"
                min={0}
                max={120}
                value={form.overtimeThresholdMinutes}
                onChange={(e) => setForm({ ...form, overtimeThresholdMinutes: parseInt(e.target.value, 10) || 0 })}
                helperText="Minimum extra minutes beyond shift before OT accrues (e.g. 0)"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Max Daily Overtime Cap (Minutes)
              </label>
              <Input
                type="number"
                min={60}
                max={720}
                value={form.maxDailyOvertimeMinutes}
                onChange={(e) => setForm({ ...form, maxDailyOvertimeMinutes: parseInt(e.target.value, 10) || 0 })}
                helperText="Maximum allowed overtime per shift (e.g. 360 mins = 6h)"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Standard Guarding Work Days / Week
              </label>
              <Input
                type="number"
                min={1}
                max={7}
                value={form.workingDaysPerWeek}
                onChange={(e) => setForm({ ...form, workingDaysPerWeek: parseInt(e.target.value, 10) || 6 })}
                helperText="Kenyan security industry standard: 6 working days"
              />
            </div>
          </div>
        </Card>

        {/* Payroll Integration & Governance */}
        <Card title="Governance & Payroll Integration">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.requireSupervisorOvertimeApproval}
                onChange={(e) => setForm({ ...form, requireSupervisorOvertimeApproval: e.target.checked })}
                style={{ width: '18px', height: '18px' }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f1c3f' }}>
                  Require Explicit Supervisor / HR Approval for Overtime Disbursement
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Only APPROVED overtime records will flow into the Phase 7 & 8 Monthly Payroll calculation engine.
                </div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.requireAttendanceLockForPayroll}
                onChange={(e) => setForm({ ...form, requireAttendanceLockForPayroll: e.target.checked })}
                style={{ width: '18px', height: '18px' }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f1c3f' }}>
                  Seal & Lock Attendance Records on Payroll Finalization
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Prevents retroactive modification or clock event addition once monthly payroll is sealed.
                </div>
              </div>
            </label>
          </div>
        </Card>

        {/* Action Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <Button variant="outline" type="button" onClick={fetchSettings}>
            <RotateCcw size={14} style={{ marginRight: '4px' }} /> Reset
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? <Spinner size="sm" /> : <Save size={14} style={{ marginRight: '4px' }} />}
            Save Configuration
          </Button>
        </div>
      </form>
    </div>
  );
}
