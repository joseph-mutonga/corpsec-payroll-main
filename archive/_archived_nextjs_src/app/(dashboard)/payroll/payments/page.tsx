'use client';

import React from 'react';
import { ComingSoonPlaceholder } from '@/components/layout/ComingSoonPlaceholder';
import { Banknote } from 'lucide-react';

export default function SalaryPaymentsPage() {
  return (
    <ComingSoonPlaceholder
      moduleName="Salary Payments & Bank / M-Pesa Disbursements"
      plannedPhase="Phase 10"
      description="Bank EFT export formats (Stanbic, KCB, Equity, Co-op), Safaricom M-Pesa B2C Bulk Salary disbursement API, and payment reconciliations."
      icon={<Banknote size={32} color="#0f1c3f" />}
      plannedFeatures={[
        'Bank Multi-Currency EFT / RTGS Batch File Exporter',
        'Safaricom M-Pesa B2C Bulk Salary Disbursal API Integration',
        'Payment Failure Retry & Discrepancy Reconciliation',
        'Disbursement Approvals & Bank Confirmation Receipts',
      ]}
    />
  );
}
