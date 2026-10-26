'use client';

import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  MapPin,
  CheckCircle2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { PublicHolidayData } from '@/types';

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<PublicHolidayData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showModal, setShowModal] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<PublicHolidayData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form
  const [formData, setFormData] = useState({
    name: '',
    date: new Date().toISOString().split('T')[0],
    country: 'Kenya',
    description: '',
    isActive: true,
  });

  useEffect(() => {
    fetchHolidays();
  }, [year]);

  const fetchHolidays = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/attendance/holidays?year=${year}`);
      const data = await res.json();
      if (data.success) {
        setHolidays(data.data);
      }
    } catch (err) {
      console.error('Failed to load holidays:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingHoliday(null);
    setFormData({
      name: '',
      date: `${year}-01-01`,
      country: 'Kenya',
      description: '',
      isActive: true,
    });
    setShowModal(true);
  };

  const handleOpenEdit = (h: PublicHolidayData) => {
    setEditingHoliday(h);
    setFormData({
      name: h.name,
      date: new Date(h.date).toISOString().split('T')[0],
      country: h.country,
      description: h.description || '',
      isActive: h.isActive,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setNotification(null);

      const url = editingHoliday
        ? `/api/attendance/holidays/${editingHoliday.id}`
        : '/api/attendance/holidays';
      const method = editingHoliday ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (data.success) {
        setNotification({
          type: 'success',
          message: editingHoliday ? 'Public holiday updated' : 'Public holiday added',
        });
        setShowModal(false);
        fetchHolidays();
      } else {
        setNotification({ type: 'error', message: data.error?.message || 'Failed to save holiday' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error saving holiday' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (h: PublicHolidayData) => {
    if (!confirm(`Are you sure you want to remove holiday "${h.name}"?`)) return;
    try {
      const res = await fetch(`/api/attendance/holidays/${h.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setNotification({ type: 'success', message: 'Public holiday removed successfully' });
        fetchHolidays();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error deleting holiday' });
    }
  };

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'Attendance', href: '/attendance' },
          { label: 'Gazetted Public Holidays (Kenya)' },
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
            Kenya Gazetted Public Holidays
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            National holidays are automatically recognized by the attendance engine and distinguished from absences.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            style={{
              padding: '0.45rem 0.75rem',
              fontSize: '0.8125rem',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              backgroundColor: '#ffffff',
              fontWeight: 600,
            }}
          >
            {[2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y}>
                Calendar Year {y}
              </option>
            ))}
          </select>

          <Button variant="primary" size="sm" onClick={handleOpenCreate} leftIcon={<Plus size={14} />}>
            Add Public Holiday
          </Button>
        </div>
      </div>

      {/* Holidays Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {isLoading ? (
          <div style={{ gridColumn: '1 / -1', padding: '3rem 0', textAlign: 'center' }}>
            <Spinner size="md" message="Loading public holidays..." />
          </div>
        ) : holidays.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '3rem 0', textAlign: 'center', color: '#64748b' }}>
            No public holidays found for year {year}.
          </div>
        ) : (
          holidays.map((h) => {
            const d = new Date(h.date);
            return (
              <Card key={h.id} noPadding>
                <div style={{ padding: '1.25rem 1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(212, 163, 75, 0.15)',
                        color: 'var(--corp-gold-600)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {d.toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <Badge variant="gold" size="sm">{h.country}</Badge>
                  </div>

                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
                    {h.name}
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1rem' }}>
                    {h.description || 'Statutory public holiday across Kenya.'}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                    <Button variant="outline" size="sm" onClick={() => handleOpenEdit(h)} leftIcon={<Edit2 size={13} />}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(h)}
                      style={{ color: '#dc2626' }}
                      leftIcon={<Trash2 size={13} />}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Add / Edit Holiday Modal */}
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
              maxWidth: '480px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.25rem' }}>
              {editingHoliday ? 'Edit Public Holiday' : 'Add Public Holiday'}
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1.25rem' }}>
              Gazetted holiday will apply automatically across all guarding stations.
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                    Holiday Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Mashujaa Day"
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Date *
                    </label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                      Country
                    </label>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                    Description / Gazetting Reference
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="e.g. National Day of Celebration"
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : editingHoliday ? 'Save Changes' : 'Add Holiday'}
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
