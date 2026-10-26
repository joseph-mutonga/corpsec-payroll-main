'use client';

import React, { useEffect, useState } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { Settings, Save, Clock, ShieldCheck, CreditCard, Layers } from 'lucide-react';
import { CompanyPayrollSettingData } from '@/types';

export default function PayrollSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<CompanyPayrollSettingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    payFrequency: 'MONTHLY',
    defaultPayDay: 28,
    cutoffDay: 24,
    defaultCurrency: 'KES',
    roundingMethod: 'ROUND_NEAREST_1',
    prorationBaseDays: 30,
    overtimeHourlyDivisor: 225,
    allowNegativeNetPay: false,
    requireTwoTierApproval: true,
    payrollNumberPrefix: 'PAY-',
    payslipNumberPrefix: 'PS-',
    paymentBatchPrefix: 'PB-',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/payroll/settings');
      const data = await res.json();
      if (data.success && data.data) {
        setSettings(data.data);
        setFormData({
          payFrequency: data.data.payFrequency || 'MONTHLY',
          defaultPayDay: data.data.defaultPayDay || 28,
          cutoffDay: data.data.cutoffDay || 24,
          defaultCurrency: data.data.defaultCurrency || 'KES',
          roundingMethod: data.data.roundingMethod || 'ROUND_NEAREST_1',
          prorationBaseDays: data.data.prorationBaseDays || 30,
          overtimeHourlyDivisor: data.data.overtimeHourlyDivisor || 225,
          allowNegativeNetPay: data.data.allowNegativeNetPay ?? false,
          requireTwoTierApproval: data.data.requireTwoTierApproval ?? true,
          payrollNumberPrefix: data.data.payrollNumberPrefix || 'PAY-',
          payslipNumberPrefix: data.data.payslipNumberPrefix || 'PS-',
          paymentBatchPrefix: data.data.paymentBatchPrefix || 'PB-',
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
      setIsSaving(true);
      const res = await fetch('/api/payroll/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          defaultPayDay: parseInt(String(formData.defaultPayDay), 10),
          cutoffDay: parseInt(String(formData.cutoffDay), 10),
          prorationBaseDays: parseInt(String(formData.prorationBaseDays), 10),
          overtimeHourlyDivisor: parseInt(String(formData.overtimeHourlyDivisor), 10),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Success', message: 'Company payroll settings saved successfully', type: 'success' });
        setSettings(data.data);
      } else {
        toast({ title: 'Error', message: data.error?.message || 'Failed to save settings', type: 'error' });
      }
    } catch (err) {
      toast({ title: 'Error', message: 'An unexpected error occurred', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <Spinner fullHeight message="Loading company payroll settings..." />;
  }

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'Payroll Management', href: '/payroll' },
          { label: 'Payroll Settings' },
        ]}
      />

      {/* Header Banner */}
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
            Company Payroll Configuration Settings
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Global operational parameters: standard pay dates, attendance cutoffs, overtime divisors, and document prefix sequences.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Section 1: Cycle Schedules & Timing */}
        <Card title="Cycle Schedules &amp; Cutoff Milestones" subtitle="Default dates applied when generating monthly payroll periods">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
            <Select
              label="Standard Pay Frequency"
              value={formData.payFrequency}
              onChange={(e) => setFormData({ ...formData, payFrequency: e.target.value })}
              options={[
                { value: 'MONTHLY', label: 'Monthly' },
                { value: 'WEEKLY', label: 'Weekly' },
                { value: 'BI_WEEKLY', label: 'Bi-Weekly' },
                { value: 'DAILY', label: 'Daily' },
              ]}
              required
            />

            <Input
              label="Default Salary Payment Day (of Month)"
              type="number"
              min={1}
              max={31}
              value={formData.defaultPayDay}
              onChange={(e) => setFormData({ ...formData, defaultPayDay: parseInt(e.target.value, 10) })}
              placeholder="28"
              required
            />

            <Input
              label="Attendance Cutoff Day (of Month)"
              type="number"
              min={1}
              max={31}
              value={formData.cutoffDay}
              onChange={(e) => setFormData({ ...formData, cutoffDay: parseInt(e.target.value, 10) })}
              placeholder="24"
              required
            />

            <Input
              label="Standard Operating Currency"
              value={formData.defaultCurrency}
              onChange={(e) => setFormData({ ...formData, defaultCurrency: e.target.value })}
              placeholder="KES"
              required
            />
          </div>
        </Card>

        {/* Section 2: Calculation Formulas & Divisors */}
        <Card title="Calculation Rules &amp; Overtime Divisors" subtitle="Standard actuarial constants used during payroll calculations">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
            <Input
              label="Overtime Hourly Divisor (Standard Base Hours/Mo)"
              type="number"
              min={50}
              max={365}
              value={formData.overtimeHourlyDivisor}
              onChange={(e) => setFormData({ ...formData, overtimeHourlyDivisor: parseInt(e.target.value, 10) })}
              placeholder="225"
              required
            />

            <Input
              label="Proration Base Days (Monthly Calendar Factor)"
              type="number"
              min={15}
              max={31}
              value={formData.prorationBaseDays}
              onChange={(e) => setFormData({ ...formData, prorationBaseDays: parseInt(e.target.value, 10) })}
              placeholder="30"
              required
            />

            <Select
              label="Net Pay Rounding Strategy"
              value={formData.roundingMethod}
              onChange={(e) => setFormData({ ...formData, roundingMethod: e.target.value })}
              options={[
                { value: 'ROUND_NEAREST_1', label: 'Round to Nearest KES 1.00 (Standard)' },
                { value: 'ROUND_UP', label: 'Round UP to Nearest KES 1.00' },
                { value: 'ROUND_DOWN', label: 'Round DOWN to Nearest KES 1.00' },
                { value: 'NO_ROUNDING', label: 'Exact Cents (No Rounding)' },
              ]}
              required
            />

            <Select
              label="Require Two-Tier Approval for Revisions"
              value={formData.requireTwoTierApproval ? 'true' : 'false'}
              onChange={(e) => setFormData({ ...formData, requireTwoTierApproval: e.target.value === 'true' })}
              options={[
                { value: 'true', label: 'Yes — HR Officer propose + HR Manager approve' },
                { value: 'false', label: 'No — Single tier direct edit' },
              ]}
              required
            />
          </div>
        </Card>

        {/* Section 3: Document Numbering Sequences */}
        <Card title="Document Numbering &amp; Prefix Schemes" subtitle="Sequential identifiers generated for future payroll runs and payslips">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
            <Input
              label="Payroll Run Batch Prefix"
              value={formData.payrollNumberPrefix}
              onChange={(e) => setFormData({ ...formData, payrollNumberPrefix: e.target.value })}
              placeholder="PAY-"
              required
            />

            <Input
              label="Individual Payslip Prefix"
              value={formData.payslipNumberPrefix}
              onChange={(e) => setFormData({ ...formData, payslipNumberPrefix: e.target.value })}
              placeholder="PS-"
              required
            />

            <Input
              label="Bank / M-Pesa Payment Batch Prefix"
              value={formData.paymentBatchPrefix}
              onChange={(e) => setFormData({ ...formData, paymentBatchPrefix: e.target.value })}
              placeholder="PB-"
              required
            />
          </div>
        </Card>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
          <Button variant="primary" size="md" type="submit" isLoading={isSaving} leftIcon={<Save size={16} />}>
            Save Payroll Configuration
          </Button>
        </div>
      </form>
    </div>
  );
}
