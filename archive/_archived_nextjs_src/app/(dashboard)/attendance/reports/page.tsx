'use client';

import React, { useState, useEffect } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import {
  FileText,
  Download,
  Printer,
  Calendar,
  Filter,
  Building2,
  MapPin,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

export default function AttendanceReportsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any>(null);
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [stationFilter, setStationFilter] = useState('ALL');
  const [departments, setDepartments] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);

  useEffect(() => {
    fetchOrgUnits();
  }, []);

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate, departmentFilter, stationFilter]);

  const fetchOrgUnits = async () => {
    try {
      const [dRes, sRes] = await Promise.all([fetch('/api/departments'), fetch('/api/stations')]);
      const dData = await dRes.json();
      const sData = await sRes.json();
      if (dData.success) setDepartments(dData.data || []);
      if (sData.success) setStations(sData.data || []);
    } catch (err) {
      console.error('Error fetching org units:', err);
    }
  };

  const fetchReport = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        startDate,
        endDate,
      });
      if (departmentFilter !== 'ALL') params.append('departmentId', departmentFilter);
      if (stationFilter !== 'ALL') params.append('stationId', stationFilter);

      const res = await fetch(`/api/attendance/reports?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setReportData(json.data);
      }
    } catch (err) {
      console.error('Error fetching attendance report:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    const params = new URLSearchParams({
      startDate,
      endDate,
      export: 'csv',
    });
    if (departmentFilter !== 'ALL') params.append('departmentId', departmentFilter);
    if (stationFilter !== 'ALL') params.append('stationId', stationFilter);

    window.open(`/api/attendance/reports?${params.toString()}`, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="no-print">
        <Breadcrumb items={[{ label: 'Attendance', href: '/attendance' }, { label: 'Attendance Reports & Muster Roll' }]} />
      </div>

      {/* Header */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={28} color="#0f1c3f" />
            Attendance Reports & Muster Roll Register
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
            Workforce attendance rates, duty hours, exceptions summary, and printable daily audit reports.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="outline" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Printer size={14} /> Print Report
          </Button>
          <Button variant="primary" onClick={handleExportCsv} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Download size={14} /> Export CSV
          </Button>
        </div>
      </div>

      {/* Filter Controls */}
      <Card noPadding className="no-print">
        <div style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', backgroundColor: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>From:</span>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: '160px' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>To:</span>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: '160px' }} />
          </div>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8125rem' }}
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            value={stationFilter}
            onChange={(e) => setStationFilter(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8125rem' }}
          >
            <option value="ALL">All Guarding Stations</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Printable Report Document Card */}
      <Card noPadding>
        {/* Printable CorpSec Header */}
        <div style={{ padding: '1.5rem', borderBottom: '2px solid #0f1c3f', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#0f1c3f', letterSpacing: '-0.02em' }}>
              CORPSEC INVESTIGATIONS & GUARDING SERVICES
            </h2>
            <div style={{ fontSize: '0.8125rem', color: '#475569', marginTop: '2px' }}>
              Official Duty Attendance & Workforce Muster Roll Register
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
              Period: {startDate} to {endDate} • Generated: {new Date().toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Badge variant="neutral" size="md">CONFIDENTIAL HR RECORD</Badge>
          </div>
        </div>

        {/* Report Content Table */}
        {loading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" />
          </div>
        ) : !reportData || reportData.summary.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No attendance records found for the selected period and filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem', color: '#334155', fontWeight: 700 }}>Employee</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#334155', fontWeight: 700 }}>Department / Station</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#334155', fontWeight: 700 }}>Scheduled</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#334155', fontWeight: 700 }}>Present</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#334155', fontWeight: 700 }}>Absent</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#334155', fontWeight: 700 }}>Late</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#334155', fontWeight: 700 }}>Early Out</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#334155', fontWeight: 700 }}>Leave</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#334155', fontWeight: 700 }}>OT (Hrs)</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#334155', fontWeight: 700 }}>Rate (%)</th>
                </tr>
              </thead>
              <tbody>
                {reportData.summary.map((s: any) => (
                  <tr key={s.employeeId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 700, color: '#0f1c3f' }}>{s.employeeName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{s.employeeNumber}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div>{s.department}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{s.station}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{s.daysScheduled}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#16a34a' }}>{s.daysPresent}</td>
                    <td style={{ padding: '0.75rem 1rem', color: s.daysAbsent > 0 ? '#dc2626' : '#64748b', fontWeight: s.daysAbsent > 0 ? 700 : 400 }}>
                      {s.daysAbsent}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: s.lateDays > 0 ? '#d97706' : '#64748b' }}>{s.lateDays}</td>
                    <td style={{ padding: '0.75rem 1rem', color: s.earlyDepartures > 0 ? '#ea580c' : '#64748b' }}>{s.earlyDepartures}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#0284c7' }}>{s.leaveDays}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f1c3f' }}>{s.overtimeHours}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 800, color: s.attendanceRate >= 90 ? '#16a34a' : '#d97706' }}>
                      {s.attendanceRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
