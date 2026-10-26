'use client';

import React, { useEffect, useState } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import {
  Calendar,
  Lock,
  Unlock,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Edit2,
  FileCheck,
} from 'lucide-react';
import { PayrollPeriodData } from '@/types';

export default function PayrollPeriodsPage() {
  const { toast } = useToast();
  const [periods, setPeriods] = useState<PayrollPeriodData[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    periodNumber: '',
    name: '',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    payrollMonth: '8',
    payrollYear: '2026',
    payFrequency: 'MONTHLY',
    status: 'OPEN',
    cutoffDate: '2026-08-24',
    paymentDate: '2026-08-28',
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchPeriods();
  }, [selectedYear, selectedStatus]);

  const fetchPeriods = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedYear) params.append('year', selectedYear);
      if (selectedStatus) params.append('status', selectedStatus);

      const res = await fetch(`/api/payroll/periods?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setPeriods(data.data || []);
      }
    } catch (err) {
      console.error('Error loading payroll periods:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const res = await fetch('/api/payroll/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          payrollMonth: parseInt(formData.payrollMonth, 10),
          payrollYear: parseInt(formData.payrollYear, 10),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Success', message: 'Payroll period created successfully', type: 'success' });
        setIsCreateOpen(false);
        fetchPeriods();
      } else {
        toast({ title: 'Error', message: data.error?.message || 'Failed to create period', type: 'error' });
      }
    } catch (err) {
      toast({ title: 'Error', message: 'An unexpected error occurred', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleLock = async (period: PayrollPeriodData) => {
    const action = period.status === 'LOCKED' ? 'UNLOCK' : 'LOCK';
    try {
      const res = await fetch(`/api/payroll/periods/${period.id}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Success', message: `Period ${action === 'LOCK' ? 'locked' : 'unlocked'} successfully`, type: 'success' });
        fetchPeriods();
      } else {
        toast({ title: 'Error', message: data.error?.message || 'Action failed', type: 'error' });
      }
    } catch (err) {
      toast({ title: 'Error', message: 'An unexpected error occurred', type: 'error' });
    }
  };

  const onMonthChange = (monthNum: string) => {
    const m = parseInt(monthNum, 10);
    const yr = parseInt(formData.payrollYear, 10);
    const mm = m < 10 ? `0${m}` : `${m}`;
    const lastDay = new Date(Date.UTC(yr, m, 0)).getDate();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    setFormData({
      ...formData,
      payrollMonth: monthNum,
      periodNumber: `PRD-${yr}-${mm}`,
      name: `${monthNames[m - 1]} ${yr} Monthly Payroll`,
      startDate: `${yr}-${mm}-01`,
      endDate: `${yr}-${mm}-${lastDay}`,
      cutoffDate: `${yr}-${mm}-24`,
      paymentDate: `${yr}-${mm}-28`,
    });
  };

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'Payroll Management', href: '/payroll' },
          { label: 'Payroll Periods' },
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
            Payroll Period Management
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Configure payroll cycles, monthly attendance cutoff dates, disbursement milestones, and lock completed cycles.
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)} leftIcon={<Plus size={14} />}>
          New Payroll Period
        </Button>
      </div>

      {/* Filters Bar */}
      <Card noPadding style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            padding: '1rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ width: '140px' }}>
              <Select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                options={[
                  { value: '2025', label: 'Year 2025' },
                  { value: '2026', label: 'Year 2026' },
                  { value: '2027', label: 'Year 2027' },
                ]}
              />
            </div>

            <div style={{ width: '160px' }}>
              <Select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                options={[
                  { value: '', label: 'All Statuses' },
                  { value: 'OPEN', label: 'Open' },
                  { value: 'LOCKED', label: 'Locked' },
                  { value: 'CLOSED', label: 'Closed' },
                  { value: 'DRAFT', label: 'Draft' },
                ]}
              />
            </div>
          </div>

          <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Showing <strong>{periods.length}</strong> payroll cycle(s)
          </div>
        </div>
      </Card>

      {/* Periods Table */}
      <Card noPadding>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner message="Loading payroll periods..." />
          </div>
        ) : periods.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No payroll periods found for year {selectedYear}.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', backgroundColor: '#f8fafc' }}>
                  <th style={{ padding: '0.875rem 1.25rem' }}>Period Code</th>
                  <th style={{ padding: '0.875rem 1.25rem' }}>Period Name</th>
                  <th style={{ padding: '0.875rem 1.25rem' }}>Date Range</th>
                  <th style={{ padding: '0.875rem 1.25rem' }}>Attendance Cutoff</th>
                  <th style={{ padding: '0.875rem 1.25rem' }}>Disbursement Date</th>
                  <th style={{ padding: '0.875rem 1.25rem' }}>Status</th>
                  <th style={{ padding: '0.875rem 1.25rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => {
                  const isCurrent = p.status === 'OPEN';
                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: isCurrent ? '#f0fdf4' : undefined,
                      }}
                    >
                      <td style={{ padding: '0.875rem 1.25rem', fontFamily: 'monospace', fontWeight: 700, color: '#0f1c3f' }}>
                        {p.periodNumber}
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>{p.name}</span>
                          {isCurrent && (
                            <Badge variant="gold" size="sm">
                              Active
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem', color: '#475569' }}>
                        {new Date(p.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} –{' '}
                        {new Date(p.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem', color: '#64748b' }}>
                        {p.cutoffDate ? new Date(p.cutoffDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '---'}
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem', color: '#0f172a', fontWeight: 600 }}>
                        {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '---'}
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <Badge
                          variant={
                            p.status === 'OPEN'
                              ? 'success'
                              : p.status === 'LOCKED'
                              ? 'gold'
                              : p.status === 'CLOSED'
                              ? 'neutral'
                              : 'info'
                          }
                          size="sm"
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleLock(p)}
                            leftIcon={p.status === 'LOCKED' ? <Unlock size={13} /> : <Lock size={13} />}
                          >
                            {p.status === 'LOCKED' ? 'Unlock' : 'Lock'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* New Period Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Payroll Period"
        size="md"
      >
        <form onSubmit={handleCreatePeriod} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Select
              label="Payroll Month"
              value={formData.payrollMonth}
              onChange={(e) => onMonthChange(e.target.value)}
              options={[
                { value: '1', label: '01 - January' },
                { value: '2', label: '02 - February' },
                { value: '3', label: '03 - March' },
                { value: '4', label: '04 - April' },
                { value: '5', label: '05 - May' },
                { value: '6', label: '06 - June' },
                { value: '7', label: '07 - July' },
                { value: '8', label: '08 - August' },
                { value: '9', label: '09 - September' },
                { value: '10', label: '10 - October' },
                { value: '11', label: '11 - November' },
                { value: '12', label: '12 - December' },
              ]}
              required
            />
            <Input
              label="Payroll Year"
              type="number"
              value={formData.payrollYear}
              onChange={(e) => setFormData({ ...formData, payrollYear: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1rem' }}>
            <Input
              label="Period Code"
              value={formData.periodNumber}
              onChange={(e) => setFormData({ ...formData, periodNumber: e.target.value })}
              placeholder="e.g. PRD-2026-08"
              required
            />
            <Input
              label="Period Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. August 2026 Monthly Payroll"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Input
              label="Cycle Start Date"
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              required
            />
            <Input
              label="Cycle End Date"
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Input
              label="Attendance Cutoff Date"
              type="date"
              value={formData.cutoffDate}
              onChange={(e) => setFormData({ ...formData, cutoffDate: e.target.value })}
            />
            <Input
              label="Target Payment Date"
              type="date"
              value={formData.paymentDate}
              onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
            />
          </div>

          <Input
            label="Internal Notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="e.g. Standard monthly guarding cycle"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="ghost" type="button" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              Create Period
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
