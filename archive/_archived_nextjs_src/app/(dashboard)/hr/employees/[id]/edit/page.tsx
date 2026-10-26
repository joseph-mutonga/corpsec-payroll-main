'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { Save, ArrowLeft } from 'lucide-react';
import { BranchData, DepartmentData, StationData, PositionData, EmployeeData } from '@/types';

export default function EditEmployeePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [branches, setBranches] = useState<BranchData[]>([]);
  const [departments, setDepartments] = useState<DepartmentData[]>([]);
  const [stations, setStations] = useState<StationData[]>([]);
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [supervisors, setSupervisors] = useState<EmployeeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});

  const [formData, setFormData] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    nationalId: '',
    dateOfBirth: '',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
    nationality: 'Kenyan',

    primaryPhone: '',
    alternativePhone: '',
    email: '',
    physicalAddress: '',
    county: 'Nairobi',
    townCity: 'Nairobi',
    postalAddress: '',

    employmentDate: '',
    contractStartDate: '',
    contractEndDate: '',
    employmentType: 'PERMANENT',
    jobTitle: '',
    positionId: '',
    departmentId: '',
    branchId: '',
    stationId: '',
    supervisorId: '',
    employmentStatus: 'ACTIVE',

    preferredPaymentMethod: 'BANK',
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: '',
    bankBranch: '',
    bankBranchCode: '',
    mpesaPhoneNumber: '',

    kraPin: '',
    nssfNumber: '',
    shaNumber: '',
    housingLevyNumber: '',
    helbNumber: '',
  });

  useEffect(() => {
    loadData();
  }, [params.id]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [empRes, bRes, dRes, sRes, pRes, allEmpRes] = await Promise.all([
        fetch(`/api/employees/${params.id}`),
        fetch('/api/branches'),
        fetch('/api/departments'),
        fetch('/api/stations'),
        fetch('/api/positions'),
        fetch('/api/employees?pageSize=100'),
      ]);

      const empData = await empRes.json();
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
        // Exclude self from supervisors to prevent circular self-supervision
        setSupervisors(allEmpData.data.filter((e: any) => e.id !== params.id));
      }

      if (empData.success && empData.data) {
        const emp = empData.data;
        setFormData({
          firstName: emp.firstName || '',
          middleName: emp.middleName || '',
          lastName: emp.lastName || '',
          nationalId: emp.nationalId || '',
          dateOfBirth: emp.dateOfBirth ? emp.dateOfBirth.split('T')[0] : '',
          gender: emp.gender || 'MALE',
          maritalStatus: emp.maritalStatus || 'SINGLE',
          nationality: emp.nationality || 'Kenyan',

          primaryPhone: emp.primaryPhone || '',
          alternativePhone: emp.alternativePhone || '',
          email: emp.email || '',
          physicalAddress: emp.physicalAddress || '',
          county: emp.county || 'Nairobi',
          townCity: emp.townCity || 'Nairobi',
          postalAddress: emp.postalAddress || '',

          employmentDate: emp.employmentDate ? emp.employmentDate.split('T')[0] : '',
          contractStartDate: emp.contractStartDate ? emp.contractStartDate.split('T')[0] : '',
          contractEndDate: emp.contractEndDate ? emp.contractEndDate.split('T')[0] : '',
          employmentType: emp.employmentType || 'PERMANENT',
          jobTitle: emp.jobTitle || '',
          positionId: emp.positionId || '',
          departmentId: emp.departmentId || '',
          branchId: emp.branchId || '',
          stationId: emp.stationId || '',
          supervisorId: emp.supervisorId || '',
          employmentStatus: emp.employmentStatus || 'ACTIVE',

          preferredPaymentMethod: emp.preferredPaymentMethod || 'BANK',
          bankName: emp.bankName || '',
          bankAccountName: emp.bankAccountName || '',
          bankAccountNumber: emp.bankAccountNumber || '',
          bankBranch: emp.bankBranch || '',
          bankBranchCode: emp.bankBranchCode || '',
          mpesaPhoneNumber: emp.mpesaPhoneNumber || '',

          kraPin: emp.kraPin || '',
          nssfNumber: emp.nssfNumber || '',
          shaNumber: emp.shaNumber || '',
          housingLevyNumber: emp.housingLevyNumber || '',
          helbNumber: emp.helbNumber || '',
        });
      }
    } catch (err) {
      console.error('Load employee edit error:', err);
      toastError('Error', 'Failed to load employee details.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === 'positionId' && value) {
        const matchedPos = positions.find((p) => p.id === value);
        if (matchedPos) updated.jobTitle = matchedPos.title;
      }
      return updated;
    });

    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // Smart Filtering
  const filteredStations = stations.filter(
    (s) => !formData.branchId || s.branchId === formData.branchId
  );

  const filteredPositions = positions.filter(
    (p) => !formData.departmentId || p.departmentId === formData.departmentId
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormErrors({});

    try {
      const res = await fetch(`/api/employees/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.error?.code === 'VALIDATION_ERROR' && data.error.details) {
          setFormErrors(data.error.details);
          toastError('Validation Failed', 'Please correct highlighted errors.');
        } else {
          toastError('Update Failed', data.error?.message || 'Error updating employee');
        }
        setIsSubmitting(false);
        return;
      }

      success('Employee Updated', 'Changes saved successfully.');
      router.push(`/hr/employees/${params.id}`);
    } catch (err) {
      console.error('Update error:', err);
      toastError('Error', 'Network error.');
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <Spinner fullHeight message="Loading employee record..." />;
  }

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'HR Management', href: '/hr' },
          { label: 'Employee Directory', href: '/hr/employees' },
          { label: `${formData.firstName} ${formData.lastName}`, href: `/hr/employees/${params.id}` },
          { label: 'Edit Profile' },
        ]}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0f1c3f' }}>
            Edit Employee Profile
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
            Update bio-data, organizational station assignment, or payment parameters.
          </p>
        </div>

        <Button
          variant="outline"
          size="md"
          onClick={() => router.back()}
          leftIcon={<ArrowLeft size={16} />}
        >
          Back to Profile
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1000px' }}>
          {/* Section 1: Personal */}
          <Card title="1. Personal Information">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
              <Input
                label="First Name"
                requiredIndicator
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                error={formErrors.firstName?.[0]}
              />

              <Input
                label="Middle Name"
                value={formData.middleName}
                onChange={(e) => handleInputChange('middleName', e.target.value)}
              />

              <Input
                label="Last Name"
                requiredIndicator
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                error={formErrors.lastName?.[0]}
              />

              <Input
                label="National ID / Passport"
                requiredIndicator
                value={formData.nationalId}
                onChange={(e) => handleInputChange('nationalId', e.target.value)}
                error={formErrors.nationalId?.[0]}
              />

              <Input
                label="Date of Birth"
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
              />

              <Select
                label="Gender"
                value={formData.gender}
                onChange={(e) => handleInputChange('gender', e.target.value)}
                options={[
                  { value: 'MALE', label: 'Male' },
                  { value: 'FEMALE', label: 'Female' },
                  { value: 'OTHER', label: 'Other' },
                ]}
              />

              <Select
                label="Marital Status"
                value={formData.maritalStatus}
                onChange={(e) => handleInputChange('maritalStatus', e.target.value)}
                options={[
                  { value: 'SINGLE', label: 'Single' },
                  { value: 'MARRIED', label: 'Married' },
                  { value: 'DIVORCED', label: 'Divorced' },
                  { value: 'WIDOWED', label: 'Widowed' },
                ]}
              />
            </div>
          </Card>

          {/* Section 2: Contact */}
          <Card title="2. Contact Details">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
              <Input
                label="Primary Phone"
                requiredIndicator
                value={formData.primaryPhone}
                onChange={(e) => handleInputChange('primaryPhone', e.target.value)}
                error={formErrors.primaryPhone?.[0]}
              />

              <Input
                label="Alternative Phone"
                value={formData.alternativePhone}
                onChange={(e) => handleInputChange('alternativePhone', e.target.value)}
              />

              <Input
                label="Email Address"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                error={formErrors.email?.[0]}
              />

              <Input
                label="Physical Address"
                value={formData.physicalAddress}
                onChange={(e) => handleInputChange('physicalAddress', e.target.value)}
              />

              <Input
                label="County"
                value={formData.county}
                onChange={(e) => handleInputChange('county', e.target.value)}
              />

              <Input
                label="Town / City"
                value={formData.townCity}
                onChange={(e) => handleInputChange('townCity', e.target.value)}
              />
            </div>
          </Card>

          {/* Section 3: Employment */}
          <Card title="3. Employment & Station Assignment">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
              <Select
                label="Operating Branch"
                value={formData.branchId}
                onChange={(e) => handleInputChange('branchId', e.target.value)}
                options={[
                  { value: '', label: 'Select branch' },
                  ...branches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` })),
                ]}
              />

              <Select
                label="Department"
                value={formData.departmentId}
                onChange={(e) => handleInputChange('departmentId', e.target.value)}
                options={[
                  { value: '', label: 'Select department' },
                  ...departments.map((d) => ({ value: d.id, label: `${d.name} (${d.code})` })),
                ]}
              />

              <Select
                label="Job Position Designation"
                value={formData.positionId}
                onChange={(e) => handleInputChange('positionId', e.target.value)}
                options={[
                  { value: '', label: 'Select position (optional)' },
                  ...filteredPositions.map((p) => ({ value: p.id, label: `${p.title} (${p.code})` })),
                ]}
                helperText="Filtered by department"
              />

              <Input
                label="Job Title / Role"
                requiredIndicator
                value={formData.jobTitle}
                onChange={(e) => handleInputChange('jobTitle', e.target.value)}
                error={formErrors.jobTitle?.[0]}
              />

              <Select
                label="Guarding Station"
                value={formData.stationId}
                onChange={(e) => handleInputChange('stationId', e.target.value)}
                options={[
                  { value: '', label: 'No Station (HQ / Field Floating)' },
                  ...filteredStations.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
                ]}
                helperText="Filtered by branch"
              />

              <Select
                label="Designated Supervisor"
                value={formData.supervisorId}
                onChange={(e) => handleInputChange('supervisorId', e.target.value)}
                options={[
                  { value: '', label: 'Select supervisor (optional)' },
                  ...supervisors.map((s) => ({
                    value: s.id,
                    label: `${s.fullName} (${s.employeeNumber} - ${s.jobTitle})`,
                  })),
                ]}
              />

              <Select
                label="Employment Type"
                value={formData.employmentType}
                onChange={(e) => handleInputChange('employmentType', e.target.value)}
                options={[
                  { value: 'PERMANENT', label: 'Permanent' },
                  { value: 'CONTRACT', label: 'Contract' },
                  { value: 'TEMPORARY', label: 'Temporary' },
                  { value: 'CASUAL', label: 'Casual' },
                  { value: 'PART_TIME', label: 'Part-Time' },
                  { value: 'INTERNSHIP', label: 'Internship' },
                ]}
              />
            </div>
          </Card>

          {/* Section 4: Payment Details */}
          <Card title="4. Payment Details (Restricted Access)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
              <Select
                label="Payment Method"
                value={formData.preferredPaymentMethod}
                onChange={(e) => handleInputChange('preferredPaymentMethod', e.target.value)}
                options={[
                  { value: 'BANK', label: 'Bank Account EFT Transfer' },
                  { value: 'MPESA', label: 'Safaricom M-Pesa' },
                ]}
              />

              <Input
                label="Bank Name"
                value={formData.bankName}
                onChange={(e) => handleInputChange('bankName', e.target.value)}
              />

              <Input
                label="Bank Account Name"
                value={formData.bankAccountName}
                onChange={(e) => handleInputChange('bankAccountName', e.target.value)}
              />

              <Input
                label="Bank Account Number"
                value={formData.bankAccountNumber}
                onChange={(e) => handleInputChange('bankAccountNumber', e.target.value)}
              />

              <Input
                label="M-Pesa Registered Number"
                value={formData.mpesaPhoneNumber}
                onChange={(e) => handleInputChange('mpesaPhoneNumber', e.target.value)}
              />
            </div>
          </Card>

          {/* Section 5: Statutory */}
          <Card title="5. Statutory Identifiers">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
              <Input
                label="KRA PIN"
                value={formData.kraPin}
                onChange={(e) => handleInputChange('kraPin', e.target.value.toUpperCase())}
              />

              <Input
                label="NSSF Number"
                value={formData.nssfNumber}
                onChange={(e) => handleInputChange('nssfNumber', e.target.value)}
              />

              <Input
                label="SHA / NHIF Number"
                value={formData.shaNumber}
                onChange={(e) => handleInputChange('shaNumber', e.target.value)}
              />

              <Input
                label="Housing Levy Ref Number"
                value={formData.housingLevyNumber}
                onChange={(e) => handleInputChange('housingLevyNumber', e.target.value)}
              />
            </div>
          </Card>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginBottom: '2rem' }}>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => router.back()}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              leftIcon={<Save size={18} />}
            >
              Save Profile Changes
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
