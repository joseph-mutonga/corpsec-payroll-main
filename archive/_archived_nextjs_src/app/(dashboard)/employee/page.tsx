'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  UserCheck,
  Banknote,
  FileText,
  CalendarDays,
  Clock,
  MessageSquare,
  FileCheck,
  ShieldCheck,
  ChevronRight,
  TrendingUp,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Building,
  MapPin,
  ArrowUpRight,
  Download,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { EmployeeDashboardStats } from '@/types';

export default function EmployeePortalDashboard() {
  const { toast } = useToast();
  const [stats, setStats] = useState<EmployeeDashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/portal/dashboard');
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      } else {
        toast.error('Error', data.message || 'Failed to load employee dashboard');
      }
    } catch (err: any) {
      toast.error('Error', 'Unable to connect to employee portal service');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <Spinner fullHeight message="Loading your personal HR portal..." />
      </div>
    );
  }

  if (!stats) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
          <AlertCircle size={40} color="#ef4444" style={{ marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.25rem', color: '#0f172a' }}>Unable to Access Employee Profile</h3>
          <p style={{ marginTop: '0.5rem' }}>
            No employee record is associated with your authenticated user account. Please contact HR Operations.
          </p>
          <Button variant="primary" style={{ marginTop: '1.5rem' }} onClick={fetchDashboardStats}>
            Retry Connection
          </Button>
        </div>
      </Card>
    );
  }

  const { employee, currentNetPay, latestPayslip, leaveSummary, attendanceSummary, pendingRequestsCount, lastPayment } = stats;

  return (
    <div style={{ paddingBottom: '3rem' }}>
      {/* 1. Header Banner & Profile Snapshot */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0b1528 0%, #1e293b 100%)',
          borderRadius: '12px',
          padding: '1.75rem 2rem',
          color: '#ffffff',
          marginBottom: '1.75rem',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#d97706',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              fontWeight: 800,
              boxShadow: '0 0 12px rgba(217, 119, 6, 0.4)',
            }}
          >
            {employee.fullName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                Welcome back, {employee.fullName.split(' ')[0]}!
              </h1>
              <Badge variant="success" size="sm">
                {employee.employmentStatus}
              </Badge>
            </div>
            <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginTop: '0.35rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <span>Staff ID: <strong style={{ color: '#f1f5f9' }}>{employee.employeeNumber}</strong></span>
              <span>•</span>
              <span>Position: <strong style={{ color: '#f1f5f9' }}>{employee.jobTitle}</strong></span>
              <span>•</span>
              <span>Dept: <strong style={{ color: '#f1f5f9' }}>{employee.department}</strong></span>
              <span>•</span>
              <span>Station: <strong style={{ color: '#f1f5f9' }}>{employee.station}</strong></span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/employee/profile">
            <Button variant="secondary" size="sm" leftIcon={<UserCheck size={16} />}>
              My Profile
            </Button>
          </Link>
          <Link href="/employee/requests">
            <Button variant="primary" size="sm" leftIcon={<MessageSquare size={16} />}>
              New HR Request
            </Button>
          </Link>
        </div>
      </div>

      {/* 2. Key Summary KPI Metric Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1.25rem',
          marginBottom: '2rem',
        }}
      >
        {/* Card 1: Latest Net Pay */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                Current Net Pay
              </div>
              <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', marginTop: '0.4rem' }}>
                KES {currentNetPay.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <CheckCircle2 size={12} />
                <span>{latestPayslip ? latestPayslip.periodName : 'No closed payroll run yet'}</span>
              </div>
            </div>
            <div style={{ padding: '0.65rem', borderRadius: '10px', backgroundColor: '#f0fdf4', color: '#16a34a' }}>
              <Banknote size={24} />
            </div>
          </div>
          <div style={{ marginTop: '1rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
            <Link href="/employee/payslips" style={{ fontSize: '0.8rem', color: '#0284c7', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>View full payslip breakdown</span>
              <ChevronRight size={14} />
            </Link>
          </div>
        </Card>

        {/* Card 2: Leave Balance */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                Available Annual Leave
              </div>
              <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', marginTop: '0.4rem' }}>
                {leaveSummary.annualAvailable} <span style={{ fontSize: '1rem', fontWeight: 500, color: '#64748b' }}>Days</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                Sick leave: {leaveSummary.sickAvailable} days | {leaveSummary.pendingApplications} pending
              </div>
            </div>
            <div style={{ padding: '0.65rem', borderRadius: '10px', backgroundColor: '#fef3c7', color: '#d97706' }}>
              <CalendarDays size={24} />
            </div>
          </div>
          <div style={{ marginTop: '1rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
            <Link href="/employee/leave" style={{ fontSize: '0.8rem', color: '#0284c7', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Apply for leave days</span>
              <ChevronRight size={14} />
            </Link>
          </div>
        </Card>

        {/* Card 3: Monthly Attendance */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                Attendance ({attendanceSummary.month})
              </div>
              <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', marginTop: '0.4rem' }}>
                {attendanceSummary.daysPresent} <span style={{ fontSize: '1rem', fontWeight: 500, color: '#64748b' }}>Days On Duty</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                Late: {attendanceSummary.daysLate} | OT: {attendanceSummary.overtimeHours} hrs
              </div>
            </div>
            <div style={{ padding: '0.65rem', borderRadius: '10px', backgroundColor: '#e0f2fe', color: '#0284c7' }}>
              <Clock size={24} />
            </div>
          </div>
          <div style={{ marginTop: '1rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
            <Link href="/employee/attendance" style={{ fontSize: '0.8rem', color: '#0284c7', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>View duty & roster log</span>
              <ChevronRight size={14} />
            </Link>
          </div>
        </Card>

        {/* Card 4: Last Payment Status */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                Last Salary Disbursement
              </div>
              <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', marginTop: '0.4rem' }}>
                {lastPayment ? `KES ${lastPayment.amount.toLocaleString()}` : 'Pending Payout'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                {lastPayment ? `${lastPayment.paymentMethod} • ${lastPayment.status}` : 'No payouts processed yet'}
              </div>
            </div>
            <div style={{ padding: '0.65rem', borderRadius: '10px', backgroundColor: '#ede9fe', color: '#7c3aed' }}>
              <CreditCard size={24} />
            </div>
          </div>
          <div style={{ marginTop: '1rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
            <Link href="/employee/payments" style={{ fontSize: '0.8rem', color: '#0284c7', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Download digital receipt</span>
              <ChevronRight size={14} />
            </Link>
          </div>
        </Card>
      </div>

      {/* 3. Quick Actions Hub */}
      <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' }}>
        Employee Self-Service Quick Actions
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <Link href="/employee/payslips" style={{ textDecoration: 'none' }}>
          <Card hoverable style={{ padding: '1.25rem', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '8px', backgroundColor: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={22} />
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>My Payslips</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>View & download monthly PDFs</div>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/employee/payments" style={{ textDecoration: 'none' }}>
          <Card hoverable style={{ padding: '1.25rem', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '8px', backgroundColor: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CreditCard size={22} />
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>Payment Receipts</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Print official bank/M-Pesa receipts</div>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/employee/leave" style={{ textDecoration: 'none' }}>
          <Card hoverable style={{ padding: '1.25rem', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '8px', backgroundColor: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CalendarDays size={22} />
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>Apply for Leave</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Check balances & request time off</div>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/employee/attendance" style={{ textDecoration: 'none' }}>
          <Card hoverable style={{ padding: '1.25rem', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '8px', backgroundColor: '#ede9fe', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={22} />
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>My Attendance</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Duty log & correction requests</div>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/employee/requests" style={{ textDecoration: 'none' }}>
          <Card hoverable style={{ padding: '1.25rem', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '8px', backgroundColor: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageSquare size={22} />
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>HR Service Desk</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Submit ticket ({pendingRequestsCount} active)</div>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/employee/documents" style={{ textDecoration: 'none' }}>
          <Card hoverable style={{ padding: '1.25rem', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '8px', backgroundColor: '#f1f5f9', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileCheck size={22} />
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>HR Letters & Vault</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Order letters & view contracts</div>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      {/* 4. Security & Statutory Compliance Reminder Footer */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>
              Kenyan Employment Act & Statutory Protection
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
              Your personal data, statutory returns (KRA PAYE, NSSF, SHA, Housing Levy), and payment accounts are encrypted and audited according to the Data Protection Act (2019).
            </div>
          </div>
          <Link href="/employee/profile">
            <Button variant="secondary" size="sm">
              Review Personal Data
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
