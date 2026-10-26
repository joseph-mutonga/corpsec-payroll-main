'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { Calendar, Calculator, Clock, CheckCircle2, AlertCircle, ArrowLeft, Shield } from 'lucide-react';

export default function ApplyLeavePage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [colleagues, setColleagues] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [formData, setFormData] = useState({
    leaveTypeId: '',
    startDate: '',
    endDate: '',
    isHalfDay: false,
    halfDaySession: 'MORNING' as 'MORNING' | 'AFTERNOON',
    reason: '',
    relieverEmployeeId: '',
    contactPhone: '',
    emergencyContact: '',
  });

  const [calculation, setCalculation] = useState<any | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (formData.startDate && formData.endDate && formData.leaveTypeId) {
      calculateWorkingDaysPreview();
    } else {
      setCalculation(null);
    }
  }, [formData.startDate, formData.endDate, formData.leaveTypeId, formData.isHalfDay]);

  const fetchInitialData = async () => {
    try {
      setIsLoading(true);
      const [portalRes, empRes] = await Promise.all([
        fetch('/api/portal/leave'),
        fetch('/api/employees?pageSize=100&status=ACTIVE'),
      ]);

      const [portalJson, empJson] = await Promise.all([portalRes.json(), empRes.json()]);

      if (portalJson.success) {
        setLeaveTypes(portalJson.data.leaveTypes || []);
        setBalances(portalJson.data.balances || []);
        if (portalJson.data.leaveTypes?.length > 0) {
          setFormData((prev) => ({ ...prev, leaveTypeId: portalJson.data.leaveTypes[0].id }));
        }
      }

      if (empJson.success) {
        setColleagues(empJson.data.employees || []);
      }
    } catch (err) {
      toastError('Failed to load leave application form');
    } finally {
      setIsLoading(false);
    }
  };

  const calculateWorkingDaysPreview = async () => {
    try {
      setIsCalculating(true);
      const res = await fetch('/api/portal/leave/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: formData.startDate,
          endDate: formData.endDate,
          leaveTypeId: formData.leaveTypeId,
          isHalfDay: formData.isHalfDay,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setCalculation(json.data.calculation);
      }
    } catch (err) {
      console.error('Calculation error', err);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.reason || formData.reason.trim().length < 5) {
      toastError('Please provide a descriptive reason for your leave application (min 5 chars).');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/portal/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      success('Leave application submitted successfully!');
      router.push('/employee/leave');
    } catch (err: any) {
      toastError(err.message || 'Submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedBalance = balances.find((b) => b.leaveTypeId === formData.leaveTypeId);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '850px', margin: '0 auto' }}>
      {/* Header */}
      <div>
        <Breadcrumb
          items={[
            { label: 'My Leave', href: '/employee/leave' },
            { label: 'Apply for Leave' },
          ]}
        />
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
          Apply for Leave / Time-Off
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
          Submit your official leave application with real-time working day calculation, notice validation, and balance checks
        </p>
      </div>

      {isLoading ? (
        <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
          <Spinner size="lg" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card title="1. Select Leave Category &amp; Review Balance">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <Select
                label="Leave Category"
                value={formData.leaveTypeId}
                onChange={(e) => setFormData({ ...formData, leaveTypeId: e.target.value })}
                options={leaveTypes.map((lt) => ({ value: lt.id, label: `${lt.name} (${lt.isPaid ? 'Paid' : 'Unpaid'})` }))}
                required
              />

              {selectedBalance && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '0.375rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.875rem',
                  }}
                >
                  <div>
                    <span style={{ color: '#1e40af', fontWeight: 600 }}>Your Available Quota:</span>{' '}
                    <strong style={{ fontSize: '1.125rem', color: '#1d4ed8' }}>{selectedBalance.availableBalance} Days</strong>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#3b82f6' }}>
                    Entitled: {selectedBalance.entitledDays}d &bull; Used: {selectedBalance.usedDays}d &bull; Pending: {selectedBalance.pendingDays}d
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card title="2. Dates &amp; Working Day Arithmetic">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Input
                  label="Start Date"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  required
                />
                <Input
                  label="End Date"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.isHalfDay}
                    onChange={(e) => setFormData({ ...formData, isHalfDay: e.target.checked })}
                  />
                  Half-Day Application (0.5 Days)
                </label>

                {formData.isHalfDay && (
                  <div style={{ width: '180px' }}>
                    <Select
                      value={formData.halfDaySession}
                      onChange={(e) => setFormData({ ...formData, halfDaySession: e.target.value as any })}
                      options={[
                        { value: 'MORNING', label: 'Morning Session' },
                        { value: 'AFTERNOON', label: 'Afternoon Session' },
                      ]}
                    />
                  </div>
                )}
              </div>

              {/* Dynamic Live Working Day Calculation Preview */}
              {calculation && (
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '0.375rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#065f46', fontSize: '0.9375rem' }}>
                      Calculated Working Days: {calculation.durationDays} Day(s)
                    </span>
                    <Badge variant="success" size="sm">
                      {calculation.calendarDaysCount} Calendar Days
                    </Badge>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: '#047857' }}>
                    {calculation.weekendDates.length > 0 && (
                      <span>Excluded {calculation.weekendDates.length} weekend day(s). </span>
                    )}
                    {calculation.holidayDates.length > 0 && (
                      <span>Excluded {calculation.holidayDates.length} gazetted public holiday(s). </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card title="3. Application Details &amp; Reliever">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, color: '#334155', marginBottom: '0.375rem', fontSize: '0.875rem' }}>
                  Reason for Leave Application (Mandatory)
                </label>
                <textarea
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    padding: '0.625rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                  }}
                  placeholder="Provide details about your planned leave, emergency context, or study schedule..."
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  required
                />
              </div>

              <Select
                label="Designated Shift Reliever (Optional)"
                value={formData.relieverEmployeeId}
                onChange={(e) => setFormData({ ...formData, relieverEmployeeId: e.target.value })}
                options={[
                  { value: '', label: 'Select a colleague to act as reliever...' },
                  ...colleagues.map((c) => ({ value: c.id, label: `${c.fullName} (${c.employeeNumber})` })),
                ]}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Input
                  label="Contact Phone During Leave"
                  placeholder="e.g. +254 700 000000"
                  value={formData.contactPhone}
                  onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                />
                <Input
                  label="Emergency Contact Name &amp; Phone"
                  placeholder="e.g. Spouse / Next of Kin"
                  value={formData.emergencyContact}
                  onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                />
              </div>
            </div>
          </Card>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <Button variant="outline" type="button" onClick={() => router.push('/employee/leave')}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting || isCalculating}>
              {isSubmitting ? 'Submitting Application...' : 'Submit Leave Application'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
