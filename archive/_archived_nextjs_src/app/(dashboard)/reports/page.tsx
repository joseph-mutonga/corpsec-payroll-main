'use client';

import React from 'react';
import { ComingSoonPlaceholder } from '@/components/layout/ComingSoonPlaceholder';
import { FileSpreadsheet } from 'lucide-react';

export default function ReportsPage() {
  return (
    <ComingSoonPlaceholder
      moduleName="HR & Statutory Payroll Reports"
      plannedPhase="Phase 12"
      description="Kenyan statutory tax returns reports (KRA P9 annual certificates, KRA P10 monthly returns, NSSF submission schedules, SHA / NHIF submission files, Housing Levy returns, and departmental variance analytics)."
      icon={<FileSpreadsheet size={32} color="#0f1c3f" />}
      plannedFeatures={[
        'KRA P9 Employee Tax Deduction Cards Generation',
        'KRA P10 Monthly PAYE Returns File Generator (CSV / Excel)',
        'NSSF Monthly Returns File Schedule',
        'SHA (SHIF) Monthly Member Contribution Returns',
        'Affordable Housing Levy (AHL) Return Schedule',
        'Headcount, Turnaround & Payroll Variance Master Reports',
      ]}
    />
  );
}
