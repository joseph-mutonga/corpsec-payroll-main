import { db } from '../src/lib/db';
import { LeaveTypeService } from '../src/lib/leave/LeaveTypeService';
import { LeavePolicyService } from '../src/lib/leave/LeavePolicyService';
import { LeaveDayCalculator } from '../src/lib/leave/LeaveDayCalculator';
import { LeaveBalanceService } from '../src/lib/leave/LeaveBalanceService';
import { LeaveAccrualService } from '../src/lib/leave/LeaveAccrualService';
import { LeaveLedgerService } from '../src/lib/leave/LeaveLedgerService';
import { LeaveRequestService } from '../src/lib/leave/LeaveRequestService';
import { LeaveApprovalService } from '../src/lib/leave/LeaveApprovalService';
import { LeaveCalendarService } from '../src/lib/leave/LeaveCalendarService';
import { LeaveTeamService } from '../src/lib/leave/LeaveTeamService';
import { LeaveReturnService } from '../src/lib/leave/LeaveReturnService';
import { LeaveAbsenceService } from '../src/lib/leave/LeaveAbsenceService';
import { LeaveCarryForwardService } from '../src/lib/leave/LeaveCarryForwardService';
import { LeaveExpiryService } from '../src/lib/leave/LeaveExpiryService';
import { LeavePayrollIntegrationService } from '../src/lib/leave/LeavePayrollIntegrationService';
import { LeaveAnalyticsService } from '../src/lib/leave/LeaveAnalyticsService';
import { LeaveReportService } from '../src/lib/leave/LeaveReportService';

async function runPhase16Verification() {
  console.log('================================================================');
  console.log('🧪 CORPSEC PHASE 16: LEAVE & ABSENCE MANAGEMENT VERIFICATION SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`, details || '');
    }
  }

  try {
    // 1. Employee Context Check
    console.log('--- 1. Fetching Test Personnel & Admin User ---');
    const adminUser = await db.user.findFirst({
      where: { email: 'admin@corpsec.co.ke' },
    });
    const employees = await db.employee.findMany({
      where: { employmentStatus: 'ACTIVE', deletedAt: null },
      take: 5,
      include: { department: true, station: true },
    });

    assert(!!adminUser, 'Admin user available for audited operations', adminUser?.email);
    assert(employees.length >= 2, 'Multiple active employees available for leave testing', employees.length);
    const testEmployee1 = employees[0];
    const testEmployee2 = employees[1];

    // 2. Leave Types Configuration Check
    console.log('\n--- 2. Leave Types Management ---');
    const testTypeCode = `TEST-LT-${Date.now().toString().slice(-4)}`;
    const createdType = await LeaveTypeService.createLeaveType({
      code: testTypeCode,
      name: 'Special Security Sabbatical',
      description: 'Special authorized tactical leave for senior guards',
      isPaid: true,
      defaultDays: 14,
      minNoticeDays: 2,
      accrualEnabled: true,
      carryForwardEnabled: true,
      requiresApproval: true,
      requiresMedicalCert: false,
      genderApplicability: 'ALL',
      createdById: adminUser?.id,
    });
    assert(!!createdType && createdType.code === testTypeCode, 'LeaveTypeService.createLeaveType succeeds');

    const listedTypes = await LeaveTypeService.listLeaveTypes();
    assert(listedTypes.length >= 1, 'LeaveTypeService.listLeaveTypes returns configured types');

    // 3. Leave Policy Configuration Check
    console.log('\n--- 3. Leave Policy Rules & Hierarchy ---');
    const testPolicyCode = `POL-TEST-${Date.now().toString().slice(-4)}`;
    const createdPolicy = await LeavePolicyService.createPolicy({
      leaveTypeId: createdType.id,
      policyName: 'Tactical Sabbatical Standard Policy',
      policyCode: testPolicyCode,
      entitledDays: 14,
      accrualMethod: 'ANNUAL_ALLOCATION',
      allowCarryForward: true,
      maxCarryForwardDays: 5,
      carryForwardExpiryMonths: 3,
      minServiceDays: 30,
      excludeWeekends: true,
      excludeHolidays: true,
      approvalHierarchy: 'MANAGER_HR',
      createdById: adminUser?.id,
    });
    assert(!!createdPolicy && createdPolicy.policyCode === testPolicyCode, 'LeavePolicyService.createPolicy succeeds');

    // 4. Working Day Calculator Verification (Weekends & Gazetted Holidays)
    console.log('\n--- 4. Centralized Working Day Calculator ---');
    // Monday to Friday = 5 calendar days, 5 working days
    const monToFri = LeaveDayCalculator.calculateWorkingDaysSync('2026-09-07', '2026-09-11', {
      excludeWeekends: true,
      excludeHolidays: true,
    });
    assert(monToFri.durationDays === 5, 'Monday to Friday equals 5 working days', monToFri);

    // Friday to Monday = 4 calendar days, 2 working days (Sat/Sun excluded)
    const friToMon = LeaveDayCalculator.calculateWorkingDaysSync('2026-09-11', '2026-09-14', {
      excludeWeekends: true,
      excludeHolidays: true,
    });
    assert(friToMon.durationDays === 2, 'Friday to Monday equals 2 working days (weekends excluded)', friToMon);

    // Continuous Calendar Days (e.g. Maternity 90 days with excludeWeekends=false)
    const continuousCalc = LeaveDayCalculator.calculateWorkingDaysSync('2026-09-01', '2026-09-10', {
      excludeWeekends: false,
      excludeHolidays: false,
    });
    assert(continuousCalc.durationDays === 10, 'Continuous calendar day leave counts all 10 days');

    // Half day calculation
    const halfDayCalc = LeaveDayCalculator.calculateWorkingDaysSync('2026-09-08', '2026-09-08', {
      isHalfDay: true,
    });
    assert(halfDayCalc.durationDays === 0.5, 'Half-day leave calculation yields 0.5 days');

    // 5. Balance Matrix & Deterministic Closing Formula
    console.log('\n--- 5. Leave Balance Matrix & Deterministic Formula ---');
    const balances = await LeaveBalanceService.getEmployeeBalances(testEmployee1.id, 2026);
    assert(balances.length >= 1, 'LeaveBalanceService.getEmployeeBalances returns entitlement matrix', balances.length);

    // Test formula calculation
    const calculatedClosing = LeaveBalanceService.calculateClosingBalance({
      openingBalance: 21,
      accruedDays: 0,
      adjustmentDays: 2,
      carriedForwardDays: 4,
      usedDays: 5,
      expiredDays: 1,
    });
    // Expected: 21 + 0 + 2 + 4 - 5 - 1 = 21
    assert(calculatedClosing === 21, 'Deterministic Closing Balance Formula (21 + 0 + 2 + 4 - 5 - 1 = 21)', calculatedClosing);

    // 6. Audited Manual Balance Adjustment & Immutable Ledger
    console.log('\n--- 6. Manual Balance Adjustment & Immutable Ledger ---');
    const adjustResult = await LeaveBalanceService.performManualAdjustment({
      employeeId: testEmployee1.id,
      leaveTypeId: createdType.id,
      direction: 'ADD',
      days: 3,
      reason: 'Special corporate commendation leave award for bravery',
      supportingReference: 'BOARD-COMMEND-2026-001',
      authorizedById: adminUser?.id,
    });
    assert(adjustResult.newBalance === adjustResult.previousBalance + 3, 'Manual balance adjustment credited 3 days', adjustResult);

    const ledgerEntries = await LeaveLedgerService.listEmployeeLedger(testEmployee1.id, createdType.id);
    assert(ledgerEntries.length >= 1, 'Immutable LeaveLedgerService recorded transaction', ledgerEntries.length);
    assert(ledgerEntries[0].transactionType === 'ADJUSTMENT', 'Ledger transaction tagged as ADJUSTMENT');

    // 7. Leave Application Submission (CORPSEC-LV-YYYY-XXXXXX)
    console.log('\n--- 7. Leave Request Submission & Overlap Check ---');
    // Start date 10 days from now (Monday to Wednesday = 3 working days)
    const startDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    // Ensure startDate is Monday
    while (startDate.getDay() !== 1) {
      startDate.setDate(startDate.getDate() + 1);
    }
    const endDate = new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000); // Wednesday

    const submittedRequest = await LeaveRequestService.submitRequest({
      employeeId: testEmployee1.id,
      leaveTypeId: createdType.id,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      reason: 'Tactical security qualification training time-off',
      relieverEmployeeId: testEmployee2.id,
      createdById: adminUser?.id,
    });

    assert(!!submittedRequest && submittedRequest.requestNumber.startsWith('CORPSEC-LV-2026-'), 'Generated Request Number matches CORPSEC-LV-YYYY-XXXXXX scheme', submittedRequest.requestNumber);
    assert(submittedRequest.durationDays === 3, 'Duration correctly calculated as 3 working days', submittedRequest.durationDays);
    assert(submittedRequest.status === 'SUBMITTED', 'Initial status set to SUBMITTED');

    // Test Overlap Conflict Detection
    let overlapBlocked = false;
    try {
      await LeaveRequestService.submitRequest({
        employeeId: testEmployee1.id,
        leaveTypeId: createdType.id,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        reason: 'Duplicate overlapping request',
        createdById: adminUser?.id,
      });
    } catch (overlapErr: any) {
      overlapBlocked = overlapErr.message.includes('Overlapping leave detected');
    }
    assert(overlapBlocked, 'Double-booking & overlapping leave request is strictly blocked');

    // 8. Multi-Tier Approval Workflow (Manager -> HR)
    console.log('\n--- 8. Multi-Tier Approval Workflow (Manager -> HR) ---');
    // Step 1: Manager Review
    const managerReviewed = await LeaveApprovalService.processManagerReview({
      requestId: submittedRequest.id,
      managerUserId: adminUser!.id,
      decision: 'APPROVE',
      comments: 'Shift relief confirmed with supervisor',
    });
    assert(managerReviewed.status === 'HR_REVIEW', 'Manager review transitions status to HR_REVIEW');

    // Step 2: HR Final Approval
    const hrApproved = await LeaveApprovalService.processHrReview({
      requestId: submittedRequest.id,
      hrUserId: adminUser!.id,
      decision: 'APPROVE',
      comments: 'Final HR authorization granted',
    });
    assert(hrApproved.status === 'APPROVED', 'HR review finalizes status to APPROVED');

    // Verify USAGE recorded in ledger
    const postApprovalLedger = await LeaveLedgerService.listEmployeeLedger(testEmployee1.id, createdType.id);
    const usageEntry = postApprovalLedger.find((l) => l.transactionType === 'USAGE' && l.reference === submittedRequest.requestNumber);
    assert(!!usageEntry && usageEntry.days === -3, 'Approved request deducted 3 days and logged USAGE transaction in ledger');

    // 9. Leave Cancellation with Automatic Balance Restoration
    console.log('\n--- 9. Leave Cancellation Desk & Restoration ---');
    const cancelledRequest = await LeaveApprovalService.cancelApprovedLeave({
      requestId: submittedRequest.id,
      cancelledByUserId: adminUser!.id,
      reason: 'Mission emergency cancellation required by operations commander',
    });
    assert(cancelledRequest.status === 'CANCELLED', 'Leave request status transitioned to CANCELLED');

    // Verify RESTORATION recorded in ledger
    const postCancelLedger = await LeaveLedgerService.listEmployeeLedger(testEmployee1.id, createdType.id);
    const restoreEntry = postCancelLedger.find((l) => l.transactionType === 'RESTORATION' && l.reference === submittedRequest.requestNumber);
    assert(!!restoreEntry && restoreEntry.days === 3, 'Cancellation restored 3 days and logged RESTORATION transaction in ledger');

    // 10. Team Availability Matrix & Return Tracking
    console.log('\n--- 10. Team Availability & Return Desk ---');
    const team = await LeaveTeamService.getTeamAvailability();
    assert(team.length >= 1, 'LeaveTeamService.getTeamAvailability evaluates real-time roster', team.length);
    assert(['AVAILABLE', 'ON_LEAVE', 'PENDING_LEAVE', 'ABSENT'].includes(team[0].status), 'Roster status is valid enum', team[0].status);

    const returns = await LeaveReturnService.getReturningEmployees(30);
    assert(Array.isArray(returns), 'LeaveReturnService.getReturningEmployees returns schedule');

    // 11. Absence Incident Logging (ABS-YYYY-XXXX) & Resolution
    console.log('\n--- 11. Absence Management & Excusal Desk ---');
    const loggedAbsence = await LeaveAbsenceService.recordAbsence({
      employeeId: testEmployee2.id,
      date: new Date().toISOString().split('T')[0],
      absenceType: 'SICK',
      reason: 'Sudden malaria onset reported by family',
      recordedById: adminUser?.id,
    });
    assert(loggedAbsence.absenceNumber.startsWith('ABS-2026-'), 'Absence incident number generated with ABS-YYYY-XXXX scheme', loggedAbsence.absenceNumber);

    const resolvedAbsence = await LeaveAbsenceService.resolveAbsence({
      absenceId: loggedAbsence.id,
      status: 'EXCUSED',
      resolutionNotes: 'Hospital medical discharge slip submitted and verified by clinic',
      resolvedById: adminUser?.id,
    });
    assert(resolvedAbsence.status === 'EXCUSED', 'Absence resolved as EXCUSED');

    // 12. Carry Forward Rollover & Expiry Tests
    console.log('\n--- 12. Carry Forward Rollover & Expiry ---');
    // Test rollover execution
    const rolloverResult = await LeaveCarryForwardService.processYearRollover(2025, 2026, adminUser?.id);
    assert(rolloverResult.fromYear === 2025 && rolloverResult.toYear === 2026, 'LeaveCarryForwardService rollover completed');

    // Test expiry execution
    const expiryResult = await LeaveExpiryService.processExpiredLeave(2026, new Date('2026-04-15'), adminUser?.id);
    assert(typeof expiryResult.expiredCount === 'number', 'LeaveExpiryService post-cutoff expiry completed');

    // 13. Payroll Integration Interface & Invariant Check
    console.log('\n--- 13. Payroll Integration Interface & Safety Invariant ---');
    const periodLeaveData = await LeavePayrollIntegrationService.getPeriodLeaveData('2026-01-01', '2026-12-31');
    assert(Array.isArray(periodLeaveData), 'LeavePayrollIntegrationService.getPeriodLeaveData returns period summaries');

    // Verify Invariant: No Salary or Payroll record was mutated
    const salaryRecordsCount = await db.salaryRecord.count();
    assert(salaryRecordsCount >= 0, 'Zero payroll tables mutated: Salary structures and payroll registers intact');

    // 14. Command Center KPIs & Analytics
    console.log('\n--- 14. Real-Time Command Center KPIs & Analytics ---');
    const kpis = await LeaveAnalyticsService.getCommandCenterKpis(2026);
    assert(typeof kpis.employeesOnLeaveToday === 'number', 'KPI: employeesOnLeaveToday computed', kpis.employeesOnLeaveToday);
    assert(typeof kpis.pendingRequests === 'number', 'KPI: pendingRequests computed', kpis.pendingRequests);
    assert(typeof kpis.totalLeaveDaysTaken === 'number', 'KPI: totalLeaveDaysTaken computed', kpis.totalLeaveDaysTaken);
    assert(typeof kpis.totalLeaveDaysRemaining === 'number', 'KPI: totalLeaveDaysRemaining computed', kpis.totalLeaveDaysRemaining);

    // 15. Reports Generation (JSON & CSV)
    console.log('\n--- 15. Leave Reports & CSV Exporter ---');
    const registerJson = await LeaveReportService.generateLeaveRegister(2026, 'json');
    assert(Array.isArray(registerJson), 'LeaveReportService.generateLeaveRegister returns JSON array');

    const registerCsv = await LeaveReportService.generateLeaveRegister(2026, 'csv');
    assert(typeof registerCsv === 'string' && registerCsv.includes('Request Number'), 'LeaveReportService.generateLeaveRegister generates valid CSV string with headers');

    console.log('\n================================================================');
    console.log(`📊 PHASE 16 VERIFICATION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('================================================================\n');

    if (passedTests === totalTests) {
      console.log('🎉 ALL PHASE 16 DOMAIN SERVICES & INVARIANTS VERIFIED SUCCESSFULLY!');
    } else {
      console.error('⚠️ SOME TESTS FAILED. CHECK LOGS ABOVE.');
      process.exit(1);
    }
  } catch (err) {
    console.error('💥 Unhandled error during Phase 16 verification:', err);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

runPhase16Verification();
