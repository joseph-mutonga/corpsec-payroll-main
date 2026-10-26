'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastContext';
import {
  UserPlus,
  ArrowLeft,
  Save,
  Building,
  Phone,
  CreditCard,
  FileCheck,
  Users,
  Shield,
  Briefcase,
} from 'lucide-react';
import { BranchData, DepartmentData, StationData, PositionData, EmployeeData } from '@/types';

export default function NewEmployeePage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [branches, setBranches] = useState<BranchData[]>([]);
  const [departments, setDepartments] = useState<DepartmentData[]>([]);
  const [stations, setStations] = useState<StationData[]>([]);
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [supervisors, setSupervisors] = useState<EmployeeData[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});

  // Form State
  const [formData, setFormData] = useState({
    // Personal
    firstName: '',
    middleName: '',
    lastName: '',
    nationalId: '',
    dateOfBirth: '',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
    nationality: 'Kenyan',

    // Contact
    primaryPhone: '',
    alternativePhone: '',
    email: '',
    physicalAddress: '',
    county: 'Nairobi',
    townCity: 'Nairobi',
    postalAddress: '',

    // Employment
    employmentDate: new Date().toISOString().split('T')[0],
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

    // Next of Kin
    nokFullName: '',
    nokRelationship: 'SPOUSE',
    nokPhone: '',
    nokAltPhone: '',
    nokEmail: '',
    nokAddress: '',
    nokPercentageShare: 100,

    // Emergency Contact
    emContactName: '',
    emContactRel: 'SPOUSE',
    emContactPhone: '',
    emContactAddress: '',

    // Payment Information
    preferredPaymentMethod: 'BANK',
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: '',
    bankBranch: '',
    bankBranchCode: '',
    mpesaPhoneNumber: '',

    // Statutory Information
    kraPin: '',
    nssfNumber: '',
    shaNumber: '',
    housingLevyNumber: '',
    helbNumber: '',
  });

  useEffect(() => {
    loadOrgUnits();
  }, []);

  const loadOrgUnits = async () => {
    try {
      const [bRes, dRes, sRes, pRes, empRes] = await Promise.all([
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
      const empData = await empRes.json();

      if (bData.success) {
        setBranches(bData.data);
        if (bData.data[0]) setFormData((prev) => ({ ...prev, branchId: bData.data[0].id }));
      }
      if (dData.success) {
        setDepartments(dData.data);
        if (dData.data[0]) setFormData((prev) => ({ ...prev, departmentId: dData.data[0].id }));
      }
      if (sData.success) setStations(sData.data);
      if (pData.success) setPositions(pData.data);
      if (empData.success) setSupervisors(empData.data);
    } catch (err) {
      console.error('Failed to load organization reference units:', err);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      // Smart Auto-fill: when position is selected, update jobTitle
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

    const payload: any = {
      firstName: formData.firstName,
      middleName: formData.middleName || undefined,
      lastName: formData.lastName,
      nationalId: formData.nationalId,
      dateOfBirth: formData.dateOfBirth || undefined,
      gender: formData.gender,
      maritalStatus: formData.maritalStatus || undefined,
      nationality: formData.nationality,

      primaryPhone: formData.primaryPhone,
      alternativePhone: formData.alternativePhone || undefined,
      email: formData.email || undefined,
      physicalAddress: formData.physicalAddress || undefined,
      county: formData.county || undefined,
      townCity: formData.townCity || undefined,
      postalAddress: formData.postalAddress || undefined,

      employmentDate: formData.employmentDate,
      contractStartDate: formData.contractStartDate || undefined,
      contractEndDate: formData.contractEndDate || undefined,
      employmentType: formData.employmentType,
      jobTitle: formData.jobTitle,
      positionId: formData.positionId || undefined,
      departmentId: formData.departmentId || undefined,
      branchId: formData.branchId || undefined,
      stationId: formData.stationId || undefined,
      supervisorId: formData.supervisorId || undefined,
      employmentStatus: formData.employmentStatus,

      preferredPaymentMethod: formData.preferredPaymentMethod,
      bankName: formData.bankName || undefined,
      bankAccountName: formData.bankAccountName || undefined,
      bankAccountNumber: formData.bankAccountNumber || undefined,
      bankBranch: formData.bankBranch || undefined,
      bankBranchCode: formData.bankBranchCode || undefined,
      mpesaPhoneNumber: formData.mpesaPhoneNumber || undefined,

      kraPin: formData.kraPin || undefined,
      nssfNumber: formData.nssfNumber || undefined,
      shaNumber: formData.shaNumber || undefined,
      housingLevyNumber: formData.housingLevyNumber || undefined,
      helbNumber: formData.helbNumber || undefined,
    };

    if (formData.nokFullName && formData.nokPhone) {
      payload.nextOfKin = [
        {
          fullName: formData.nokFullName,
          relationship: formData.nokRelationship,
          primaryPhone: formData.nokPhone,
          alternativePhone: formData.nokAltPhone || undefined,
          email: formData.nokEmail || undefined,
          physicalAddress: formData.nokAddress || undefined,
          percentageShare: formData.nokPercentageShare || 100,
          isPrimary: true,
        },
      ];
    }

    if (formData.emContactName && formData.emContactPhone) {
      payload.emergencyContacts = [
        {
          fullName: formData.emContactName,
          relationship: formData.emContactRel,
          primaryPhone: formData.emContactPhone,
          physicalAddress: formData.emContactAddress || undefined,
        },
      ];
    }

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.error?.code === 'VALIDATION_ERROR' && data.error.details) {
          setFormErrors(data.error.details);
          toastError('Validation Error', 'Please check the highlighted fields.');
        } else {
          toastError('Failed to Create Employee', data.error?.message || 'Error creating record');
        }
        setIsSubmitting(false);
        return;
      }

      success('Employee Onboarded', `Employee ${data.data.fullName} (${data.data.employeeNumber}) created successfully.`);
      router.push(`/hr/employees/${data.data.id}`);
    } catch (err) {
      console.error('Onboard error:', err);
      toastError('Error', 'Network error occurred while saving employee record.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'HR Management', href: '/hr' },
          { label: 'Employee Directory', href: '/hr/employees' },
          { label: 'Onboard New Employee' },
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
            New Employee Onboarding Wizard
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
            Register new personnel bio-data, deployment post, Kenyan statutory numbers, and payment details.
          </p>
        </div>

        <Button
          variant="outline"
          size="md"
          onClick={() => router.back()}
          leftIcon={<ArrowLeft size={16} />}
        >
          Cancel &amp; Back
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1000px' }}>
          {/* Section 1: Personal Information */}
          <Card title="1. Personal Information" subtitle="Full legal name, national identification, and demographic data">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
              <Input
                label="First Name"
                requiredIndicator
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                error={formErrors.firstName?.[0]}
                placeholder="e.g. Samuel"
              />

              <Input
                label="Middle Name"
                value={formData.middleName}
                onChange={(e) => handleInputChange('middleName', e.target.value)}
                error={formErrors.middleName?.[0]}
                placeholder="e.g. Kariuki"
              />

              <Input
                label="Last Name / Surname"
                requiredIndicator
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                error={formErrors.lastName?.[0]}
                placeholder="e.g. Mwangi"
              />

              <Input
                label="National ID / Passport Number"
                requiredIndicator
                value={formData.nationalId}
                onChange={(e) => handleInputChange('nationalId', e.target.value)}
                error={formErrors.nationalId?.[0]}
                placeholder="e.g. 29384710"
              />

              <Input
                label="Date of Birth"
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                error={formErrors.dateOfBirth?.[0]}
              />

              <Select
                label="Gender"
                requiredIndicator
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

              <Input
                label="Nationality"
                value={formData.nationality}
                onChange={(e) => handleInputChange('nationality', e.target.value)}
                placeholder="Kenyan"
              />
            </div>
          </Card>

          {/* Section 2: Contact Information */}
          <Card title="2. Contact Details & Address" subtitle="Phone numbers, email address, and residential location">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
              <Input
                label="Primary Phone Number"
                requiredIndicator
                value={formData.primaryPhone}
                onChange={(e) => handleInputChange('primaryPhone', e.target.value)}
                error={formErrors.primaryPhone?.[0]}
                placeholder="e.g. 0712345678 or +254712345678"
                helperText="Kenyan mobile number format supported"
              />

              <Input
                label="Alternative Phone Number"
                value={formData.alternativePhone}
                onChange={(e) => handleInputChange('alternativePhone', e.target.value)}
                error={formErrors.alternativePhone?.[0]}
                placeholder="e.g. 0722000111"
              />

              <Input
                label="Personal / Corporate Email Address"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                error={formErrors.email?.[0]}
                placeholder="samuel.mwangi@corpsec.co.ke"
              />

              <Input
                label="Physical Residential Address"
                value={formData.physicalAddress}
                onChange={(e) => handleInputChange('physicalAddress', e.target.value)}
                placeholder="e.g. House 14, Buruburu Estate"
              />

              <Input
                label="County"
                value={formData.county}
                onChange={(e) => handleInputChange('county', e.target.value)}
                placeholder="Nairobi"
              />

              <Input
                label="Town / City"
                value={formData.townCity}
                onChange={(e) => handleInputChange('townCity', e.target.value)}
                placeholder="Nairobi"
              />
            </div>
          </Card>

          {/* Section 3: Employment & Deployment Information */}
          <Card title="3. Employment & Guard Deployment" subtitle="Job position, branch alignment, guarding station, and supervisor">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
              <Select
                label="Operating Branch Alignment"
                requiredIndicator
                value={formData.branchId}
                onChange={(e) => handleInputChange('branchId', e.target.value)}
                options={[
                  { value: '', label: 'Select branch' },
                  ...branches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` })),
                ]}
              />

              <Select
                label="Department"
                requiredIndicator
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
                helperText="Filtered by chosen department"
              />

              <Input
                label="Job Title / Role Snapshot"
                requiredIndicator
                value={formData.jobTitle}
                onChange={(e) => handleInputChange('jobTitle', e.target.value)}
                error={formErrors.jobTitle?.[0]}
                placeholder="e.g. Armed Guard Specialist, Patrol Supervisor"
              />

              <Select
                label="Guarding Station / Deployment Post"
                value={formData.stationId}
                onChange={(e) => handleInputChange('stationId', e.target.value)}
                options={[
                  { value: '', label: 'No Fixed Station (HQ / Field Floating)' },
                  ...filteredStations.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
                ]}
                helperText="Filtered by chosen branch"
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
                requiredIndicator
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

              <Input
                label="Employment Start Date"
                type="date"
                requiredIndicator
                value={formData.employmentDate}
                onChange={(e) => handleInputChange('employmentDate', e.target.value)}
                error={formErrors.employmentDate?.[0]}
              />

              <Select
                label="Initial Employment Status"
                requiredIndicator
                value={formData.employmentStatus}
                onChange={(e) => handleInputChange('employmentStatus', e.target.value)}
                options={[
                  { value: 'ACTIVE', label: 'ACTIVE — On Active Duty' },
                  { value: 'ON_LEAVE', label: 'ON_LEAVE — On Leave' },
                  { value: 'SUSPENDED', label: 'SUSPENDED — Suspended' },
                  { value: 'INACTIVE', label: 'INACTIVE — Inactive' },
                ]}
              />
            </div>
          </Card>

          {/* Section 4: Next of Kin & Emergency Contacts */}
          <Card title="4. Next of Kin & Emergency Contacts" subtitle="Designated family contacts and emergency responders">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
              <Input
                label="Next of Kin Full Name"
                value={formData.nokFullName}
                onChange={(e) => handleInputChange('nokFullName', e.target.value)}
                placeholder="e.g. Mary Wambui Mwangi"
              />

              <Select
                label="Relationship to Employee"
                value={formData.nokRelationship}
                onChange={(e) => handleInputChange('nokRelationship', e.target.value)}
                options={[
                  { value: 'SPOUSE', label: 'Spouse' },
                  { value: 'CHILD', label: 'Child' },
                  { value: 'PARENT', label: 'Parent' },
                  { value: 'SIBLING', label: 'Sibling' },
                  { value: 'OTHER', label: 'Other' },
                ]}
              />

              <Input
                label="Next of Kin Primary Phone"
                value={formData.nokPhone}
                onChange={(e) => handleInputChange('nokPhone', e.target.value)}
                placeholder="0720000111"
              />

              <Input
                label="Next of Kin Address"
                value={formData.nokAddress}
                onChange={(e) => handleInputChange('nokAddress', e.target.value)}
                placeholder="Buruburu Phase 2"
              />

              <Input
                label="Emergency Contact Name"
                value={formData.emContactName}
                onChange={(e) => handleInputChange('emContactName', e.target.value)}
                placeholder="e.g. John Kamau"
              />

              <Input
                label="Emergency Contact Phone"
                value={formData.emContactPhone}
                onChange={(e) => handleInputChange('emContactPhone', e.target.value)}
                placeholder="0722334455"
              />
            </div>
          </Card>

          {/* Section 5: Payment & Disbursement Details */}
          <Card title="5. Payment & Salary Disbursement Details" subtitle="Bank account details or Safaricom M-Pesa mobile disbursement information">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
              <Select
                label="Preferred Payment Channel"
                value={formData.preferredPaymentMethod}
                onChange={(e) => handleInputChange('preferredPaymentMethod', e.target.value)}
                options={[
                  { value: 'BANK', label: 'Bank Account EFT Transfer' },
                  { value: 'MPESA', label: 'Safaricom M-Pesa Mobile Number' },
                ]}
              />

              <Input
                label="Bank Name"
                value={formData.bankName}
                onChange={(e) => handleInputChange('bankName', e.target.value)}
                placeholder="e.g. KCB Bank Kenya, Equity Bank, Co-operative Bank"
              />

              <Input
                label="Bank Account Holder Name"
                value={formData.bankAccountName}
                onChange={(e) => handleInputChange('bankAccountName', e.target.value)}
                placeholder="e.g. Samuel Kariuki Mwangi"
              />

              <Input
                label="Bank Account Number"
                value={formData.bankAccountNumber}
                onChange={(e) => handleInputChange('bankAccountNumber', e.target.value)}
                placeholder="e.g. 1104892841"
              />

              <Input
                label="Bank Branch Name"
                value={formData.bankBranch}
                onChange={(e) => handleInputChange('bankBranch', e.target.value)}
                placeholder="e.g. Upper Hill Branch"
              />

              <Input
                label="M-Pesa Registered Phone Number"
                value={formData.mpesaPhoneNumber}
                onChange={(e) => handleInputChange('mpesaPhoneNumber', e.target.value)}
                placeholder="e.g. 0712345678"
                helperText="Required if payment channel is M-Pesa"
              />
            </div>
          </Card>

          {/* Section 6: Statutory Identifiers */}
          <Card title="6. Kenyan Statutory Identifiers" subtitle="Kenya Revenue Authority PIN, NSSF, SHA / NHIF, and Housing Levy reference numbers">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
              <Input
                label="KRA PIN (Kenya Revenue Authority)"
                value={formData.kraPin}
                onChange={(e) => handleInputChange('kraPin', e.target.value.toUpperCase())}
                placeholder="e.g. A012345678Z"
              />

              <Input
                label="NSSF Member Number"
                value={formData.nssfNumber}
                onChange={(e) => handleInputChange('nssfNumber', e.target.value)}
                placeholder="e.g. 10928374"
              />

              <Input
                label="SHA / NHIF Identification Number"
                value={formData.shaNumber}
                onChange={(e) => handleInputChange('shaNumber', e.target.value)}
                placeholder="e.g. SHA-8492019"
              />

              <Input
                label="Affordable Housing Levy Reference Number"
                value={formData.housingLevyNumber}
                onChange={(e) => handleInputChange('housingLevyNumber', e.target.value)}
                placeholder="e.g. HL-29384710"
              />

              <Input
                label="HELB Loan Account Number (If applicable)"
                value={formData.helbNumber}
                onChange={(e) => handleInputChange('helbNumber', e.target.value)}
                placeholder="Optional"
              />
            </div>
          </Card>

          {/* Footer Submit Button */}
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
              Save &amp; Onboard Employee
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
