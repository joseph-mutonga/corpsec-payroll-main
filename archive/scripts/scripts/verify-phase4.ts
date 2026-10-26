import { db } from '../src/lib/db';
import {
  evaluateAttendance,
  calculateShiftDurationMinutes,
  constructShiftDateTime,
  ShiftInfo,
} from '../src/lib/attendance-calculator';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runPhase4Verification() {
  console.log('================================================================');
  console.log('  CORPSEC HR PAYROLL — PHASE 4 VERIFICATION SUITE');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST SUITE 1: Calculation Engine - Normal Day Shift & Grace Period
  // ---------------------------------------------------------------------------
  console.log('TEST SUITE 1: Normal Day Shift & Grace Period Thresholds');
  const dayShift: ShiftInfo = {
    startTime: '06:00',
    endTime: '18:00',
    isOvernight: false,
    gracePeriodMinutes: 15,
    breakDurationMinutes: 60,
    isBreakPaid: false,
  };

  const workDate = new Date(2026, 7, 12); // August 12, 2026

  // Case 1.1: Exact on-time clock-in & clock-out
  const clockIn1 = new Date(2026, 7, 12, 6, 0, 0);
  const clockOut1 = new Date(2026, 7, 12, 18, 0, 0);
  const res1 = evaluateAttendance({
    workDate,
    shift: dayShift,
    actualClockIn: clockIn1,
    actualClockOut: clockOut1,
  });
  assert(res1.attendanceStatus === 'PRESENT', 'Exact on-time attendance is PRESENT');
  assert(res1.lateMinutes === 0, 'Late minutes is 0 for on-time arrival');
  assert(res1.workedMinutes === 660, '12 hour shift minus 60 min unpaid break = 660 mins (11.0 hrs)');
  assert(res1.overtimeMinutes === 0, 'Overtime minutes is 0');

  // Case 1.2: Arrival within grace period (e.g. 06:12 - within 15 min grace)
  const clockInGrace = new Date(2026, 7, 12, 6, 12, 0);
  const resGrace = evaluateAttendance({
    workDate,
    shift: dayShift,
    actualClockIn: clockInGrace,
    actualClockOut: clockOut1,
  });
  assert(resGrace.attendanceStatus === 'PRESENT', 'Arrival within 15 min grace period is PRESENT');
  assert(resGrace.lateMinutes === 0, 'Late minutes waived during grace period');

  // Case 1.3: Late arrival exceeding grace period (e.g. 06:25 - 25 min late)
  const clockInLate = new Date(2026, 7, 12, 6, 25, 0);
  const resLate = evaluateAttendance({
    workDate,
    shift: dayShift,
    actualClockIn: clockInLate,
    actualClockOut: clockOut1,
  });
  assert(resLate.attendanceStatus === 'LATE', 'Arrival past 15 min grace period is LATE');
  assert(resLate.lateMinutes === 25, 'Late minutes calculates exact 25 minutes from shift start');

  console.log('\n----------------------------------------------------------------');
  console.log('TEST SUITE 2: Overnight Shift (Crossing Midnight) & Overtime');
  console.log('----------------------------------------------------------------');
  const nightShift: ShiftInfo = {
    startTime: '18:00',
    endTime: '06:00',
    isOvernight: true,
    gracePeriodMinutes: 15,
    breakDurationMinutes: 60,
    isBreakPaid: true, // paid break for night guards
  };

  const nightClockIn = new Date(2026, 7, 12, 18, 0, 0);
  const nightClockOut = new Date(2026, 7, 13, 6, 0, 0); // next morning
  const resNight = evaluateAttendance({
    workDate,
    shift: nightShift,
    actualClockIn: nightClockIn,
    actualClockOut: nightClockOut,
  });
  assert(resNight.attendanceStatus === 'PRESENT', 'Overnight shift on-time attendance is PRESENT');
  assert(resNight.workedMinutes === 720, '12-hour overnight shift with paid break = 720 worked minutes (12.0 hrs)');

  // Case 2.2: Night shift with 2 hours overtime (clock-out at 08:00 next day)
  const nightClockOutOT = new Date(2026, 7, 13, 8, 0, 0);
  const resNightOT = evaluateAttendance({
    workDate,
    shift: nightShift,
    actualClockIn: nightClockIn,
    actualClockOut: nightClockOutOT,
  });
  assert(resNightOT.attendanceStatus === 'PRESENT_WITH_OVERTIME', 'Overtime shift marked PRESENT_WITH_OVERTIME');
  assert(resNightOT.overtimeMinutes === 120, 'Calculated exactly 120 minutes (2.0 hours) overtime');
  assert(resNightOT.workedMinutes === 840, 'Total worked minutes = 840 mins (14.0 hrs)');

  console.log('\n----------------------------------------------------------------');
  console.log('TEST SUITE 3: Missing Clock Out, Off Days, Leaves & Holidays');
  console.log('----------------------------------------------------------------');
  // Case 3.1: Missing clock out
  const resMissing = evaluateAttendance({
    workDate,
    shift: dayShift,
    actualClockIn: clockIn1,
    actualClockOut: null,
  });
  assert(resMissing.attendanceStatus === 'MISSING_CLOCK_OUT', 'Missing clock-out flagged MISSING_CLOCK_OUT');

  // Case 3.2: Off day differentiation
  const resOff = evaluateAttendance({
    workDate,
    shift: null,
    actualClockIn: null,
    actualClockOut: null,
    existingStatus: 'OFF_DAY',
  });
  assert(resOff.attendanceStatus === 'OFF_DAY', 'OFF_DAY preserved and distinct from unexcused ABSENT');

  // Case 3.3: Public holiday
  const resHoliday = evaluateAttendance({
    workDate,
    shift: null,
    actualClockIn: null,
    actualClockOut: null,
    existingStatus: 'PUBLIC_HOLIDAY',
  });
  assert(resHoliday.attendanceStatus === 'PUBLIC_HOLIDAY', 'PUBLIC_HOLIDAY preserved correctly');

  // Case 3.4: Unexcused absent
  const resAbsent = evaluateAttendance({
    workDate,
    shift: dayShift,
    actualClockIn: null,
    actualClockOut: null,
  });
  assert(resAbsent.attendanceStatus === 'ABSENT', 'No clock event on scheduled shift is marked ABSENT');

  console.log('\n----------------------------------------------------------------');
  console.log('TEST SUITE 4: Database Models & Workflow Integrity');
  console.log('----------------------------------------------------------------');

  const shiftCount = await db.shift.count();
  assert(shiftCount >= 4, `Database has ${shiftCount} seeded shifts`);

  const scheduleCount = await db.workSchedule.count();
  assert(scheduleCount >= 3, `Database has ${scheduleCount} seeded work schedules`);

  const holidayCount = await db.publicHoliday.count();
  assert(holidayCount >= 10, `Database has ${holidayCount} Kenya public holidays`);

  const testEmp = await db.employee.findFirst({
    where: { deletedAt: null },
    include: { shiftAssignments: true },
  });
  assert(testEmp !== null, `Found test employee: ${testEmp?.fullName} (${testEmp?.employeeNumber})`);

  // Test creating an AttendanceRecord and an immutable AttendanceAdjustment
  const testDate = new Date('2026-08-15T00:00:00.000Z');
  const record = await db.attendanceRecord.upsert({
    where: {
      employeeId_date: {
        employeeId: testEmp!.id,
        date: testDate,
      },
    },
    update: {
      workedMinutes: 660,
      lateMinutes: 0,
      overtimeMinutes: 0,
      attendanceStatus: 'PRESENT',
      approvalStatus: 'SUBMITTED',
    },
    create: {
      employeeId: testEmp!.id,
      date: testDate,
      workedMinutes: 660,
      lateMinutes: 0,
      overtimeMinutes: 0,
      attendanceStatus: 'PRESENT',
      source: 'PORTAL',
      approvalStatus: 'SUBMITTED',
    },
  });
  assert(record.id !== undefined, 'Successfully upserted test AttendanceRecord');

  // Create adjustment
  const adjustment = await db.attendanceAdjustment.create({
    data: {
      attendanceRecordId: record.id,
      employeeId: testEmp!.id,
      fieldChanged: 'WORKED_MINUTES',
      originalValue: '660',
      newValue: '720',
      reason: 'Verification test: Supervisor approved missing 60 minutes for shift extension',
      status: 'APPLIED',
    },
  });
  assert(adjustment.id !== undefined, 'Successfully logged immutable AttendanceAdjustment audit trail');

  // Test approval & period lock transition
  const approvedRecord = await db.attendanceRecord.update({
    where: { id: record.id },
    data: {
      approvalStatus: 'APPROVED',
      approvedAt: new Date(),
    },
  });
  assert(approvedRecord.approvalStatus === 'APPROVED', 'Record transitioned to APPROVED (ready for payroll)');

  const lockedRecord = await db.attendanceRecord.update({
    where: { id: record.id },
    data: {
      approvalStatus: 'LOCKED',
      lockedAt: new Date(),
    },
  });
  assert(lockedRecord.approvalStatus === 'LOCKED', 'Record transitioned to LOCKED (sealed against modifications)');

  console.log('\n================================================================');
  console.log('  ✅ ALL PHASE 4 UNIT & CALCULATION TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}

runPhase4Verification()
  .catch((e) => {
    console.error('Test execution failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
