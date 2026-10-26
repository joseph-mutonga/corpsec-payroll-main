'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastContext';
import {
  User,
  Phone,
  Mail,
  MapPin,
  Building2,
  Calendar,
  CreditCard,
  FileText,
  FileCheck,
  Shield,
  Clock,
  Edit2,
  Activity,
  Archive,
  RotateCcw,
  Upload,
  Download,
  Trash2,
  Eye,
  EyeOff,
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  Briefcase,
  GitFork,
  ExternalLink,
  CalendarDays,
  Printer,
  Award,
  Target,
  TrendingUp,
  GraduationCap,
} from 'lucide-react';
import {
  EmployeeData,
  EmployeeDocumentData,
  EmployeeHistoryData,
  EmployeeAssignmentData,
  BranchData,
  DepartmentData,
  StationData,
  PositionData,
} from '@/types';

export default function EmployeeProfilePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [employee, setEmployee] = useState<EmployeeData | null>(null);
  const [canViewSensitive, setCanViewSensitive] = useState(false);
  const [showUnmaskedPayment, setShowUnmaskedPayment] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Reference data for Transfer modal
  const [branches, setBranches] = useState<BranchData[]>([]);
  const [departments, setDepartments] = useState<DepartmentData[]>([]);
  const [stations, setStations] = useState<StationData[]>([]);
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [supervisors, setSupervisors] = useState<EmployeeData[]>([]);

  // Transfer Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferData, setTransferData] = useState({
    branchId: '',
    departmentId: '',
    stationId: '',
    positionId: '',
    supervisorId: '',
    effectiveDate: new Date().toISOString().split('T')[0],
    reason: '',
  });

  // Status Change Modal State
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('ACTIVE');
  const [statusReason, setStatusReason] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Archive / Restore Modal State
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);

  // Upload Document Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [docType, setDocType] = useState('NATIONAL_ID');
  const [docDescription, setDocDescription] = useState('');
  const [docExpiryDate, setDocExpiryDate] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  // Delete Document Confirmation
  const [deleteDocTarget, setDeleteDocTarget] = useState<EmployeeDocumentData | null>(null);
  const [isDeletingDoc, setIsDeletingDoc] = useState(false);

  // Attendance Data State
  const [employeeAttendance, setEmployeeAttendance] = useState<any[]>([]);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);

  // Leave & Entitlements State (Phase 5)
  const [employeeLeaves, setEmployeeLeaves] = useState<any[]>([]);
  const [employeeEntitlements, setEmployeeEntitlements] = useState<any[]>([]);
  const [isLoadingLeaves, setIsLoadingLeaves] = useState(false);

  // Compensation & Salary State (Phase 6 & 8)
  const [employeeSalaries, setEmployeeSalaries] = useState<any[]>([]);
  const [employeeAllowances, setEmployeeAllowances] = useState<any[]>([]);
  const [employeeDeductions, setEmployeeDeductions] = useState<any[]>([]);
  const [employeePayslips, setEmployeePayslips] = useState<any[]>([]);
  const [activePayslipModal, setActivePayslipModal] = useState<any | null>(null);
  const [isEmployeePayslipModalOpen, setIsEmployeePayslipModalOpen] = useState(false);
  const [isLoadingComp, setIsLoadingComp] = useState(false);
  const [isLoadingPayslips, setIsLoadingPayslips] = useState(false);

  // Payment Disbursements & Transactions State (Phase 9)
  const [employeePayments, setEmployeePayments] = useState<any[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [activeReceiptModal, setActiveReceiptModal] = useState<any | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Performance & Appraisals State (Phase 14)
  const [employeeReviews, setEmployeeReviews] = useState<any[]>([]);
  const [employeeGoals, setEmployeeGoals] = useState<any[]>([]);
  const [employeeDevPlans, setEmployeeDevPlans] = useState<any[]>([]);
  const [isLoadingPerformance, setIsLoadingPerformance] = useState(false);

  // Training & Skills State (Phase 15)
  const [employeeSkills, setEmployeeSkills] = useState<any[]>([]);
  const [employeeCertificates, setEmployeeCertificates] = useState<any[]>([]);
  const [employeeTrainings, setEmployeeTrainings] = useState<any[]>([]);
  const [isLoadingTraining, setIsLoadingTraining] = useState(false);

  useEffect(() => {
    fetchEmployee();
    loadOrgUnits();
    fetchEmployeeAttendance();
    fetchEmployeeLeaves();
    fetchEmployeeCompensation();
    fetchEmployeePayslips();
    fetchEmployeePayments();
    fetchEmployeePerformance();
    fetchEmployeeTrainingData();
  }, [params.id]);

  const fetchEmployeeTrainingData = async () => {
    try {
      setIsLoadingTraining(true);
      const [skillsRes, certsRes, enrRes] = await Promise.all([
        fetch(`/api/training/skills?employeeId=${params.id}`),
        fetch(`/api/training/certificates?employeeId=${params.id}`),
        fetch(`/api/training/enrollments?employeeId=${params.id}`),
      ]);
      const skillsData = await skillsRes.json();
      const certsData = await certsRes.json();
      const enrData = await enrRes.json();
      if (skillsData.success) setEmployeeSkills(skillsData.data.skills || []);
      if (certsData.success) setEmployeeCertificates(certsData.data.certificates || []);
      if (enrData.success) setEmployeeTrainings(enrData.data.enrollments || []);
    } catch (err) {
      console.error('Error fetching employee training records:', err);
    } finally {
      setIsLoadingTraining(false);
    }
  };

  const fetchEmployeePerformance = async () => {
    try {
      setIsLoadingPerformance(true);
      const [revRes, goalRes, devRes] = await Promise.all([
        fetch(`/api/performance/reviews?employeeId=${params.id}`),
        fetch(`/api/performance/goals?employeeId=${params.id}`),
        fetch(`/api/performance/development?employeeId=${params.id}`),
      ]);
      const revData = await revRes.json();
      const goalData = await goalRes.json();
      const devData = await devRes.json();
      if (revData.success) setEmployeeReviews(revData.data.reviews || []);
      if (goalData.success) setEmployeeGoals(goalData.data.goals || []);
      if (devData.success) setEmployeeDevPlans(devData.data.plans || []);
    } catch (err) {
      console.error('Error fetching employee performance records:', err);
    } finally {
      setIsLoadingPerformance(false);
    }
  };

  const fetchEmployeePayments = async () => {
    try {
      setIsLoadingPayments(true);
      const res = await fetch(`/api/payroll/payments/transactions?employeeId=${params.id}`);
      const d = await res.json();
      if (d.success) setEmployeePayments(d.data || []);
    } catch (err) {
      console.error('Error fetching employee payment transactions:', err);
    } finally {
      setIsLoadingPayments(false);
    }
  };

  const fetchEmployeePayslips = async () => {
    try {
      setIsLoadingPayslips(true);
      const res = await fetch(`/api/payroll/payslips?employeeId=${params.id}`);
      const d = await res.json();
      if (d.success) setEmployeePayslips(d.data || []);
    } catch (err) {
      console.error('Error fetching employee payslips:', err);
    } finally {
      setIsLoadingPayslips(false);
    }
  };

  const fetchEmployeeCompensation = async () => {
    try {
      setIsLoadingComp(true);
      const [salRes, alwRes, dedRes] = await Promise.all([
        fetch(`/api/payroll/salaries?employeeId=${params.id}`),
        fetch(`/api/payroll/allowances/assignments?employeeId=${params.id}`),
        fetch(`/api/payroll/deductions/assignments?employeeId=${params.id}`),
      ]);
      if (salRes.ok) {
        const d = await salRes.json();
        if (d.success) setEmployeeSalaries(d.data || []);
      }
      if (alwRes.ok) {
        const d = await alwRes.json();
        if (d.success) setEmployeeAllowances(d.data || []);
      }
      if (dedRes.ok) {
        const d = await dedRes.json();
        if (d.success) setEmployeeDeductions(d.data || []);
      }
    } catch (err) {
      console.error('Error fetching employee compensation:', err);
    } finally {
      setIsLoadingComp(false);
    }
  };

  const fetchEmployeeLeaves = async () => {
    try {
      setIsLoadingLeaves(true);
      const [reqRes, entRes] = await Promise.all([
        fetch(`/api/leave/requests?employeeId=${params.id}&pageSize=20`),
        fetch(`/api/leave/entitlements?employeeId=${params.id}`),
      ]);
      if (reqRes.ok) {
        const d = await reqRes.json();
        if (d.success) setEmployeeLeaves(d.data || []);
      }
      if (entRes.ok) {
        const d = await entRes.json();
        if (d.success) setEmployeeEntitlements(d.data || []);
      }
    } catch (err) {
      console.error('Error fetching employee leaves:', err);
    } finally {
      setIsLoadingLeaves(false);
    }
  };

  const fetchEmployeeAttendance = async () => {
    try {
      setIsLoadingAttendance(true);
      const res = await fetch(`/api/attendance/records?employeeId=${params.id}&limit=10`);
      const data = await res.json();
      if (data.success) {
        setEmployeeAttendance(data.data.records || []);
      }
    } catch (err) {
      console.error('Error fetching employee attendance:', err);
    } finally {
      setIsLoadingAttendance(false);
    }
  };

  const fetchEmployee = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/employees/${params.id}`);
      const data = await res.json();

      if (data.success) {
        setEmployee(data.data);
        setCanViewSensitive(data.data.canViewSensitive || false);
        setNewStatus(data.data.employmentStatus);
      } else {
        toastError('Not Found', data.error?.message || 'Employee record not found.');
      }
    } catch (err) {
      console.error('Fetch employee error:', err);
      toastError('Error', 'Failed to retrieve employee profile.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrgUnits = async () => {
    try {
      const [bRes, dRes, sRes, pRes, allEmpRes] = await Promise.all([
        fetch('/api/branches'),
        fetch('/api/departments'),
        fetch('/api/stations'),
        fetch('/api/positions'),
        fetch('/api/employees?pageSize=100'),
      ]);

      const bData = await bRes.json();
      const dData = await dRes.json();
      const sData = await sRes.json();
      const pData = await pRes.json();
      const allEmpData = await allEmpRes.json();

      if (bData.success) setBranches(bData.data);
      if (dData.success) setDepartments(dData.data);
      if (sData.success) setStations(sData.data);
      if (pData.success) setPositions(pData.data);
      if (allEmpData.success) {
        setSupervisors(allEmpData.data.filter((e: any) => e.id !== params.id));
      }
    } catch (err) {
      console.error('Failed to load reference units:', err);
    }
  };

  const openTransferModal = () => {
    if (!employee) return;
    setTransferData({
      branchId: employee.branchId || branches[0]?.id || '',
      departmentId: employee.departmentId || departments[0]?.id || '',
      stationId: employee.stationId || '',
      positionId: employee.positionId || '',
      supervisorId: employee.supervisorId || '',
      effectiveDate: new Date().toISOString().split('T')[0],
      reason: '',
    });
    setIsTransferModalOpen(true);
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsTransferring(true);
      const res = await fetch(`/api/employees/${params.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transferData),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Transfer Failed', data.error?.message || 'Error processing transfer');
        setIsTransferring(false);
        return;
      }

      success('Transfer Completed', data.data.message || 'Employee transferred successfully.');
      setIsTransferModalOpen(false);
      fetchEmployee();
    } catch (err) {
      toastError('Error', 'Network error executing transfer.');
    } finally {
      setIsTransferring(false);
    }
  };

  const handleStatusChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsUpdatingStatus(true);
      const res = await fetch(`/api/employees/${params.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, reason: statusReason }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Status Change Failed', data.error?.message || 'Error updating status');
        setIsUpdatingStatus(false);
        return;
      }

      success('Status Updated', `Employment status updated to ${newStatus}.`);
      setIsStatusModalOpen(false);
      setStatusReason('');
      fetchEmployee();
    } catch (err) {
      toastError('Error', 'Network error.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleArchiveSubmit = async () => {
    try {
      setIsArchiving(true);
      const res = await fetch(`/api/employees/${params.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: archiveReason || 'Archived from employee profile' }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Archive Failed', data.error?.message || 'Error archiving');
        setIsArchiving(false);
        return;
      }

      success('Employee Archived', 'Record has been moved to archive.');
      setIsArchiveModalOpen(false);
      fetchEmployee();
    } catch (err) {
      toastError('Error', 'Network error.');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleRestoreSubmit = async () => {
    try {
      const res = await fetch(`/api/employees/${params.id}/restore`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Restore Failed', data.error?.message || 'Error restoring');
        return;
      }
      success('Employee Restored', 'Record restored to active directory.');
      fetchEmployee();
    } catch (err) {
      toastError('Error', 'Network error.');
    }
  };

  const handleDocumentUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toastError('File Required', 'Please select a file to upload.');
      return;
    }

    try {
      setIsUploadingDoc(true);
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('documentType', docType);
      if (docDescription) formData.append('description', docDescription);
      if (docExpiryDate) formData.append('expiryDate', docExpiryDate);

      const res = await fetch(`/api/employees/${params.id}/documents`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Upload Failed', data.error?.message || 'Error uploading document');
        setIsUploadingDoc(false);
        return;
      }

      success('Document Uploaded', `${selectedFile.name} uploaded to secure vault.`);
      setIsUploadModalOpen(false);
      setSelectedFile(null);
      setDocDescription('');
      setDocExpiryDate('');
      fetchEmployee();
    } catch (err) {
      toastError('Error', 'Network error uploading document.');
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!deleteDocTarget) return;

    try {
      setIsDeletingDoc(true);
      const res = await fetch(`/api/employees/${params.id}/documents/${deleteDocTarget.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Delete Failed', data.error?.message || 'Could not delete document');
        setIsDeletingDoc(false);
        return;
      }

      success('Document Deleted', 'File removed from vault.');
      setDeleteDocTarget(null);
      fetchEmployee();
    } catch (err) {
      toastError('Error', 'Network error.');
    } finally {
      setIsDeletingDoc(false);
    }
  };

  if (isLoading) {
    return <Spinner fullHeight message="Loading employee profile..." />;
  }

  if (!employee) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <h2>Employee record not found</h2>
        <Link href="/hr/employees">Return to Directory</Link>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success" size="md" dot>Active Duty</Badge>;
      case 'ON_LEAVE':
        return <Badge variant="warning" size="md" dot>On Leave</Badge>;
      case 'SUSPENDED':
        return <Badge variant="danger" size="md" dot>Suspended</Badge>;
      case 'TERMINATED':
        return <Badge variant="danger" size="md">Terminated</Badge>;
      case 'RESIGNED':
        return <Badge variant="neutral" size="md">Resigned</Badge>;
      default:
        return <Badge variant="neutral" size="md">{status}</Badge>;
    }
  };

  const filteredModalStations = stations.filter(
    (s) => !transferData.branchId || s.branchId === transferData.branchId
  );

  const filteredModalPositions = positions.filter(
    (p) => !transferData.departmentId || p.departmentId === transferData.departmentId
  );

  const tabs = [
    { id: 'overview', label: 'Overview & Bio' },
    { id: 'compensation', label: `Salary & Compensation (${employeeSalaries.filter((s: any) => s.status === 'ACTIVE').length ? 'KES ' + (employeeSalaries.find((s: any) => s.status === 'ACTIVE')?.basicSalary || 0).toLocaleString() : 'Not Set'})` },
    { id: 'attendance', label: 'Attendance & Shifts' },
    { id: 'leave', label: `Leave & Balances (${employeeLeaves.length})` },
    { id: 'assignments', label: `Assignments & Transfers (${employee.assignments?.length || 0})` },
    { id: 'employment', label: 'Employment Details' },
    { id: 'contact', label: 'Contact Details' },
    { id: 'nok', label: 'Next of Kin & Emergency' },
    { id: 'payment', label: 'Payment & Disbursement' },
    { id: 'payslips', label: `Payslips History (${employeePayslips.length})` },
    { id: 'statutory', label: 'Statutory Information' },
    { id: 'documents', label: `Documents (${employee.documents?.length || 0})` },
    { id: 'performance', label: `Performance & Appraisals (${employeeReviews.length})` },
    { id: 'skills', label: `Skills & Competencies (${employeeSkills.length})` },
    { id: 'training', label: `Training & Certificates (${employeeTrainings.length})` },
    { id: 'history', label: `Timeline (${employee.history?.length || 0})` },
  ];

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'HR Management', href: '/hr' },
          { label: 'Employee Directory', href: '/hr/employees' },
          { label: employee.fullName },
        ]}
      />

      {/* Profile Header Card */}
      <Card noPadding style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            padding: '1.75rem 2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1.5rem',
          }}
        >
          {/* Avatar & Name Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '16px',
                backgroundColor: '#0f1c3f',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1.75rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                flexShrink: 0,
              }}
            >
              {employee.firstName[0]}
              {employee.lastName[0]}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f' }}>
                  {employee.fullName}
                </h1>
                <Badge variant="gold" size="sm">
                  {employee.employeeNumber}
                </Badge>
                {getStatusBadge(employee.employmentStatus)}
                {employee.isArchived && (
                  <Badge variant="danger" size="sm">
                    Archived
                  </Badge>
                )}
              </div>

              <p style={{ fontSize: '0.875rem', color: '#475569', marginTop: '0.25rem' }}>
                <strong>{employee.position?.title || employee.jobTitle}</strong> &bull; {employee.department?.name || 'No Department'} &bull; {employee.branch?.name || 'Nairobi HQ'}
              </p>

              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <span>National ID: <strong>{employee.nationalId}</strong></span>
                <span>Guarding Station: <strong>{employee.station?.name || 'Field Floating'}</strong></span>
                <span>Supervisor: <strong>{employee.supervisor?.fullName || 'None'}</strong></span>
              </div>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              size="md"
              onClick={openTransferModal}
              leftIcon={<ArrowRightLeft size={15} />}
            >
              Transfer Employee
            </Button>

            <Link href={`/hr/employees/${employee.id}/edit`} style={{ textDecoration: 'none' }}>
              <Button variant="outline" size="md" leftIcon={<Edit2 size={15} />}>
                Edit Profile
              </Button>
            </Link>

            <Button
              variant="secondary"
              size="md"
              onClick={() => setIsStatusModalOpen(true)}
              leftIcon={<Activity size={15} />}
            >
              Change Status
            </Button>

            <Button
              variant="secondary"
              size="md"
              onClick={() => setIsUploadModalOpen(true)}
              leftIcon={<Upload size={15} />}
            >
              Upload Doc
            </Button>

            {employee.isArchived ? (
              <Button
                variant="outline"
                size="md"
                onClick={handleRestoreSubmit}
                style={{ color: '#059669', borderColor: '#a7f3d0' }}
                leftIcon={<RotateCcw size={15} />}
              >
                Restore
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="md"
                onClick={() => setIsArchiveModalOpen(true)}
                style={{ color: '#dc2626' }}
                leftIcon={<Archive size={15} />}
              >
                Archive
              </Button>
            )}
          </div>
        </div>

        {/* Tab Navigation Bar */}
        <div
          style={{
            display: 'flex',
            overflowX: 'auto',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
            padding: '0 1rem',
          }}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '0.875rem 1.25rem',
                  fontSize: '0.8125rem',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#0f1c3f' : '#64748b',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '3px solid #0f1c3f' : '3px solid transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Tab Content Panels */}
      {/* 1. Overview & Bio */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Current Active Assignment Summary Banner */}
          <Card
            title="Current Organizational Deployment & Assignment"
            subtitle="Active branch, guarding station post, department, and supervisory chain"
            action={
              <Button variant="outline" size="sm" onClick={openTransferModal} leftIcon={<ArrowRightLeft size={13} />}>
                Transfer
              </Button>
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', fontSize: '0.875rem' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Job Position & Role:</span>
                <strong style={{ fontSize: '0.9375rem', color: '#0f1c3f' }}>
                  {employee.position?.title || employee.jobTitle}
                </strong>
                <div style={{ fontSize: '0.6875rem', color: '#d97706' }}>{employee.position?.code || 'Standard'}</div>
              </div>

              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Operating Branch:</span>
                <strong style={{ fontSize: '0.9375rem', color: '#0f1c3f' }}>
                  {employee.branch?.name || 'Nairobi HQ'}
                </strong>
                <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{employee.branch?.code || 'HQ'}</div>
              </div>

              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Guarding Station / Post:</span>
                <strong style={{ fontSize: '0.9375rem', color: '#0f1c3f' }}>
                  {employee.station?.name || 'Field Floating (HQ)'}
                </strong>
                <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{employee.station?.code || '—'}</div>
              </div>

              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Department:</span>
                <strong style={{ fontSize: '0.9375rem', color: '#0f1c3f' }}>
                  {employee.department?.name || 'Unassigned'}
                </strong>
                <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{employee.department?.code || '—'}</div>
              </div>

              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Designated Supervisor:</span>
                <strong style={{ fontSize: '0.9375rem', color: '#0f1c3f' }}>
                  {employee.supervisor ? employee.supervisor.fullName : 'No Supervisor'}
                </strong>
                <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{employee.supervisor?.jobTitle || '—'}</div>
              </div>
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
            <Card title="Personal Bio-Data">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                  <span style={{ color: '#64748b' }}>Full Legal Name:</span>
                  <strong>{employee.fullName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                  <span style={{ color: '#64748b' }}>National ID / Passport:</span>
                  <strong>{employee.nationalId}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                  <span style={{ color: '#64748b' }}>Date of Birth:</span>
                  <span>{employee.dateOfBirth ? new Date(employee.dateOfBirth).toLocaleDateString() : '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                  <span style={{ color: '#64748b' }}>Gender:</span>
                  <span style={{ textTransform: 'capitalize' }}>{employee.gender.toLowerCase()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                  <span style={{ color: '#64748b' }}>Marital Status:</span>
                  <span>{employee.maritalStatus || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Nationality:</span>
                  <span>{employee.nationality}</span>
                </div>
              </div>
            </Card>

            <Card title="Contact & Residence Snapshot">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                  <span style={{ color: '#64748b' }}>Primary Mobile:</span>
                  <strong>{employee.primaryPhone}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                  <span style={{ color: '#64748b' }}>Email:</span>
                  <span>{employee.email || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                  <span style={{ color: '#64748b' }}>County &amp; City:</span>
                  <span>{employee.county || 'Nairobi'} &bull; {employee.townCity || 'Nairobi'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                  <span style={{ color: '#64748b' }}>Employment Date:</span>
                  <span>{new Date(employee.employmentDate).toLocaleDateString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Preferred Payment:</span>
                  <Badge variant="neutral" size="sm">{employee.preferredPaymentMethod || 'BANK'}</Badge>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* 2. Attendance & Shifts */}
      {activeTab === 'attendance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Active Shift Assignment Summary */}
          <Card
            title="Active Shift Assignment & Duty Pattern"
            subtitle="Configured work hours, overnight crossing parameters, and grace periods"
            action={
              <Link href="/attendance/schedules" style={{ textDecoration: 'none' }}>
                <Button variant="outline" size="sm" leftIcon={<Clock size={13} />}>
                  Manage Roster
                </Button>
              </Link>
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', fontSize: '0.875rem' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Primary Assigned Shift:</span>
                <strong style={{ fontSize: '1rem', color: '#0f1c3f' }}>
                  {employee.shiftAssignments?.[0]?.shift?.name || 'Standard 12-Hour Day Shift'}
                </strong>
                <div style={{ fontSize: '0.6875rem', color: '#d97706' }}>
                  {employee.shiftAssignments?.[0]?.shift?.code || 'SHF-DAY-12'}
                </div>
              </div>

              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Shift Hours & Overnight:</span>
                <strong style={{ fontSize: '1rem', color: '#0f1c3f' }}>
                  {employee.shiftAssignments?.[0]?.shift?.startTime || '06:00'} &rarr;{' '}
                  {employee.shiftAssignments?.[0]?.shift?.endTime || '18:00'}
                </strong>
                <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                  {employee.shiftAssignments?.[0]?.shift?.isOvernight ? 'Crosses Midnight (+1 Day)' : 'Standard Daytime'}
                </div>
              </div>

              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Grace Period Threshold:</span>
                <strong style={{ fontSize: '1rem', color: '#0f1c3f' }}>
                  {employee.shiftAssignments?.[0]?.shift?.gracePeriodMinutes || 15} Minutes
                </strong>
                <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>Before late arrival penalty</div>
              </div>

              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Work Schedule Pattern:</span>
                <strong style={{ fontSize: '1rem', color: '#0f1c3f' }}>
                  {employee.shiftAssignments?.[0]?.workSchedule?.name || 'Security 6 Days On / 1 Day Off'}
                </strong>
                <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                  Cycle: {employee.shiftAssignments?.[0]?.workSchedule?.cycleDays || 7} days
                </div>
              </div>
            </div>
          </Card>

          {/* Recent Attendance History Table */}
          <Card
            title="Recent Duty Logs & Clock Records"
            subtitle="Verified work hours, late arrivals, overtime, and approval status"
            action={
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Link href="/attendance/overtime" style={{ textDecoration: 'none' }}>
                  <Button variant="outline" size="sm">
                    Log Overtime
                  </Button>
                </Link>
                <Link href="/attendance" style={{ textDecoration: 'none' }}>
                  <Button variant="primary" size="sm">
                    Full Attendance Hub
                  </Button>
                </Link>
              </div>
            }
          >
            {isLoadingAttendance ? (
              <div style={{ padding: '2rem 0', textAlign: 'center' }}>
                <Spinner size="md" message="Loading attendance logs..." />
              </div>
            ) : employeeAttendance.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.875rem', padding: '1.5rem 0', textAlign: 'center' }}>
                No attendance records logged for this employee yet.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700 }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Work Date</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Clock In</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Clock Out</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Worked Hours</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Late / OT</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Approval</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeAttendance.map((rec: any) => (
                      <tr key={rec.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                          {new Date(rec.date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: rec.actualClockIn ? '#0f172a' : '#94a3b8' }}>
                          {rec.actualClockIn
                            ? new Date(rec.actualClockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: rec.actualClockOut ? '#0f172a' : '#94a3b8' }}>
                          {rec.actualClockOut
                            ? new Date(rec.actualClockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                          {Math.round((rec.workedMinutes / 60) * 10) / 10} hrs
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {rec.lateMinutes > 0 && (
                            <span style={{ color: '#d97706', fontSize: '0.6875rem', display: 'block', fontWeight: 600 }}>
                              +{rec.lateMinutes}m Late
                            </span>
                          )}
                          {rec.overtimeMinutes > 0 && (
                            <span style={{ color: '#059669', fontSize: '0.6875rem', display: 'block', fontWeight: 600 }}>
                              +{Math.round((rec.overtimeMinutes / 60) * 10) / 10}h OT
                            </span>
                          )}
                          {rec.lateMinutes === 0 && rec.overtimeMinutes === 0 && (
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <Badge
                            variant={
                              rec.attendanceStatus === 'PRESENT' || rec.attendanceStatus === 'PRESENT_WITH_OVERTIME'
                                ? 'success'
                                : rec.attendanceStatus === 'LATE'
                                ? 'warning'
                                : rec.attendanceStatus === 'ABSENT'
                                ? 'danger'
                                : 'neutral'
                            }
                            size="sm"
                          >
                            {rec.attendanceStatus}
                          </Badge>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <Badge
                            variant={
                              rec.approvalStatus === 'APPROVED'
                                ? 'success'
                                : rec.approvalStatus === 'LOCKED'
                                ? 'gold'
                                : 'neutral'
                            }
                            size="sm"
                          >
                            {rec.approvalStatus}
                          </Badge>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <Link href={`/attendance/corrections?recordId=${rec.id}`} style={{ textDecoration: 'none' }}>
                            <Button variant="ghost" size="sm">
                              Correct
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Leave & Entitlements Tab (Phase 5) */}
      {activeTab === 'leave' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Leave Entitlements Cards */}
          <Card
            title={`Active Leave Entitlements & Balances (${new Date().getFullYear()})`}
            subtitle="Annual statutory leave, medical sick days, maternity/paternity, and carried forward balance"
            action={
              <Link href="/leave" style={{ textDecoration: 'none' }}>
                <Button variant="outline" size="sm" leftIcon={<ExternalLink size={13} />}>
                  Leave Center
                </Button>
              </Link>
            }
          >
            {isLoadingLeaves ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading leave balances...</div>
            ) : employeeEntitlements.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                No active leave entitlements found for this employee.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '1rem',
                }}
              >
                {employeeEntitlements.map((ent: any) => (
                  <div
                    key={ent.id}
                    style={{
                      padding: '1rem',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#f8fafc',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          fontWeight: 700,
                          color: ent.leaveType?.color || '#0f1c3f',
                        }}
                      >
                        {ent.leaveType?.name}
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.125rem 0.5rem',
                          borderRadius: '6px',
                          backgroundColor: '#ecfdf5',
                          color: '#059669',
                          fontWeight: 700,
                        }}
                      >
                        {ent.availableBalance}d Avail
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '0.5rem',
                        fontSize: '0.6875rem',
                        color: '#64748b',
                        paddingTop: '0.5rem',
                        borderTop: '1px solid #e2e8f0',
                      }}
                    >
                      <div>
                        <span>Entitled:</span>
                        <strong style={{ display: 'block', color: '#0f172a' }}>{ent.entitledDays}d</strong>
                      </div>
                      <div>
                        <span>Used:</span>
                        <strong style={{ display: 'block', color: '#0f172a' }}>{ent.usedDays}d</strong>
                      </div>
                      <div>
                        <span>Pending:</span>
                        <strong style={{ display: 'block', color: '#d97706' }}>{ent.pendingDays}d</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Leave History Table */}
          <Card
            title="Leave Applications & Approval History"
            subtitle="Record of submitted, approved, and completed off-duty applications"
            action={
              <Link href="/leave/requests" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="sm" leftIcon={<CalendarDays size={13} />}>
                  Apply For Leave
                </Button>
              </Link>
            }
          >
            {isLoadingLeaves ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading leave history...</div>
            ) : employeeLeaves.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                No leave requests on file for this employee.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Request #</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Leave Type</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Dates</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Days</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Reason</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeLeaves.map((req: any) => (
                      <tr key={req.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600, color: '#0f1c3f' }}>
                          <Link href={`/leave/requests?id=${req.id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                            {req.requestNumber}
                          </Link>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{req.leaveType?.name}</td>
                        <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                          {new Date(req.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} -{' '}
                          {new Date(req.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700 }}>
                          {req.durationDays}d
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#64748b', maxWidth: '200px' }}>
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {req.reason}
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <Badge
                            variant={
                              req.status === 'APPROVED'
                                ? 'success'
                                : req.status === 'SUBMITTED' || req.status === 'UNDER_REVIEW'
                                ? 'warning'
                                : req.status === 'REJECTED'
                                ? 'danger'
                                : 'neutral'
                            }
                            size="sm"
                          >
                            {req.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Salary & Compensation Tab (Phase 6) */}
      {activeTab === 'compensation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Active Salary & Pay Matrix Banner */}
          {(() => {
            const activeSalary = employeeSalaries.find((s: any) => s.status === 'ACTIVE');
            const pendingProposal = employeeSalaries.find((s: any) => s.status === 'PENDING_APPROVAL');

            return (
              <>
                <Card
                  title="Current Active Salary Structure"
                  subtitle="Base compensation, pay frequency, overtime eligibility, and approval details"
                  action={
                    <Link href="/payroll/salaries" style={{ textDecoration: 'none' }}>
                      <Button variant="outline" size="sm" leftIcon={<ExternalLink size={13} />}>
                        Propose Salary Revision
                      </Button>
                    </Link>
                  }
                >
                  {isLoadingComp ? (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                      <Spinner message="Loading compensation details..." />
                    </div>
                  ) : !activeSalary ? (
                    <div
                      style={{
                        padding: '1.5rem',
                        backgroundColor: '#fffbeb',
                        border: '1px solid #fde68a',
                        borderRadius: '8px',
                        color: '#b45309',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <strong>No Active Salary Structure Assigned</strong>
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem' }}>
                          This employee cannot be calculated in payroll until an active basic salary is configured.
                        </p>
                      </div>
                      <Link href="/payroll/salaries" style={{ textDecoration: 'none' }}>
                        <Button variant="primary" size="sm">
                          Assign Basic Salary
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Monthly Basic Salary:</span>
                        <strong style={{ fontSize: '1.375rem', color: '#0f1c3f', display: 'block', marginTop: '0.125rem' }}>
                          {activeSalary.currency} {activeSalary.basicSalary.toLocaleString()}
                        </strong>
                        <span style={{ fontSize: '0.6875rem', color: '#059669', fontWeight: 600 }}>
                          Per {activeSalary.payFrequency.toLowerCase()}
                        </span>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Overtime Eligibility:</span>
                        <div style={{ marginTop: '0.25rem' }}>
                          <Badge variant={activeSalary.isOvertimeEligible ? 'success' : 'neutral'} size="sm">
                            {activeSalary.isOvertimeEligible ? 'Eligible (1.5x / 2.0x)' : 'Exempt / Fixed'}
                          </Badge>
                        </div>
                        <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block', marginTop: '0.25rem' }}>
                          Divisor: 225 hrs/mo
                        </span>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Effective Date:</span>
                        <strong style={{ fontSize: '0.9375rem', color: '#334155', display: 'block', marginTop: '0.125rem' }}>
                          {new Date(activeSalary.effectiveFrom).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </strong>
                        <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                          Reason: {activeSalary.changeReason || 'Initial appointment'}
                        </span>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Approval Status:</span>
                        <div style={{ marginTop: '0.25rem' }}>
                          <Badge variant="success" size="sm">
                            Active &amp; Approved
                          </Badge>
                        </div>
                        <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block', marginTop: '0.25rem' }}>
                          By: {activeSalary.approvedBy?.firstName || 'HR Admin'}
                        </span>
                      </div>
                    </div>
                  )}
                </Card>

                {/* Pending Proposal Notice if Any */}
                {pendingProposal && (
                  <div
                    style={{
                      padding: '1.25rem 1.5rem',
                      backgroundColor: '#f5f3ff',
                      border: '1px solid #ddd6fe',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ color: '#5b21b6', fontSize: '0.9375rem' }}>
                          Pending Salary Revision Proposal
                        </strong>
                        <Badge variant="warning" size="sm">
                          Pending Review
                        </Badge>
                      </div>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#6b21a8' }}>
                        Proposed new rate: <strong>{pendingProposal.currency} {pendingProposal.basicSalary.toLocaleString()}</strong> (Effective:{' '}
                        {new Date(pendingProposal.effectiveFrom).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}) &bull;{' '}
                        {pendingProposal.changeReason}
                      </p>
                    </div>
                    <Link href="/payroll/salaries" style={{ textDecoration: 'none' }}>
                      <Button variant="primary" size="sm">
                        Review in Payroll Desk
                      </Button>
                    </Link>
                  </div>
                )}
              </>
            );
          })()}

          {/* Active Allowances & Deductions Grids */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
            {/* Allowances Card */}
            <Card
              title={`Assigned Allowances (${employeeAllowances.filter((a: any) => a.status === 'ACTIVE').length})`}
              subtitle="Monthly recurring allowances and taxable fringe benefits"
              action={
                <Link href="/payroll/allowances" style={{ textDecoration: 'none' }}>
                  <Button variant="ghost" size="sm">
                    Manage
                  </Button>
                </Link>
              }
            >
              {employeeAllowances.filter((a: any) => a.status === 'ACTIVE').length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '0.8125rem', padding: '1rem 0', textAlign: 'center' }}>
                  No active allowances assigned to this employee.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {employeeAllowances
                    .filter((a: any) => a.status === 'ACTIVE')
                    .map((a: any) => (
                      <div
                        key={a.id}
                        style={{
                          padding: '0.75rem 1rem',
                          backgroundColor: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: '0.875rem', color: '#0f1c3f' }}>{a.allowanceType?.name}</strong>
                          <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                            {a.calculationMethod.replace(/_/g, ' ')} &bull; Effective:{' '}
                            {new Date(a.effectiveFrom).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                          </div>
                        </div>
                        <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#059669' }}>
                          + KES {a.amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </Card>

            {/* Deductions Card */}
            <Card
              title={`Assigned Deductions (${employeeDeductions.filter((d: any) => d.status === 'ACTIVE').length})`}
              subtitle="Voluntary contributions, SACCO, welfare, and advance recoveries"
              action={
                <Link href="/payroll/deductions" style={{ textDecoration: 'none' }}>
                  <Button variant="ghost" size="sm">
                    Manage
                  </Button>
                </Link>
              }
            >
              {employeeDeductions.filter((d: any) => d.status === 'ACTIVE').length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '0.8125rem', padding: '1rem 0', textAlign: 'center' }}>
                  No active voluntary deductions assigned.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {employeeDeductions
                    .filter((d: any) => d.status === 'ACTIVE')
                    .map((d: any) => (
                      <div
                        key={d.id}
                        style={{
                          padding: '0.75rem 1rem',
                          backgroundColor: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: '0.875rem', color: '#0f1c3f' }}>{d.deductionType?.name}</strong>
                          <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                            {d.currentBalance !== null && d.currentBalance !== undefined
                              ? `Balance: KES ${d.currentBalance.toLocaleString()}`
                              : 'Recurring Monthly'}
                          </div>
                        </div>
                        <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#dc2626' }}>
                          - KES {d.amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          </div>

          {/* Historical Salary Revisions Timeline */}
          <Card
            title="Complete Historical Salary Revision Timeline"
            subtitle="Immutable historical audit log of all salary modifications, dates, and approvers"
          >
            {employeeSalaries.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.8125rem', padding: '1.5rem 0', textAlign: 'center' }}>
                No historical salary revisions logged.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', paddingLeft: '1.5rem' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: '7px',
                    top: '10px',
                    bottom: '10px',
                    width: '2px',
                    backgroundColor: '#e2e8f0',
                  }}
                />

                {employeeSalaries.map((sal: any) => {
                  const isActive = sal.status === 'ACTIVE';
                  return (
                    <div key={sal.id} style={{ position: 'relative' }}>
                      <div
                        style={{
                          position: 'absolute',
                          left: '-1.85rem',
                          top: '4px',
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          backgroundColor: isActive ? '#059669' : sal.status === 'PENDING_APPROVAL' ? '#7c3aed' : '#94a3b8',
                          border: '2px solid #ffffff',
                        }}
                      />

                      <div
                        style={{
                          padding: '1rem 1.25rem',
                          backgroundColor: isActive ? '#f0fdf4' : '#f8fafc',
                          borderRadius: '8px',
                          border: isActive ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <strong style={{ fontSize: '1rem', color: '#0f1c3f' }}>
                              {sal.currency} {sal.basicSalary.toLocaleString()} / {sal.payFrequency.toLowerCase()}
                            </strong>
                            <Badge
                              variant={
                                sal.status === 'ACTIVE'
                                  ? 'success'
                                  : sal.status === 'PENDING_APPROVAL'
                                  ? 'warning'
                                  : sal.status === 'SUPERSEDED'
                                  ? 'neutral'
                                  : 'danger'
                              }
                              size="sm"
                            >
                              {sal.status}
                            </Badge>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Effective:{' '}
                            {new Date(sal.effectiveFrom).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {sal.effectiveTo &&
                              ` to ${new Date(sal.effectiveTo).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                          </span>
                        </div>

                        <p style={{ margin: '0.25rem 0', fontSize: '0.8125rem', color: '#475569' }}>
                          Reason: <strong>{sal.changeReason || 'Routine Salary Assignment'}</strong>
                        </p>

                        <div style={{ fontSize: '0.6875rem', color: '#94a3b8', display: 'flex', gap: '1rem' }}>
                          {sal.proposedBy && <span>Proposed by: {sal.proposedBy.firstName}</span>}
                          {sal.approvedBy && <span>Approved by: {sal.approvedBy.firstName}</span>}
                          {sal.approvedAt && <span>Approved on: {new Date(sal.approvedAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 3. Assignments & Transfers Timeline */}
      {activeTab === 'assignments' && (
        <Card
          title="Organizational Assignment & Transfer History"
          subtitle="Audit log of branch reassignments, station rotations, and job promotions"
          action={
            <Button variant="primary" size="sm" onClick={openTransferModal} leftIcon={<ArrowRightLeft size={14} />}>
              Execute Transfer
            </Button>
          }
        >
          {employee.assignments && employee.assignments.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', paddingLeft: '1.5rem' }}>
              <div
                style={{
                  position: 'absolute',
                  left: '7px',
                  top: '10px',
                  bottom: '10px',
                  width: '2px',
                  backgroundColor: '#e2e8f0',
                }}
              />

              {employee.assignments.map((asg) => {
                const isActive = asg.status === 'ACTIVE';
                return (
                  <div key={asg.id} style={{ position: 'relative' }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: '-1.85rem',
                        top: '4px',
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: isActive ? '#059669' : '#94a3b8',
                        border: '2px solid #ffffff',
                      }}
                    />

                    <div
                      style={{
                        padding: '1.125rem 1.25rem',
                        backgroundColor: isActive ? '#f0fdf4' : '#f8fafc',
                        borderRadius: '8px',
                        border: isActive ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{ fontSize: '0.9375rem', color: '#0f172a' }}>
                            {asg.jobTitle}
                          </strong>
                          <Badge variant={isActive ? 'success' : 'neutral'} size="sm">
                            {asg.status}
                          </Badge>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {new Date(asg.startDate).toLocaleDateString()} &rarr;{' '}
                          {asg.endDate ? new Date(asg.endDate).toLocaleDateString() : 'Present'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.8125rem', color: '#475569' }}>
                        <div>
                          Branch: <strong>{asg.branch?.name}</strong>
                        </div>
                        <div>
                          Station: <strong>{asg.station?.name || 'HQ / Unassigned'}</strong>
                        </div>
                        <div>
                          Department: <strong>{asg.department?.name}</strong>
                        </div>
                        <div>
                          Supervisor: <strong>{asg.supervisor?.fullName || 'None'}</strong>
                        </div>
                      </div>

                      {asg.reason && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                          Justification: {asg.reason}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: '#64748b', fontSize: '0.875rem', padding: '1.5rem 0', textAlign: 'center' }}>
              No assignment records found.
            </p>
          )}
        </Card>
      )}

      {/* 3. Employment Details */}
      {activeTab === 'employment' && (
        <Card title="Employment Parameters">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', fontSize: '0.875rem' }}>
            <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>Job Title:</span>
              <strong style={{ fontSize: '1rem', color: '#0f1c3f' }}>{employee.jobTitle}</strong>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>Employment Type:</span>
              <Badge variant="gold" size="sm">{employee.employmentType}</Badge>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>Employment Start Date:</span>
              <strong>{new Date(employee.employmentDate).toLocaleDateString()}</strong>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>Contract Start:</span>
              <span>{employee.contractStartDate ? new Date(employee.contractStartDate).toLocaleDateString() : '—'}</span>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>Contract End:</span>
              <span>{employee.contractEndDate ? new Date(employee.contractEndDate).toLocaleDateString() : 'Indefinite / Permanent'}</span>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>Status:</span>
              {getStatusBadge(employee.employmentStatus)}
            </div>
          </div>
        </Card>
      )}

      {/* 4. Contact Details */}
      {activeTab === 'contact' && (
        <Card title="Contact Information & Residential Location">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', fontSize: '0.875rem' }}>
            <div>
              <span style={{ color: '#64748b', display: 'block' }}>Primary Phone Number:</span>
              <strong>{employee.primaryPhone}</strong>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block' }}>Alternative Phone:</span>
              <strong>{employee.alternativePhone || '—'}</strong>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block' }}>Email Address:</span>
              <strong>{employee.email || '—'}</strong>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block' }}>Physical Residence Address:</span>
              <strong>{employee.physicalAddress || '—'}</strong>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block' }}>County:</span>
              <strong>{employee.county || 'Nairobi'}</strong>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block' }}>Town / City:</span>
              <strong>{employee.townCity || 'Nairobi'}</strong>
            </div>
          </div>
        </Card>
      )}

      {/* 5. Next of Kin & Emergency Contacts */}
      {activeTab === 'nok' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card title="Next of Kin Records">
            {employee.nextOfKin && employee.nextOfKin.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                {employee.nextOfKin.map((nok, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '1rem',
                      backgroundColor: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '0.9375rem', color: '#0f1c3f' }}>{nok.fullName}</strong>
                      <Badge variant="gold" size="sm">{nok.relationship}</Badge>
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div>Phone: <strong>{nok.primaryPhone}</strong></div>
                      {nok.alternativePhone && <div>Alt Phone: {nok.alternativePhone}</div>}
                      {nok.physicalAddress && <div>Address: {nok.physicalAddress}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No next of kin records added.</p>
            )}
          </Card>

          <Card title="Emergency Contacts">
            {employee.emergencyContacts && employee.emergencyContacts.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                {employee.emergencyContacts.map((ec, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '1rem',
                      backgroundColor: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '0.9375rem', color: '#0f1c3f' }}>{ec.fullName}</strong>
                      <Badge variant="neutral" size="sm">{ec.relationship}</Badge>
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div>Emergency Phone: <strong>{ec.primaryPhone}</strong></div>
                      {ec.physicalAddress && <div>Address: {ec.physicalAddress}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No emergency contact records added.</p>
            )}
          </Card>
        </div>
      )}

      {/* 6. Payment Details */}
      {activeTab === 'payment' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card
            title="Employee Banking &amp; Payment Destinations"
            subtitle="Configured disbursement methods for payroll payout batches"
            action={
              canViewSensitive ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUnmaskedPayment(!showUnmaskedPayment)}
                  leftIcon={showUnmaskedPayment ? <EyeOff size={14} /> : <Eye size={14} />}
                >
                  {showUnmaskedPayment ? 'Mask Sensitive Numbers' : 'Unmask Sensitive Details'}
                </Button>
              ) : (
                <Badge variant="neutral" size="sm">
                  Restricted Access
                </Badge>
              )
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', fontSize: '0.875rem' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Preferred Disbursement Channel:</span>
                <strong style={{ fontSize: '1rem', color: '#0f1c3f' }}>{employee.preferredPaymentMethod || 'BANK'}</strong>
              </div>

              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Bank Name:</span>
                <strong>{employee.bankName || '—'}</strong>
              </div>

              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Bank Account Holder Name:</span>
                <strong>{employee.bankAccountName || '—'}</strong>
              </div>

              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Bank Account Number:</span>
                <code style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#0f1c3f' }}>
                  {showUnmaskedPayment ? employee.bankAccountNumber || '—' : employee.bankAccountNumber ? `****${employee.bankAccountNumber.slice(-4)}` : '—'}
                </code>
              </div>

              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Bank Branch:</span>
                <strong>{employee.bankBranch || '—'}</strong>
              </div>

              <div>
                <span style={{ color: '#64748b', display: 'block' }}>M-Pesa Registered Number:</span>
                <code style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#059669' }}>
                  {showUnmaskedPayment ? employee.mpesaPhoneNumber || '—' : employee.mpesaPhoneNumber ? `${employee.mpesaPhoneNumber.slice(0, 6)}****${employee.mpesaPhoneNumber.slice(-4)}` : '—'}
                </code>
              </div>
            </div>
          </Card>

          {/* Historical Payment Transactions */}
          <div style={{ marginTop: '1.5rem' }}>
            <Card
              title={`Disbursement & Payment History (${employeePayments.length})`}
              subtitle="Audited ledger of bank EFT and M-Pesa salary payments disbursed to this staff member"
            >
              {isLoadingPayments ? (
                <div style={{ padding: '2rem 0', textAlign: 'center' }}>
                  <Spinner fullHeight message="Loading employee payment transactions..." />
                </div>
              ) : employeePayments.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Transaction #</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Period / Batch</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Net Salary</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Method</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Gateway Reference</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Payment Date</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Status</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeePayments.map((p: any) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f172a' }}>
                            {p.transactionNumber}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                            {p.paymentBatch?.payrollPeriod?.name || p.paymentBatch?.name || 'Monthly Payroll'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>
                            KES {p.amount.toLocaleString()}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <Badge variant={p.paymentMethod === 'MPESA' ? 'success' : 'info'}>
                              {p.paymentMethod}
                            </Badge>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: '#0284c7' }}>
                            {p.providerReference || 'N/A'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                            {new Date(p.completedAt || p.createdAt).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                            {p.status === 'SUCCESS' ? (
                              <Badge variant="success">Paid</Badge>
                            ) : p.status === 'FAILED' ? (
                              <Badge variant="danger">Failed</Badge>
                            ) : (
                              <Badge variant="neutral">{p.status}</Badge>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                            <Link href="/payroll/payment-history" style={{ textDecoration: 'none' }}>
                              <Button variant="outline" size="sm" leftIcon={<FileText size={12} />}>
                                View Receipt
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b' }}>
                  <p style={{ margin: 0 }}>No payment transactions disbursed for this employee yet.</p>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* 7. Statutory Details */}
      {activeTab === 'statutory' && (
        <Card title="Kenyan Statutory Identifiers" subtitle="Kenya Revenue Authority, NSSF, SHA, and Housing Levy records">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', fontSize: '0.875rem' }}>
            <div>
              <span style={{ color: '#64748b', display: 'block' }}>KRA PIN (Tax Identifier):</span>
              <strong style={{ fontSize: '1.0625rem', color: '#0f1c3f' }}>{employee.kraPin || '—'}</strong>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block' }}>NSSF Member Number:</span>
              <strong>{employee.nssfNumber || '—'}</strong>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block' }}>SHA / NHIF Identification Number:</span>
              <strong>{employee.shaNumber || '—'}</strong>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block' }}>Affordable Housing Levy (AHL) Ref:</span>
              <strong>{employee.housingLevyNumber || '—'}</strong>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block' }}>HELB Student Loan Account:</span>
              <strong>{employee.helbNumber || '—'}</strong>
            </div>
          </div>
        </Card>
      )}

      {/* 8. Documents Vault */}
      {activeTab === 'documents' && (
        <Card
          title="Employee Document Storage & Compliance Vault"
          subtitle="Encrypted document archival with access authorization"
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsUploadModalOpen(true)}
              leftIcon={<Upload size={14} />}
            >
              Upload New Document
            </Button>
          }
        >
          {employee.documents && employee.documents.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {employee.documents.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    padding: '1rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        backgroundColor: '#f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#0f1c3f',
                      }}
                    >
                      <FileCheck size={20} />
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>{doc.fileName}</strong>
                        <Badge variant="gold" size="sm">{doc.documentType}</Badge>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                        {(doc.fileSize / 1024).toFixed(1)} KB &bull; Uploaded on {new Date(doc.createdAt).toLocaleDateString()} by {doc.uploadedBy?.firstName || 'HR Admin'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <a
                      href={`/api/employees/${employee.id}/documents/${doc.id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: 'none' }}
                    >
                      <Button variant="outline" size="sm" leftIcon={<Download size={14} />}>
                        Download
                      </Button>
                    </a>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteDocTarget(doc)}
                      style={{ color: '#dc2626' }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#64748b', fontSize: '0.875rem', padding: '1.5rem 0', textAlign: 'center' }}>
              No documents have been uploaded for this employee yet.
            </p>
          )}
        </Card>
      )}

      {/* 9. Career History & Timeline */}
      {activeTab === 'history' && (
        <Card title="Career History & Audit Timeline" subtitle="Chronological record of status changes, station transfers, and promotions">
          {employee.history && employee.history.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', paddingLeft: '1.5rem' }}>
              <div
                style={{
                  position: 'absolute',
                  left: '7px',
                  top: '10px',
                  bottom: '10px',
                  width: '2px',
                  backgroundColor: '#e2e8f0',
                }}
              />

              {employee.history.map((hist) => (
                <div key={hist.id} style={{ position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: '-1.85rem',
                      top: '4px',
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: '#0f1c3f',
                      border: '2px solid #ffffff',
                    }}
                  />

                  <div
                    style={{
                      padding: '0.875rem 1rem',
                      backgroundColor: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>{hist.description}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {new Date(hist.createdAt).toLocaleDateString()} {new Date(hist.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Recorded by: {hist.performedBy?.firstName || 'System Administrator'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#64748b', fontSize: '0.875rem', padding: '1.5rem 0', textAlign: 'center' }}>
              No timeline history entries recorded yet.
            </p>
          )}
        </Card>
      )}

      {/* 10. Payslips & Historical Payroll Records */}
      {activeTab === 'payslips' && (
        <Card
          title="Employee Payslips &amp; Payroll History"
          subtitle="Complete historical archive of monthly payslips, statutory deductions, and net salary payments"
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <Link href="/payroll/payslips" style={{ textDecoration: 'none' }}>
              <Button variant="outline" size="sm" leftIcon={<FileText size={14} />}>
                Open Payslips Vault
              </Button>
            </Link>
          </div>
          {isLoadingPayslips ? (
            <div style={{ padding: '2rem 0', textAlign: 'center' }}>
              <Spinner fullHeight message="Loading historical payslips..." />
            </div>
          ) : employeePayslips.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Period / Cycle</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Pay Date</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Basic Pay</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Gross Pay</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Total Deductions</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right', color: '#047857' }}>Net Pay</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Payment Status</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {employeePayslips.map((slip: any) => (
                    <tr key={slip.recordId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f172a' }}>
                        {slip.periodName}
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                          Ref: {slip.runNumber}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                        {slip.payDate}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', color: '#475569' }}>
                        KES {slip.earnings?.basicPay?.toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>
                        KES {slip.earnings?.grossPay?.toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', color: '#e11d48' }}>
                        - KES {slip.deductions?.totalDeductions?.toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: '#047857', fontSize: '0.875rem' }}>
                        KES {slip.summary?.netPay?.toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <Badge
                          variant={
                            slip.paymentStatus === 'PAID'
                              ? 'success'
                              : slip.paymentStatus === 'PROCESSING'
                              ? 'warning'
                              : 'neutral'
                          }
                          size="sm"
                        >
                          {slip.paymentStatus}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<Eye size={12} />}
                          onClick={() => {
                            setActivePayslipModal(slip);
                            setIsEmployeePayslipModalOpen(true);
                          }}
                        >
                          View Payslip
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '2rem 0', textAlign: 'center', color: '#64748b' }}>
              <FileText size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
              <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>No historical payslips generated for this employee yet.</p>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Payslips are generated automatically upon payroll calculation under <Link href="/payroll/runs" style={{ color: '#2563eb' }}>Payroll Runs</Link>.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* 11. Performance, Goals & Appraisals (Phase 14) */}
      {activeTab === 'performance' && (
        <Card
          title="Performance Appraisals & Development Plans"
          subtitle="Multi-cycle evaluation scores, SMART goal achievements, competencies and PIP records"
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '1rem' }}>
            <Link href="/performance" style={{ textDecoration: 'none' }}>
              <Button variant="outline" size="sm" leftIcon={<Award size={14} />}>
                Performance Command Center
              </Button>
            </Link>
          </div>

          {isLoadingPerformance ? (
            <div style={{ padding: '2rem 0', textAlign: 'center' }}>
              <Spinner fullHeight message="Loading employee performance records..." />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Reviews Summary Section */}
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Award size={16} color="#d97706" /> Appraisal Reviews ({employeeReviews.length})
                </h4>
                {employeeReviews.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700 }}>Review #</th>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700 }}>Cycle</th>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700 }}>Reviewer</th>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700, textAlign: 'center' }}>Status</th>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700, textAlign: 'center' }}>Goals / KPIs / Comp</th>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700, textAlign: 'center' }}>Score</th>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700, textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employeeReviews.map((rev: any) => (
                          <tr key={rev.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.625rem 0.875rem', fontFamily: 'monospace', fontWeight: 700, color: '#d97706' }}>
                              {rev.reviewNumber}
                            </td>
                            <td style={{ padding: '0.625rem 0.875rem', fontWeight: 600, color: '#0f172a' }}>
                              {rev.cycle?.name}
                            </td>
                            <td style={{ padding: '0.625rem 0.875rem', color: '#64748b' }}>
                              {rev.reviewer?.fullName || 'Unassigned'}
                            </td>
                            <td style={{ padding: '0.625rem 0.875rem', textAlign: 'center' }}>
                              <Badge variant={rev.status === 'COMPLETED' ? 'success' : 'neutral'} size="sm">
                                {rev.status}
                              </Badge>
                            </td>
                            <td style={{ padding: '0.625rem 0.875rem', textAlign: 'center', fontFamily: 'monospace', fontSize: '0.75rem', color: '#64748b' }}>
                              {rev.goalsScore ?? '—'} / {rev.kpisScore ?? '—'} / {rev.competenciesScore ?? '—'}
                            </td>
                            <td style={{ padding: '0.625rem 0.875rem', textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, color: '#d97706' }}>
                              {rev.isCalibrated && rev.calibratedScore ? rev.calibratedScore : rev.overallScore ? `${rev.overallScore} / 5.0` : 'Pending'}
                            </td>
                            <td style={{ padding: '0.625rem 0.875rem', textAlign: 'right' }}>
                              <Link href={`/performance/reviews/${rev.id}`} style={{ textDecoration: 'none' }}>
                                <Button variant="outline" size="sm" leftIcon={<Eye size={12} />}>
                                  View
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    No performance reviews initialized for this employee yet.
                  </p>
                )}
              </div>

              {/* Goals Section */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1.25rem' }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Target size={16} color="#2563eb" /> Assigned SMART Goals ({employeeGoals.length})
                </h4>
                {employeeGoals.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                    {employeeGoals.map((g: any) => (
                      <div key={g.id} style={{ padding: '0.875rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>
                          <span style={{ fontFamily: 'monospace' }}>{g.goalNumber}</span>
                          <span style={{ fontWeight: 600, color: '#2563eb' }}>{g.weight}% Weight</span>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#0f172a' }}>{g.title}</div>
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                          Progress: <strong>{g.progressPercentage}%</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    No SMART goals recorded for this employee.
                  </p>
                )}
              </div>

              {/* Development Plans Section */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1.25rem' }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <TrendingUp size={16} color="#059669" /> Development Plans &amp; PIPs ({employeeDevPlans.length})
                </h4>
                {employeeDevPlans.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                    {employeeDevPlans.map((dp: any) => (
                      <div key={dp.id} style={{ padding: '0.875rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>
                          <span style={{ fontFamily: 'monospace' }}>{dp.planNumber}</span>
                          <Badge variant={dp.planType === 'PIP' ? 'danger' : 'neutral'} size="sm">
                            {dp.planType}
                          </Badge>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#0f172a' }}>{dp.objective}</div>
                        <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#64748b' }}>
                          Skill Gap: {dp.skillGap}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    No active development plans or PIPs recorded.
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Skills Tab */}
      {activeTab === 'skills' && (
        <Card
          title="Skills & Competencies Inventory"
          subtitle="Acquired technical proficiencies, tactical certifications, and competency ratings"
        >
          {isLoadingTraining ? (
            <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>
              <Spinner size="md" />
            </div>
          ) : employeeSkills.length === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic', padding: '1rem 0' }}>
              No skills logged for this employee. Skills are automatically acquired when the employee completes accredited training courses.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
              {employeeSkills.map((sk: any) => (
                <div key={sk.id} style={{ padding: '0.875rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>{sk.skillName}</span>
                    <Badge variant={sk.level === 'EXPERT' ? 'danger' : sk.level === 'ADVANCED' ? 'warning' : 'info'} size="sm">
                      {sk.level}
                    </Badge>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Source: <strong>{sk.source?.replace('_', ' ')}</strong>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                    Acquired: {new Date(sk.dateAcquired).toLocaleDateString()}
                  </div>
                  {sk.certificate && (
                    <div style={{ marginTop: '0.375rem', fontSize: '0.75rem', color: '#4f46e5', fontFamily: 'monospace' }}>
                      Cert: {sk.certificate.certificateNumber}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Training & Certificates Tab */}
      {activeTab === 'training' && (
        <Card
          title="Training History & Official Certifications"
          subtitle="Historical log of attended training cohorts, assessment scores, and active credential badges"
        >
          {isLoadingTraining ? (
            <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>
              <Spinner size="md" />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '0.5rem' }}>
              {/* Issued Certificates */}
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Award size={16} color="#4f46e5" /> Issued Credential Badges ({employeeCertificates.length})
                </h4>
                {employeeCertificates.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700 }}>Certificate #</th>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700 }}>Course</th>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700 }}>Issue Date</th>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700 }}>Expiry Date</th>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700, textAlign: 'center' }}>Status</th>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700, textAlign: 'right' }}>Verify</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employeeCertificates.map((c: any) => {
                          const isExpired = c.expiryDate ? new Date() > new Date(c.expiryDate) : false;
                          return (
                            <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '0.625rem 0.875rem', fontFamily: 'monospace', fontWeight: 700, color: '#4f46e5' }}>
                                {c.certificateNumber}
                              </td>
                              <td style={{ padding: '0.625rem 0.875rem', fontWeight: 600, color: '#0f172a' }}>
                                {c.course?.title}
                              </td>
                              <td style={{ padding: '0.625rem 0.875rem', color: '#64748b' }}>
                                {new Date(c.issueDate).toLocaleDateString()}
                              </td>
                              <td style={{ padding: '0.625rem 0.875rem', color: '#64748b' }}>
                                {c.expiryDate ? (
                                  <span style={{ color: isExpired ? '#e11d48' : '#0f172a' }}>
                                    {new Date(c.expiryDate).toLocaleDateString()}
                                  </span>
                                ) : (
                                  <span style={{ color: '#059669', fontWeight: 600 }}>Lifetime</span>
                                )}
                              </td>
                              <td style={{ padding: '0.625rem 0.875rem', textAlign: 'center' }}>
                                <Badge variant={c.status === 'REVOKED' ? 'danger' : isExpired ? 'danger' : 'success'} size="sm">
                                  {c.status === 'REVOKED' ? 'REVOKED' : isExpired ? 'EXPIRED' : 'ACTIVE'}
                                </Badge>
                              </td>
                              <td style={{ padding: '0.625rem 0.875rem', textAlign: 'right' }}>
                                <Link
                                  href={`/training/certificates/verify/${c.certificateNumber}`}
                                  target="_blank"
                                  style={{ textDecoration: 'none', color: '#4f46e5', fontWeight: 600, fontSize: '0.75rem' }}
                                >
                                  Public Link →
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    No certificates issued for this employee yet.
                  </p>
                )}
              </div>

              {/* Training Enrollment Records */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1.25rem' }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <GraduationCap size={16} color="#059669" /> Enrolled Training Courses ({employeeTrainings.length})
                </h4>
                {employeeTrainings.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700 }}>Enrollment #</th>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700 }}>Course</th>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700 }}>Session Schedule</th>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700, textAlign: 'center' }}>Status</th>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700, textAlign: 'center' }}>Score</th>
                          <th style={{ padding: '0.625rem 0.875rem', fontWeight: 700, textAlign: 'center' }}>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employeeTrainings.map((enr: any) => (
                          <tr key={enr.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.625rem 0.875rem', fontFamily: 'monospace', fontWeight: 700, color: '#059669' }}>
                              {enr.enrollmentNumber}
                            </td>
                            <td style={{ padding: '0.625rem 0.875rem', fontWeight: 600, color: '#0f172a' }}>
                              {enr.course?.title}
                            </td>
                            <td style={{ padding: '0.625rem 0.875rem', color: '#64748b' }}>
                              {enr.session?.startDate ? new Date(enr.session.startDate).toLocaleDateString() : 'TBD'}
                            </td>
                            <td style={{ padding: '0.625rem 0.875rem', textAlign: 'center' }}>
                              <Badge variant={enr.status === 'COMPLETED' ? 'success' : enr.status === 'ENROLLED' ? 'info' : 'neutral'} size="sm">
                                {enr.status}
                              </Badge>
                            </td>
                            <td style={{ padding: '0.625rem 0.875rem', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700 }}>
                              {enr.finalScore !== null ? `${enr.finalScore}%` : '—'}
                            </td>
                            <td style={{ padding: '0.625rem 0.875rem', textAlign: 'center' }}>
                              <Badge variant={enr.finalResult === 'PASS' ? 'success' : enr.finalResult === 'FAIL' ? 'danger' : 'neutral'} size="sm">
                                {enr.finalResult || 'Pending'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    No training session enrollments recorded.
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Transfer Employee Modal */}
      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        title="Transfer & Reassign Employee"
        subtitle={`Reassign ${employee.fullName} (${employee.employeeNumber}) to a new branch, station, or position`}
        maxWidth="540px"
      >
        <form onSubmit={handleTransferSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Select
            label="Target Operating Branch"
            requiredIndicator
            value={transferData.branchId}
            onChange={(e) => setTransferData({ ...transferData, branchId: e.target.value, stationId: '' })}
            options={branches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }))}
          />

          <Select
            label="Target Department"
            requiredIndicator
            value={transferData.departmentId}
            onChange={(e) => setTransferData({ ...transferData, departmentId: e.target.value, positionId: '' })}
            options={departments.map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }))}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Select
              label="Guarding Station"
              value={transferData.stationId}
              onChange={(e) => setTransferData({ ...transferData, stationId: e.target.value })}
              options={[
                { value: '', label: 'No Station (Field Floating)' },
                ...filteredModalStations.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
              ]}
              helperText="Filtered by target branch"
            />

            <Select
              label="Job Position"
              value={transferData.positionId}
              onChange={(e) => setTransferData({ ...transferData, positionId: e.target.value })}
              options={[
                { value: '', label: 'Retain Current Position' },
                ...filteredModalPositions.map((p) => ({ value: p.id, label: `${p.title} (${p.code})` })),
              ]}
              helperText="Filtered by target department"
            />
          </div>

          <Select
            label="Designated Supervisor"
            value={transferData.supervisorId}
            onChange={(e) => setTransferData({ ...transferData, supervisorId: e.target.value })}
            options={[
              { value: '', label: 'No supervisor assigned' },
              ...supervisors.map((s) => ({
                value: s.id,
                label: `${s.fullName} (${s.employeeNumber} - ${s.jobTitle})`,
              })),
            ]}
          />

          <Input
            label="Effective Transfer Date"
            type="date"
            requiredIndicator
            value={transferData.effectiveDate}
            onChange={(e) => setTransferData({ ...transferData, effectiveDate: e.target.value })}
          />

          <Input
            label="Transfer Justification & Reason"
            requiredIndicator
            value={transferData.reason}
            onChange={(e) => setTransferData({ ...transferData, reason: e.target.value })}
            placeholder="e.g. Tactical rotation to high-priority client station"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setIsTransferModalOpen(false)}
              disabled={isTransferring}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isTransferring}>
              Execute Transfer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Change Status Modal */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title="Change Employment Status"
        subtitle={`Employee: ${employee.fullName} (${employee.employeeNumber})`}
        maxWidth="480px"
      >
        <form onSubmit={handleStatusChangeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.35rem' }}>
              Select New Status:
            </label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.875rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.875rem',
                color: '#0f172a',
                outline: 'none',
              }}
            >
              <option value="ACTIVE">ACTIVE — Active Duty</option>
              <option value="ON_LEAVE">ON_LEAVE — Authorized Leave</option>
              <option value="SUSPENDED">SUSPENDED — Suspended</option>
              <option value="TERMINATED">TERMINATED — Terminated</option>
              <option value="RESIGNED">RESIGNED — Resigned</option>
              <option value="RETIRED">RETIRED — Retired</option>
              <option value="INACTIVE">INACTIVE — Inactive</option>
            </select>
          </div>

          <Input
            label="Reason / Justification for Status Change"
            requiredIndicator
            value={statusReason}
            onChange={(e) => setStatusReason(e.target.value)}
            placeholder="e.g. Granted 14 days annual leave"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setIsStatusModalOpen(false)}
              disabled={isUpdatingStatus}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isUpdatingStatus}>
              Update Status
            </Button>
          </div>
        </form>
      </Modal>

      {/* Archive Modal */}
      <Modal
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        title="Archive Employee Record"
        subtitle={`Employee: ${employee.fullName} (${employee.employeeNumber})`}
        maxWidth="480px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#475569' }}>
            Are you sure you want to archive this employee? The employee will be deactivated but historical payroll records will be preserved.
          </p>

          <Input
            label="Reason for Archival"
            requiredIndicator
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
            placeholder="e.g. End of contract period"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem' }}>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setIsArchiveModalOpen(false)}
              disabled={isArchiving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              onClick={handleArchiveSubmit}
              isLoading={isArchiving}
            >
              Archive Record
            </Button>
          </div>
        </div>
      </Modal>

      {/* Upload Document Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        title="Upload Employee Document"
        subtitle={`Upload ID, contract, or certificate for ${employee.fullName}`}
        maxWidth="500px"
      >
        <form onSubmit={handleDocumentUploadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Select
            label="Document Category"
            requiredIndicator
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            options={[
              { value: 'NATIONAL_ID', label: 'National ID / Passport Copy' },
              { value: 'KRA_PIN_CERT', label: 'KRA PIN Certificate' },
              { value: 'EMPLOYMENT_CONTRACT', label: 'Signed Employment Contract' },
              { value: 'POLICE_CLEARANCE', label: 'Certificate of Good Conduct' },
              { value: 'ACADEMIC_CERT', label: 'Academic & Training Certificate' },
              { value: 'NSSF_SHA_PROOF', label: 'NSSF / SHA Proof Document' },
              { value: 'OTHER', label: 'Other HR Document' },
            ]}
          />

          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.35rem' }}>
              Choose File <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="file"
              required
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '0.8125rem',
              }}
            />
          </div>

          <Input
            label="Document Description (Optional)"
            value={docDescription}
            onChange={(e) => setDocDescription(e.target.value)}
            placeholder="e.g. Copy of verified National ID card"
          />

          <Input
            label="Document Expiry Date (Optional)"
            type="date"
            value={docExpiryDate}
            onChange={(e) => setDocExpiryDate(e.target.value)}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem' }}>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setIsUploadModalOpen(false)}
              disabled={isUploadingDoc}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isUploadingDoc}>
              Upload Document
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Document Confirmation */}
      {/* View Payslip Modal */}
      <Modal
        isOpen={isEmployeePayslipModalOpen}
        onClose={() => setIsEmployeePayslipModalOpen(false)}
        title={`Payslip: ${activePayslipModal?.employee?.fullName || employee.fullName}`}
        size="lg"
      >
        {activePayslipModal && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg no-print">
              <div className="text-slate-600 font-medium">
                Period: <strong className="text-slate-900">{activePayslipModal.periodName}</strong> &bull; Pay Date: <strong className="text-slate-900">{activePayslipModal.payDate}</strong>
              </div>
              <Button variant="primary" size="sm" leftIcon={<Printer size={13} />} onClick={() => window.print()}>
                Print / Save PDF
              </Button>
            </div>

            <div className="bg-white p-5 border border-slate-300 rounded-xl space-y-4 text-slate-800">
              {/* Header */}
              <div className="border-b-2 border-slate-900 pb-3 flex items-start justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-slate-950 m-0">
                    {activePayslipModal.company?.name || 'CorpSec Investigations & Guarding Services Limited'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium m-0">
                    {activePayslipModal.company?.tagline || 'Professional Security & Guarding Services'}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono mt-1 m-0">
                    KRA PIN: {activePayslipModal.company?.kraPin || 'P051234567Z'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block bg-slate-900 text-white font-extrabold text-xs px-2.5 py-1 rounded uppercase">
                    PAYSLIP
                  </span>
                  <div className="text-xs font-bold text-slate-900 mt-1">{activePayslipModal.periodName}</div>
                </div>
              </div>

              {/* Bio */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Name:</span>
                  <strong className="text-slate-900">{activePayslipModal.employee?.fullName}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Emp No:</span>
                  <strong className="text-slate-900 font-mono">{activePayslipModal.employee?.employeeNumber}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">ID No:</span>
                  <strong className="text-slate-900 font-mono">{activePayslipModal.employee?.nationalId}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">KRA PIN:</span>
                  <strong className="text-slate-900 font-mono">{activePayslipModal.employee?.kraPin}</strong>
                </div>
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* Earnings */}
                <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="font-bold text-slate-900 border-b border-slate-200 pb-1 flex justify-between">
                    <span>EARNINGS</span>
                    <span>AMOUNT (KES)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Basic Salary</span>
                    <span className="font-mono">{activePayslipModal.earnings?.basicPay?.toFixed(2)}</span>
                  </div>
                  {activePayslipModal.earnings?.allowances?.map((a: any, i: number) => (
                    <div key={i} className="flex justify-between text-slate-600">
                      <span>{a.name}</span>
                      <span className="font-mono">{a.amount?.toFixed(2)}</span>
                    </div>
                  ))}
                  {activePayslipModal.earnings?.overtime?.amount > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Overtime Pay ({activePayslipModal.earnings.overtime.hours} hrs)</span>
                      <span className="font-mono">{activePayslipModal.earnings.overtime.amount?.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-slate-200 pt-1 font-bold flex justify-between text-slate-900">
                    <span>TOTAL GROSS</span>
                    <span className="font-mono">KES {activePayslipModal.earnings?.grossPay?.toFixed(2)}</span>
                  </div>
                </div>

                {/* Deductions */}
                <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="font-bold text-slate-900 border-b border-slate-200 pb-1 flex justify-between">
                    <span>DEDUCTIONS</span>
                    <span>AMOUNT (KES)</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>PAYE Tax</span>
                    <span className="font-mono">{activePayslipModal.deductions?.payeTax?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>NSSF (Tier I &amp; II)</span>
                    <span className="font-mono">{activePayslipModal.deductions?.totalNssf?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>SHA / SHIF</span>
                    <span className="font-mono">{activePayslipModal.deductions?.sha?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Housing Levy (1.5%)</span>
                    <span className="font-mono">{activePayslipModal.deductions?.housingLevy?.toFixed(2)}</span>
                  </div>
                  {activePayslipModal.deductions?.otherDeductions?.map((d: any, i: number) => (
                    <div key={i} className="flex justify-between text-slate-600">
                      <span>{d.name}</span>
                      <span className="font-mono">{d.amount?.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t border-slate-200 pt-1 font-bold flex justify-between text-rose-700">
                    <span>TOTAL DEDUCTIONS</span>
                    <span className="font-mono">- KES {activePayslipModal.deductions?.totalDeductions?.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Net Pay Banner */}
              <div className="bg-emerald-800 text-white p-3.5 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-emerald-200 block">NET PAYABLE SALARY</span>
                  <span className="text-[11px] text-emerald-100">Disbursement: {activePayslipModal.employee?.paymentMethod}</span>
                </div>
                <div className="text-xl font-extrabold font-mono text-white">
                  KES {activePayslipModal.summary?.netPay?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Document Confirmation */}
      <ConfirmDialog
        isOpen={deleteDocTarget !== null}
        onClose={() => setDeleteDocTarget(null)}
        onConfirm={handleDeleteDocument}
        title="Delete Document"
        message={`Are you sure you want to delete ${deleteDocTarget?.fileName}? This action will permanently remove the file.`}
        confirmText="Delete File"
        variant="danger"
        isLoading={isDeletingDoc}
      />
    </div>
  );
}
