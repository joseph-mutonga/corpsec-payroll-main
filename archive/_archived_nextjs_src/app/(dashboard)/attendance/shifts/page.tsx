'use client';

import React, { useEffect, useState } from 'react';
import {
  Clock,
  Plus,
  Moon,
  Sun,
  Coffee,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Trash2,
  ChevronRight,
  Shield,
  Search,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { ShiftData } from '@/types';

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    startTime: '06:00',
    endTime: '18:00',
    shiftType: 'DAY',
    isOvernight: false,
    gracePeriodMinutes: 15,
    breakDurationMinutes: 60,
    isBreakPaid: false,
    breakStartTime: '',
    breakEndTime: '',
    status: 'ACTIVE',
  });

  useEffect(() => {
    fetchShifts();
  }, []);

  const fetchShifts = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/attendance/shifts');
      const data = await res.json();
      if (data.success) {
        setShifts(data.data);
      }
    } catch (err) {
      console.error('Failed to load shifts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingShift(null);
    setFormData({
      code: `SHF-${Date.now().toString().slice(-4)}`,
      name: '',
      startTime: '06:00',
      endTime: '18:00',
      shiftType: 'DAY',
      isOvernight: false,
      gracePeriodMinutes: 15,
      breakDurationMinutes: 60,
      isBreakPaid: false,
      breakStartTime: '',
      breakEndTime: '',
      status: 'ACTIVE',
    });
    setShowModal(true);
  };

  const handleOpenEdit = (shift: ShiftData) => {
    setEditingShift(shift);
    setFormData({
      code: shift.code,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      shiftType: shift.shiftType,
      isOvernight: shift.isOvernight,
      gracePeriodMinutes: shift.gracePeriodMinutes,
      breakDurationMinutes: shift.breakDurationMinutes,
      isBreakPaid: shift.isBreakPaid,
      breakStartTime: shift.breakStartTime || '',
      breakEndTime: shift.breakEndTime || '',
      status: shift.status,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setNotification(null);

      const url = editingShift
        ? `/api/attendance/shifts/${editingShift.id}`
        : '/api/attendance/shifts';
      const method = editingShift ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (data.success) {
        setNotification({
          type: 'success',
          message: editingShift ? 'Shift updated successfully' : 'Shift created successfully',
        });
        setShowModal(false);
        fetchShifts();
      } else {
        setNotification({ type: 'error', message: data.error?.message || 'Failed to save shift' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error saving shift' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (shift: ShiftData) => {
    if (!confirm(`Are you sure you want to deactivate shift "${shift.name}" (${shift.code})?`)) return;
    try {
      const res = await fetch(`/api/attendance/shifts/${shift.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setNotification({ type: 'success', message: 'Shift deactivated successfully' });
        fetchShifts();
      } else {
        setNotification({ type: 'error', message: data.error?.message || 'Failed to deactivate shift' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error deactivating shift' });
    }
  };

  const filteredShifts = shifts.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'Attendance', href: '/attendance' },
          { label: 'Shift Configuration Catalog' },
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
            Shift Definitions &amp; Rules
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Manage day shifts, overnight guarding rotations, grace periods, and break configurations.
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={handleOpenCreate} leftIcon={<Plus size={14} />}>
          Create New Shift
        </Button>
      </div>

      {/* Shifts Catalog Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.25rem',
          marginBottom: '1.5rem',
        }}
      >
        {isLoading ? (
          <div style={{ gridColumn: '1 / -1', padding: '3rem 0', textAlign: 'center' }}>
            <Spinner size="md" message="Loading shifts catalog..." />
          </div>
        ) : filteredShifts.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '3rem 0', textAlign: 'center', color: '#64748b' }}>
            No shift definitions found.
          </div>
        ) : (
          filteredShifts.map((s) => (
            <Card key={s.id} noPadding>
              <div style={{ padding: '1.25rem 1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        padding: '0.35rem',
                        borderRadius: '6px',
                        backgroundColor: s.isOvernight ? '#f3e8ff' : '#eff6ff',
                        color: s.isOvernight ? '#7c3aed' : '#2563eb',
                      }}
                    >
                      {s.isOvernight ? <Moon size={18} /> : <Sun size={18} />}
                    </span>
                    <div>
                      <strong style={{ fontSize: '0.9375rem', color: '#0f172a', display: 'block' }}>{s.name}</strong>
                      <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>{s.code}</span>
                    </div>
                  </div>
                  <Badge variant={s.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm">
                    {s.status}
                  </Badge>
                </div>

                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    borderRadius: '8px',
                    padding: '0.75rem 1rem',
                    marginBottom: '1rem',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.5rem',
                    fontSize: '0.75rem',
                  }}
                >
                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>Shift Hours</span>
                    <strong style={{ color: '#0f172a', fontSize: '0.875rem' }}>
                      {s.startTime} &rarr; {s.endTime}
                    </strong>
                    {s.isOvernight && (
                      <span style={{ color: '#7c3aed', fontSize: '0.6875rem', display: 'block', fontWeight: 600 }}>
                        Overnight (+1 Day)
                      </span>
                    )}
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>Grace Period</span>
                    <strong style={{ color: '#0f172a', fontSize: '0.875rem' }}>
                      {s.gracePeriodMinutes} mins
                    </strong>
                    <span style={{ color: '#64748b', fontSize: '0.6875rem', display: 'block' }}>
                      Arrival threshold
                    </span>
                  </div>
                  <div style={{ marginTop: '0.25rem' }}>
                    <span style={{ color: '#64748b', display: 'block' }}>Break Duration</span>
                    <strong style={{ color: '#0f172a' }}>{s.breakDurationMinutes} mins</strong>
                    <span style={{ color: '#64748b', fontSize: '0.6875rem', display: 'block' }}>
                      {s.isBreakPaid ? 'Paid Break' : 'Unpaid Break'}
                    </span>
                  </div>
                  <div style={{ marginTop: '0.25rem' }}>
                    <span style={{ color: '#64748b', display: 'block' }}>Assigned Guards</span>
                    <strong style={{ color: '#0f172a' }}>
                      {s._count?.employeeShiftAssignments ?? 0} active
                    </strong>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <Button variant="outline" size="sm" onClick={() => handleOpenEdit(s)} leftIcon={<Edit2 size={13} />}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(s)}
                    style={{ color: '#dc2626' }}
                    leftIcon={<Trash2 size={13} />}
                  >
                    Deactivate
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Modal Create / Edit */}
      {showModal && (
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
              maxWidth: '560px',
              width: '100%',
              padding: '1.5rem',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.25rem' }}>
              {editingShift ? 'Edit Shift Definition' : 'Create New Shift'}
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1.25rem' }}>
              Configure shift hours, overnight parameters, and break policies.
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Shift Code *
                    </label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      placeholder="e.g. SHF-DAY-12"
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Shift Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Standard 12-Hour Day Shift"
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Start Time (HH:mm) *
                    </label>
                    <input
                      type="text"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      placeholder="06:00"
                      pattern="^([01]\d|2[0-3]):([0-5]\d)$"
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      End Time (HH:mm) *
                    </label>
                    <input
                      type="text"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      placeholder="18:00"
                      pattern="^([01]\d|2[0-3]):([0-5]\d)$"
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Shift Type
                    </label>
                    <select
                      value={formData.shiftType}
                      onChange={(e) => setFormData({ ...formData, shiftType: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#ffffff' }}
                    >
                      <option value="DAY">Day Shift</option>
                      <option value="NIGHT">Night Shift</option>
                      <option value="MORNING">Morning Shift</option>
                      <option value="EVENING">Evening Shift</option>
                      <option value="CUSTOM">Custom Shift</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Grace Period (Minutes)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={formData.gracePeriodMinutes}
                      onChange={(e) => setFormData({ ...formData, gracePeriodMinutes: parseInt(e.target.value, 10) || 0 })}
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Break Duration (Minutes)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={360}
                      value={formData.breakDurationMinutes}
                      onChange={(e) => setFormData({ ...formData, breakDurationMinutes: parseInt(e.target.value, 10) || 0 })}
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', padding: '0.5rem 0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.isOvernight}
                      onChange={(e) => setFormData({ ...formData, isOvernight: e.target.checked })}
                    />
                    <span>Overnight Shift (Crosses Midnight)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.isBreakPaid}
                      onChange={(e) => setFormData({ ...formData, isBreakPaid: e.target.checked })}
                    />
                    <span>Paid Break Time</span>
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : editingShift ? 'Save Changes' : 'Create Shift'}
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
