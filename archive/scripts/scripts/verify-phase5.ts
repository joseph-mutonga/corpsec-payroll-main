// CorpSec HR Payroll — Phase 5 Leave Management Calculation & Business Logic Verification Suite

import {
  calculateLeaveDuration,
  calculateProratedEntitlement,
  calculateMonthlyAccrual,
  validateLeaveBalance,
  detectLeaveConflict,
} from '../src/lib/leave-calculator';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ Passed: ${message}`);
  }
}

async function runPhase5Verification() {
  console.log('\n======================================================');
  console.log('🧪 CORPSEC HR PAYROLL — PHASE 5 LEAVE VERIFICATION SUITE');
  console.log('======================================================\n');

  // Test 1: Standard Monday-Friday 5-day leave with weekends excluded
  console.log('--- Test 1: Standard Mon-Fri working days calculation (Aug 17 to Aug 21, 2026) ---');
  const dur1 = calculateLeaveDuration('2026-08-17', '2026-08-21', {
    excludeWeekends: true,
    excludeHolidays: true,
  });
  assert(dur1.durationDays === 5, `Expected 5 working days, got ${dur1.durationDays}`);
  assert(dur1.calendarDaysCount === 5, `Expected 5 calendar days, got ${dur1.calendarDaysCount}`);

  // Test 2: Multi-week period spanning weekends (Aug 17 to Aug 28 = 10 working days, 12 calendar days)
  console.log('\n--- Test 2: Two-week period spanning Saturday and Sunday (Aug 17 to Aug 28, 2026) ---');
  const dur2 = calculateLeaveDuration('2026-08-17', '2026-08-28', {
    excludeWeekends: true,
    excludeHolidays: true,
  });
  assert(dur2.durationDays === 10, `Expected 10 working days, got ${dur2.durationDays}`);
  assert(dur2.calendarDaysCount === 12, `Expected 12 calendar days, got ${dur2.calendarDaysCount}`);
  assert(dur2.offDates.length === 2, `Expected 2 weekend days excluded, got ${dur2.offDates.length}`);

  // Test 3: Public Holiday exclusion (e.g. Mashujaa Day Oct 20, 2026 on a Tuesday)
  console.log('\n--- Test 3: Public Holiday exclusion (Oct 19 to Oct 23, 2026 with Mashujaa Day Oct 20) ---');
  const dur3 = calculateLeaveDuration('2026-10-19', '2026-10-23', {
    excludeWeekends: true,
    excludeHolidays: true,
    holidays: ['2026-10-20'],
  });
  assert(dur3.durationDays === 4, `Expected 4 working days (5 - 1 holiday), got ${dur3.durationDays}`);
  assert(dur3.holidayDates.length === 1, `Expected 1 holiday detected, got ${dur3.holidayDates.length}`);
  assert(dur3.holidayDates[0] === '2026-10-20', `Expected holiday date 2026-10-20, got ${dur3.holidayDates[0]}`);

  // Test 4: Continuous Maternity / Paternity Calendar Days (Weekends NOT excluded)
  console.log('\n--- Test 4: Statutory Maternity/Paternity Continuous Days (excludeWeekends = false) ---');
  const dur4 = calculateLeaveDuration('2026-09-01', '2026-09-14', {
    excludeWeekends: false,
    excludeHolidays: false,
  });
  assert(dur4.durationDays === 14, `Expected exactly 14 calendar days for paternity leave, got ${dur4.durationDays}`);

  // Test 5: Half-Day Leave request
  console.log('\n--- Test 5: Half-Day Leave Request (0.5 days) ---');
  const dur5 = calculateLeaveDuration('2026-08-25', '2026-08-25', {
    isHalfDay: true,
  });
  assert(dur5.durationDays === 0.5, `Expected 0.5 days for half-day, got ${dur5.durationDays}`);

  // Test 6: Mid-year Employee Joining Proration Formula
  console.log('\n--- Test 6: Mid-year Proration (Employee joining July 1st, 2026 for 21 days annual leave) ---');
  const pro1 = calculateProratedEntitlement(21, '2026-07-01', '2026-01-01', '2026-12-31', 'PRORATED_BY_MONTH');
  assert(pro1.monthsEligible === 6, `Expected 6 eligible months, got ${pro1.monthsEligible}`);
  assert(pro1.entitledDays === 10.5, `Expected 10.5 days prorated (21 * 6 / 12), got ${pro1.entitledDays}`);

  // Test 7: Employee joining at start of year -> Full Entitlement
  console.log('\n--- Test 7: Full year entitlement for existing employee ---');
  const pro2 = calculateProratedEntitlement(21, '2025-03-10', '2026-01-01', '2026-12-31', 'PRORATED_BY_MONTH');
  assert(pro2.entitledDays === 21, `Expected full 21 days, got ${pro2.entitledDays}`);

  // Test 8: Monthly Accrual Calculation
  console.log('\n--- Test 8: Monthly Accrual Calculation (21 days annual allowance accrued up to Month 8) ---');
  const accrued8 = calculateMonthlyAccrual(21, 8);
  assert(accrued8 === 14, `Expected 14 days accrued (21 * 8 / 12), got ${accrued8}`);

  // Test 9: Leave Balance Verification & Shortfall Detection
  console.log('\n--- Test 9: Leave Balance Validation ---');
  const balCheckPass = validateLeaveBalance(15, 10, false, 0);
  assert(balCheckPass.isValid === true, 'Expected balance validation to pass when balance >= requested');
  assert(balCheckPass.shortfall === 0, 'Expected 0 shortfall');

  const balCheckFail = validateLeaveBalance(5, 8, false, 0);
  assert(balCheckFail.isValid === false, 'Expected balance validation to fail when balance < requested');
  assert(balCheckFail.shortfall === 3, `Expected shortfall of 3 days, got ${balCheckFail.shortfall}`);

  // Test 10: Advance Leave Allowance Support
  console.log('\n--- Test 10: Advance Leave Allowance support ---');
  const balCheckAdvance = validateLeaveBalance(2, 5, true, 5); // 2 avail + 5 advance = 7 max
  assert(balCheckAdvance.isValid === true, 'Expected advance allowance to satisfy request');

  // Test 11: Leave Overlap Conflict Detection
  console.log('\n--- Test 11: Leave Conflict & Overlap Detection ---');
  const existingReqs = [
    {
      id: 'req-001',
      requestNumber: 'LR-2026-0001',
      startDate: new Date('2026-08-18'),
      endDate: new Date('2026-08-20'),
      status: 'APPROVED',
    },
  ];

  // Overlapping request: Aug 19 to Aug 22 (overlaps Aug 19, 20)
  const conflict1 = detectLeaveConflict(existingReqs, new Date('2026-08-19'), new Date('2026-08-22'));
  assert(conflict1.hasConflict === true, 'Expected conflict detected for overlapping dates');
  assert(conflict1.conflictingRequest?.requestNumber === 'LR-2026-0001', 'Expected LR-2026-0001 as conflicting item');

  // Non-overlapping request: Aug 25 to Aug 28
  const conflict2 = detectLeaveConflict(existingReqs, new Date('2026-08-25'), new Date('2026-08-28'));
  assert(conflict2.hasConflict === false, 'Expected no conflict for non-overlapping dates');

  console.log('\n🎉 ALL 11 PHASE 5 LEAVE CALCULATION SUITE TESTS PASSED PERFECTLY!\n');
}

runPhase5Verification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
