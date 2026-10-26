'use client';

import React from 'react';
import { ComingSoonPlaceholder } from '@/components/layout/ComingSoonPlaceholder';
import { Banknote } from 'lucide-react';

export default function LoansAdvancesPage() {
  return (
    <ComingSoonPlaceholder
      moduleName="Loans & Salary Advances"
      plannedPhase="Phase 11"
      description="Employee salary advance requests, emergency guard loans, repayment schedules, and automated payroll deduction amortization."
      icon={<Banknote size={32} color="#0f1c3f" />}
      plannedFeatures={[
        'Salary Advance Eligibility Engine (Max 50% Net Pay)',
        'Emergency Loan Approval Workflow',
        'Multi-Month Amortization & Repayment Schedules',
        'Automatic Monthly Payroll Deduction Integration',
      ]}
    />
  );
}
