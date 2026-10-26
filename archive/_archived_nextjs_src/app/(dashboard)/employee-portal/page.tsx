'use client';

import React from 'react';
import { ComingSoonPlaceholder } from '@/components/layout/ComingSoonPlaceholder';
import { UserCircle } from 'lucide-react';

export default function EmployeePortalPage() {
  return (
    <ComingSoonPlaceholder
      moduleName="Employee Self-Service Portal"
      plannedPhase="Phase 13"
      description="Dedicated self-service interface for security guards, patrol supervisors, and corporate staff to view payslips, request leave, submit advance requests, and update contact details."
      icon={<UserCircle size={32} color="#0f1c3f" />}
      plannedFeatures={[
        'Mobile-Responsive Employee Self-Service Dashboard',
        'Direct Download of Monthly Payslips & P9 Tax Cards',
        'Online Leave Application & Accrual Balance Viewer',
        'Salary Advance Application with Real-time Status',
        'Personal Profile & Next of Kin Verification',
      ]}
    />
  );
}
