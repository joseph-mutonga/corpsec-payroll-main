import { db } from '../src/lib/db';
import {
  evaluateAttendance,
  calculateShiftDurationMinutes,
  constructShiftDateTime,
  validateShiftAssignment,
} from '../src/lib/attendance-calculator';
import { AttendanceService } from '../src/lib/attendance/AttendanceService';
import { AttendanceImportService } from '../src/lib/attendance/AttendanceImportService';

async function main() {
  console.log('================================================================');
  console.log('🚀 CORPSEC PHASE 12: ATTENDANCE & WORKFORCE SCHEDULING VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      if (details) console.error(`     Details: ${details}`);
      failed++;
    }
  }

  // 1. Core Shift Duration & Overnight Calculation Tests
  console.log('🔹 1. Testing Shift Duration & Midnight Boundary Algorithms...');
  const dayShiftDuration = calculateShiftDurationMinutes('06:00', '18:00', false);
  assert(dayShiftDuration === 720, '12-Hour Day Shift duration is exactly 720 minutes (12h)');

  const nightShiftDuration = calculateShiftDurationMinutes('18:00', '06:00', true);
  assert(nightShiftDuration === 720, '12-Hour Night Shift (crossing midnight) duration is exactly 720 minutes (12h)');

  const lateNightShift = calculateShiftDurationMinutes('22:00', '06:00', true);
  assert(lateNightShift === 480, '8-Hour Night Shift (22:00 -> 06:00) duration is exactly 480 minutes (8h)');

  const normal8hShift = calculateShiftDurationMinutes('08:00', '17:00', false);
  assert(normal8hShift === 540, '9-Hour Standard Gross Shift (08:00 -> 17:00) is 540 minutes');

  // 2. Evaluation Engine: Break Deductions, Punctuality & Grace Periods
  console.log('\n🔹 2. Testing Break Deductions, Punctuality & Grace Periods...');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Guard arrives 10 mins after start (within 15m grace period)
  const onTimeClockIn = new Date(today);
  onTimeClockIn.setHours(6, 10, 0, 0);
  const normalClockOut = new Date(today);
  normalClockOut.setHours(18, 0, 0, 0);

  const evalOnTime = evaluateAttendance({
    workDate: today,
    shift: {
      startTime: '06:00',
      endTime: '18:00',
      isOvernight: false,
      gracePeriodMinutes: 15,
      breakDurationMinutes: 60,
      isBreakPaid: false,
    },
    actualClockIn: onTimeClockIn,
    actualClockOut: normalClockOut,
  });

  assert(evalOnTime.lateMinutes === 0, 'Arrival within 15m grace period has 0 late minutes');
  assert(evalOnTime.workedMinutes === 650, 'Net worked minutes deducts 60m unpaid break correctly');
  assert(evalOnTime.attendanceStatus === 'PRESENT', 'Status is PRESENT for on-time arrival');

  // Guard arrives 35 mins after start (beyond 15m grace period)
  const lateClockIn = new Date(today);
  lateClockIn.setHours(6, 35, 0, 0);

  const evalLate = evaluateAttendance({
    workDate: today,
    shift: {
      startTime: '06:00',
      endTime: '18:00',
      isOvernight: false,
      gracePeriodMinutes: 15,
      breakDurationMinutes: 60,
      isBreakPaid: false,
    },
    actualClockIn: lateClockIn,
    actualClockOut: normalClockOut,
  });

  assert(evalLate.lateMinutes === 35, 'Arrival beyond grace period is flagged with 35 late minutes');
  assert(evalLate.attendanceStatus === 'LATE', 'Status is LATE for late arrival');

  // Guard leaves 45 mins early
  const earlyClockOut = new Date(today);
  earlyClockOut.setHours(17, 15, 0, 0);

  const evalEarly = evaluateAttendance({
    workDate: today,
    shift: {
      startTime: '06:00',
      endTime: '18:00',
      isOvernight: false,
      gracePeriodMinutes: 15,
      breakDurationMinutes: 60,
      isBreakPaid: false,
    },
    actualClockIn: onTimeClockIn,
    actualClockOut: earlyClockOut,
  });

  assert(evalEarly.earlyDepartureMinutes === 45, 'Clock out before scheduled end flags 45 early departure minutes');
  assert(evalEarly.attendanceStatus === 'EARLY_DEPARTURE', 'Status is EARLY_DEPARTURE when leaving early');

  // Guard works 2 hours overtime
  const otClockOut = new Date(today);
  otClockOut.setHours(20, 0, 0, 0);

  const evalOT = evaluateAttendance({
    workDate: today,
    shift: {
      startTime: '06:00',
      endTime: '18:00',
      isOvernight: false,
      gracePeriodMinutes: 15,
      breakDurationMinutes: 60,
      isBreakPaid: false,
    },
    actualClockIn: onTimeClockIn,
    actualClockOut: otClockOut,
  });

  assert(evalOT.overtimeMinutes === 110, 'Overtime calculated correctly for shift extension');
  assert(evalOT.attendanceStatus === 'PRESENT_WITH_OVERTIME', 'Status is PRESENT_WITH_OVERTIME');

  // 3. Shift Conflict Detection Tests
  console.log('\n🔹 3. Testing Roster Conflict Detection Logic...');
  const empHireDate = new Date('2025-01-01');
  const empExitDate = new Date('2026-12-31');

  const conflictBeforeHire = validateShiftAssignment({
    employeeId: 'emp1',
    date: new Date('2024-12-15'),
    employmentDate: empHireDate,
  });
  assert(conflictBeforeHire.isBlocked && conflictBeforeHire.errors.length > 0, 'Roster assignment before hire date is blocked');

  const conflictOnLeave = validateShiftAssignment({
    employeeId: 'emp1',
    date: new Date('2026-08-15'),
    employmentDate: empHireDate,
    existingLeaveRequests: [
      {
        startDate: new Date('2026-08-10'),
        endDate: new Date('2026-08-20'),
        status: 'APPROVED',
        leaveType: { name: 'Annual Leave' },
      },
    ],
  });
  assert(conflictOnLeave.isBlocked && conflictOnLeave.errors.some((e) => e.includes('Annual Leave')), 'Roster assignment during approved leave is blocked');

  const consecutiveDaysWarning = validateShiftAssignment({
    employeeId: 'emp1',
    date: new Date('2026-08-15'),
    employmentDate: empHireDate,
    consecutiveWorkDays: 7,
  });
  assert(consecutiveDaysWarning.warnings.length > 0, 'Consecutive work days warning triggered for 7 days without rest');

  // 4. Server-Time Clocking & Anti-Tampering Database Service Tests
  console.log('\n🔹 4. Testing Clocking Service & Anti-Tampering Rules in DB...');
  const testGuard = await db.employee.findFirst({
    where: { employeeNumber: 'CORP-000001', deletedAt: null },
  });

  if (!testGuard) {
    throw new Error('Test employee CORP-000001 not found');
  }

  // Clean up any test attendance record for today
  await db.attendanceEvent.deleteMany({ where: { employeeId: testGuard.id } });
  await db.overtimeRecord.deleteMany({ where: { employeeId: testGuard.id } });
  await db.attendanceRecord.deleteMany({ where: { employeeId: testGuard.id } });

  // Clock In
  const clockInResult = await AttendanceService.processClockEvent({
    employeeId: testGuard.id,
    eventType: 'CLOCK_IN',
    source: 'WEB',
    ipAddress: '192.168.1.50',
    deviceInfo: 'Unit-Test-Agent',
  });

  assert(Boolean(clockInResult.attendanceRecord.actualClockIn), 'Clock-In recorded server timestamp');
  assert(clockInResult.event.eventType === 'CLOCK_IN', 'AttendanceEvent logged with CLOCK_IN');
  assert(clockInResult.event.ipAddress === '192.168.1.50', 'IP address logged correctly');

  // Anti-Tampering: Double Clock-In Rejection
  let doubleClockInBlocked = false;
  try {
    await AttendanceService.processClockEvent({
      employeeId: testGuard.id,
      eventType: 'CLOCK_IN',
      source: 'WEB',
    });
  } catch (err: any) {
    if (err.message.includes('Double Clock-In blocked')) doubleClockInBlocked = true;
  }
  assert(doubleClockInBlocked, 'Double Clock-In was blocked with descriptive error');

  // Clock Out
  const clockOutResult = await AttendanceService.processClockEvent({
    employeeId: testGuard.id,
    eventType: 'CLOCK_OUT',
    source: 'WEB',
  });

  assert(Boolean(clockOutResult.attendanceRecord.actualClockOut), 'Clock-Out recorded server timestamp');
  assert(clockOutResult.event.eventType === 'CLOCK_OUT', 'AttendanceEvent logged with CLOCK_OUT');

  // Anti-Tampering: Double Clock-Out Rejection
  let doubleClockOutBlocked = false;
  try {
    await AttendanceService.processClockEvent({
      employeeId: testGuard.id,
      eventType: 'CLOCK_OUT',
      source: 'WEB',
    });
  } catch (err: any) {
    if (err.message.includes('Double Clock-Out blocked')) doubleClockOutBlocked = true;
  }
  assert(doubleClockOutBlocked, 'Double Clock-Out was blocked with descriptive error');

  // 5. Attendance Locking for Payroll Finalization Tests
  console.log('\n🔹 5. Testing Attendance Locking for Payroll Integration...');
  const testAdminUser = await db.user.findFirst({
    where: {
      email: 'admin@corpsec.co.ke',
    },
  });
  if (testAdminUser) {
    const lockResult = await AttendanceService.lockAttendanceForPayroll(
      'test-payroll-run-123',
      new Date(Date.now() - 24 * 60 * 60 * 1000),
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      testAdminUser.id
    );
    assert(lockResult.count >= 1, 'Attendance record sealed/locked for finalized payroll run');

    // Attempting to clock on a locked record is rejected
    let clockOnLockedBlocked = false;
    try {
      await AttendanceService.processClockEvent({
        employeeId: testGuard.id,
        eventType: 'CLOCK_IN',
      });
    } catch (err: any) {
      if (err.message.includes('sealed/locked')) clockOnLockedBlocked = true;
    }
    assert(clockOnLockedBlocked, 'Clocking on a locked attendance record is strictly rejected');

    // Unlock test record for remaining tests
    await db.attendanceRecord.updateMany({
      where: { employeeId: testGuard.id },
      data: { approvalStatus: 'DRAFT' },
    });
  }

  // 6. Overtime Workflow & Approval Tests
  console.log('\n🔹 6. Testing Overtime Review & Approval Workflow...');
  const otRecord = await db.overtimeRecord.create({
    data: {
      employeeId: testGuard.id,
      date: today,
      scheduledHours: 12,
      actualHours: 14,
      overtimeMinutes: 120,
      overtimeHours: 2.0,
      reason: 'Emergency Relief Post Deployment',
      approvalStatus: 'PENDING',
    },
  });

  const reviewedOT = await AttendanceService.reviewOvertime({
    overtimeId: otRecord.id,
    action: 'APPROVE',
    reviewerUserId: testAdminUser?.id || 'admin_user',
    comments: 'Verified by Westlands Station Commander logbook',
    approvedHours: 2.0,
  });

  assert(reviewedOT.approvalStatus === 'APPROVED', 'Overtime status transitioned to APPROVED');
  assert(reviewedOT.overtimeHours === 2.0, 'Approved Overtime hours saved for payroll linking');

  // 7. Attendance Adjustments & Corrections Audit Tests
  console.log('\n🔹 7. Testing Attendance Adjustment & Audit Logs...');
  const existingRecord = await db.attendanceRecord.findFirst({
    where: { employeeId: testGuard.id },
  });

  if (existingRecord) {
    const adj = await db.attendanceAdjustment.create({
      data: {
        attendanceRecordId: existingRecord.id,
        employeeId: testGuard.id,
        fieldChanged: 'STATUS',
        originalValue: existingRecord.attendanceStatus,
        newValue: 'PRESENT',
        reason: 'Biometric device synchronization retry verified',
        status: 'PENDING_REVIEW',
      },
    });

    const reviewedAdj = await AttendanceService.reviewCorrection({
      adjustmentId: adj.id,
      action: 'APPROVE',
      reviewerUserId: testAdminUser?.id || 'admin_user',
      comments: 'Approved by HR Manager',
    });

    assert(reviewedAdj.success, 'Attendance adjustment approved and applied to master record');

    const checkAdj = await db.attendanceAdjustment.findUnique({ where: { id: adj.id } });
    assert(checkAdj?.status === 'APPLIED', 'Adjustment status is APPLIED in database');
  }

  // 8. Attendance CSV Import Service Tests
  console.log('\n🔹 8. Testing Attendance CSV Import Validation & Execution...');
  const csvData = `EmployeeNumber,Date,ClockIn,ClockOut,Source
CORP-000001,2026-08-10,06:00,18:00,BIOMETRIC
NON_EXISTENT_GUARD,2026-08-10,06:00,18:00,IMPORT`;

  const preview = await AttendanceImportService.validateAndPreview(csvData);
  assert(preview.totalRows === 2, 'CSV parsed 2 total rows');
  assert(preview.validCount === 1, 'Valid row recognized for CORP-000001');
  assert(preview.errorCount === 1, 'Error row recognized for non-existent guard');

  const importResult = await AttendanceImportService.executeImport(preview.rows, testAdminUser?.id || 'admin_user');
  assert(importResult.importedCount === 1, 'Imported 1 valid attendance record into database');

  // 9. Configurable Attendance Settings Persistence Tests
  console.log('\n🔹 9. Testing Attendance Settings Model...');
  const settings = await db.attendanceSetting.upsert({
    where: { id: 'corpsec_attendance_setting_default' },
    update: { gracePeriodMinutes: 20 },
    create: {
      id: 'corpsec_attendance_setting_default',
      gracePeriodMinutes: 20,
    },
  });

  assert(settings.gracePeriodMinutes === 20, 'AttendanceSetting persisted gracePeriodMinutes = 20');

  // Reset setting back to 15
  await db.attendanceSetting.update({
    where: { id: 'corpsec_attendance_setting_default' },
    data: { gracePeriodMinutes: 15 },
  });

  // Summary
  console.log('\n================================================================');
  console.log(`📊 PHASE 12 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Fatal error running verify-phase12:', err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
