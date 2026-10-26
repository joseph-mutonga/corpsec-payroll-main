'use client';

import React from 'react';
import { ComingSoonPlaceholder } from '@/components/layout/ComingSoonPlaceholder';
import { Clock } from 'lucide-react';

export default function RostersPage() {
  return (
    <ComingSoonPlaceholder
      moduleName="Shifts & Deployment Rosters"
      plannedPhase="Phase 4"
      description="Roster scheduling engine for security guarding stations, supervisor patrol shifts, and rotation timetables."
      icon={<Clock size={32} color="#0f1c3f" />}
      plannedFeatures={[
        'Station Guard Roster Scheduling',
        'Shift Swaps & Reliever Deployment',
        'Night Shift Allowance Triggers',
        'Weekly & Monthly Roster Templates',
      ]}
    />
  );
}
