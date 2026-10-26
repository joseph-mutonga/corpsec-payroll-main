'use client';

import React, { useState, useEffect } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { Plus, Calendar, Trash2, Edit2 } from 'lucide-react';

export default function PublicHolidaysPage() {
  const { success, error: toastError } = useToast();
  const [holidays, setHolidays] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<any | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    date: new Date().toISOString().split('T')[0],
    country: 'Kenya',
    description: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchHolidays();
  }, []);

  const fetchHolidays = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/leave/holidays');
      const json = await res.json();
      if (json.success) setHolidays(json.data.holidays);
    } catch (err) {
      toastError('Failed to load public holidays');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (holiday?: any) => {
    if (holiday) {
      setEditingHoliday(holiday);
      setFormData({
        name: holiday.name,
        date: new Date(holiday.date).toISOString().split('T')[0],
        country: holiday.country || 'Kenya',
        description: holiday.description || '',
      });
    } else {
      setEditingHoliday(null);
      setFormData({
        name: '',
        date: new Date().toISOString().split('T')[0],
        country: 'Kenya',
        description: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const url = editingHoliday ? `/api/leave/holidays/${editingHoliday.id}` : '/api/leave/holidays';
      const method = editingHoliday ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      success(editingHoliday ? 'Public holiday updated' : 'Public holiday added');
      setIsModalOpen(false);
      fetchHolidays();
    } catch (err: any) {
      toastError(err.message || 'Failed to save holiday');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this public holiday?')) return;
    try {
      const res = await fetch(`/api/leave/holidays/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      success('Public holiday deleted');
      fetchHolidays();
    } catch (err: any) {
      toastError(err.message || 'Failed to delete holiday');
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <Breadcrumb
            items={[
              { label: 'Leave Management', href: '/leave' },
              { label: 'Gazetted Public Holidays' },
            ]}
          />
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
            Gazetted Public Holidays Calendar
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
            National Kenyan public holidays automatically excluded from working-day leave consumption calculations
          </p>
        </div>

        <Button variant="primary" onClick={() => handleOpenModal()}>
          <Plus size={16} style={{ marginRight: '0.5rem' }} /> Add Holiday
        </Button>
      </div>

      {/* Holidays Table */}
      <Card>
        {isLoading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" />
          </div>
        ) : holidays.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No gazetted public holidays configured.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Holiday Name</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Date</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Country</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Description</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {holidays.map((h) => (
                  <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f172a' }}>
                      {h.name}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#2563eb' }}>
                      {new Date(h.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{h.country}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{h.description || '—'}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <Badge variant={h.isActive ? 'success' : 'neutral'} size="sm">
                        {h.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <Button variant="outline" size="sm" onClick={() => handleOpenModal(h)}>
                          <Edit2 size={14} />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(h.id)}>
                          <Trash2 size={14} color="#ef4444" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingHoliday ? 'Edit Gazetted Holiday' : 'Add Gazetted Public Holiday'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
          <Input
            label="Holiday Name"
            placeholder="e.g. Mashujaa Day, Jamhuri Day"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Input
              label="Date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
            <Input
              label="Country"
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              required
            />
          </div>

          <Input
            label="Description (Optional)"
            placeholder="Gazette notice reference or commemoration notes"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingHoliday ? 'Save Changes' : 'Add Holiday'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
