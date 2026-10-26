'use client';

import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  CheckCircle2,
  Plus,
  RefreshCw,
  Server,
  Activity,
  Cpu,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';

export default function AttendanceDevicesPage() {
  const { showToast } = useToast();
  const [devices, setDevices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [deviceType, setDeviceType] = useState('BIOMETRIC');
  const [ipAddress, setIpAddress] = useState('');
  const [locationName, setLocationName] = useState('');

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/attendance/devices');
      const json = await res.json();
      if (json.success) {
        setDevices(json.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/attendance/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceCode: code,
          name,
          deviceType,
          ipAddress: ipAddress || undefined,
          locationName: locationName || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast({ type: 'success', title: `Device ${json.data.deviceCode} registered!` });
        setShowModal(false);
        setCode('');
        setName('');
        fetchDevices();
      } else {
        showToast({ type: 'error', title: json.error || 'Registration failed' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Error registering device' });
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <Breadcrumb
        items={[
          { label: 'Attendance', href: '/attendance' },
          { label: 'Attendance Devices & Terminals' },
        ]}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Biometric & Clocking Terminals
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
            Manage physical biometric scanners, mobile NFC devices, and terminal connectivity status.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="primary" onClick={() => setShowModal(true)} leftIcon={<Plus size={16} />}>Register Device</Button>
          <Button variant="outline" onClick={fetchDevices} leftIcon={<RefreshCw size={16} />}>Refresh</Button>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="lg" />
            <p style={{ marginTop: '0.5rem', color: '#64748b' }}>Loading registered devices...</p>
          </div>
        ) : devices.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            <Cpu size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
            <p style={{ fontWeight: 600, margin: 0 }}>No attendance devices registered.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Device Code</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Device Name</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Location / Post</th>
                  <th style={{ padding: '0.75rem 1rem' }}>IP Address</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600 }}>{d.deviceCode}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>{d.name}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant="info">{d.deviceType}</Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{d.locationName || d.station?.name || 'N/A'}</td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>{d.ipAddress || 'DHCP'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant={d.isActive ? 'success' : 'neutral'}>{d.isActive ? 'ONLINE' : 'OFFLINE'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '0.75rem', width: '100%', maxWidth: '500px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1rem 0' }}>Register Attendance Device</h2>
            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Device Code *</label>
                <input required type="text" placeholder="e.g. DEV-BIO-001" value={code} onChange={(e) => setCode(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Device Name *</label>
                <input required type="text" placeholder="e.g. HQ Main Gate Biometric Scanner" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Device Type</label>
                <select value={deviceType} onChange={(e) => setDeviceType(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}>
                  <option value="BIOMETRIC">BIOMETRIC SCANNER</option>
                  <option value="RFID">RFID CARD READER</option>
                  <option value="MOBILE">MOBILE APP NFC</option>
                  <option value="WEB">WEB PORTAL KIOSK</option>
                </select>
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Location Description</label>
                <input type="text" placeholder="e.g. Gate A Turnstile" value={locationName} onChange={(e) => setLocationName(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit">Register</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
