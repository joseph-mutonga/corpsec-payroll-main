import { PrismaClient } from '@prisma/client';
import { AttendanceCalculationService } from '../src/lib/attendance/AttendanceCalculationService';
import { AttendancePolicyService } from '../src/lib/attendance/AttendancePolicyService';
import { ShiftService } from '../src/lib/attendance/ShiftService';
import { ScheduleService } from '../src/lib/attendance/ScheduleService';
import { ClockService } from '../src/lib/attendance/ClockService';
import { BreakService } from '../src/lib/attendance/BreakService';
import { AttendanceService } from '../src/lib/attendance/AttendanceService';
import { RosterService } from '../src/lib/attendance/RosterService';
import { AttendanceCorrectionService } from '../src/lib/attendance/AttendanceCorrectionService';
import { TimesheetService } from '../src/lib/attendance/TimesheetService';
import { OvertimeService } from '../src/lib/attendance/OvertimeService';
import { CoverageService } from '../src/lib/attendance/CoverageService';
import { HandoverService } from '../src/lib/attendance/HandoverService';
import { AttendanceImportService } from '../src/lib/attendance/AttendanceImportService';
import { AttendanceDeviceService } from '../src/lib/attendance/AttendanceDeviceService';
import { AttendancePayrollIntegrationService } from '../src/lib/attendance/AttendancePayrollIntegrationService';
import { AttendanceAnalyticsService } from '../src/lib/attendance/AttendanceAnalyticsService';
import { AttendanceReportService } from '../src/lib/attendance/AttendanceReportService';

const prisma = new PrismaClient();

async function main() {
  console.log('================================================================');
  console.log('  CORPSEC PHASE 17: ATTENDANCE, TIME & SCHEDULING VERIFICATION  ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${description}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${description}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // 1. Attendance Calculation Arithmetic
    // -------------------------------------------------------------
    console.log('1. Testing AttendanceCalculationService Arithmetic...');

    const inTime = '2026-08-15T08:10:00';
    const outTime = '2026-08-15T17:30:00';
    const normalCalc = AttendanceCalculationService.calculateAttendance(
      '08:00',
      '17:00',
      inTime,
      outTime,
      { gracePeriodMinutes: 15, breakDurationMinutes: 60, isBreakPaid: false }
    );

    assert(normalCalc.isLate === false, '8:10 arrival within 15 min grace is NOT late');
    assert(normalCalc.workedMinutes === 500, 'Worked minutes correctly deducted 60m unpaid break (560 - 60 = 500m)');
    assert(normalCalc.workedHours === 8.33, 'Worked hours rounded to 8.33h');
    assert(normalCalc.overtimeMinutes === 20, 'Overtime calculated as 20 minutes');

    const lateInTime = '2026-08-15T08:30:00';
    const lateCalc = AttendanceCalculationService.calculateAttendance(
      '08:00',
      '17:00',
      lateInTime,
      outTime,
      { gracePeriodMinutes: 15 }
    );
    assert(lateCalc.isLate === true, '8:30 arrival past 15 min grace is LATE');
    assert(lateCalc.lateMinutes === 15, 'Late minutes = 30 - 15 = 15m');

    // Cross-midnight shift calculation (22:00 -> 06:00)
    const nightStart = '2026-08-15T22:00:00';
    const nightEnd = '2026-08-16T06:00:00';
    const nightCalc = AttendanceCalculationService.calculateAttendance(
      '22:00',
      '06:00',
      nightStart,
      nightEnd,
      { isCrossMidnight: true, breakDurationMinutes: 0 }
    );
    assert(nightCalc.workedHours === 8.0, 'Cross-midnight shift correctly calculated as 8.0 hours');

    // -------------------------------------------------------------
    // 2. Attendance Policy Service
    // -------------------------------------------------------------
    console.log('\n2. Testing AttendancePolicyService...');
    const settings = await AttendancePolicyService.getSettings();
    assert(!!settings.id, 'Retrieved active attendance settings');

    const updatedSettings = await AttendancePolicyService.updateSettings({
      gracePeriodMinutes: 15,
      earlyDepartureThresholdMins: 15,
    });
    assert(updatedSettings.gracePeriodMinutes === 15, 'Updated attendance policy grace period');

    // -------------------------------------------------------------
    // 3. Shift Management
    // -------------------------------------------------------------
    console.log('\n3. Testing ShiftService...');
    const dayShiftCode = `DS-TEST-${Date.now()}`;
    const dayShift = await ShiftService.createShift({
      code: dayShiftCode,
      name: 'Day Guard Shift (06:00 - 18:00)',
      startTime: '06:00',
      endTime: '18:00',
      shiftType: 'DAY',
      gracePeriodMinutes: 15,
      breakDurationMinutes: 60,
    });
    assert(dayShift.isOvernight === false, 'Day shift correctly recognized as standard non-overnight');

    const nightShiftCode = `NS-TEST-${Date.now()}`;
    const nightShift = await ShiftService.createShift({
      code: nightShiftCode,
      name: 'Night Guard Shift (18:00 - 06:00)',
      startTime: '18:00',
      endTime: '06:00',
      shiftType: 'NIGHT',
    });
    assert(nightShift.isOvernight === true, 'Night shift (18:00 -> 06:00) automatically detected as overnight');

    // -------------------------------------------------------------
    // 4. Schedule & Employee Assignment
    // -------------------------------------------------------------
    console.log('\n4. Testing ScheduleService & Employee Assignment...');
    const schedCode = `SCHED-TEST-${Date.now()}`;
    const schedule = await ScheduleService.createSchedule({
      code: schedCode,
      name: '6/1 Guarding Rotation Schedule',
      patternType: 'ROTATION_6_1',
      cycleDays: 7,
    });
    assert(schedule.cycleDays === 7, 'Created 6/1 guarding rotation schedule');

    const testEmployee = await prisma.employee.findFirst({
      where: { deletedAt: null },
    });
    if (!testEmployee) throw new Error('No employee found for testing.');

    const assignment = await ScheduleService.assignEmployeeSchedule({
      employeeId: testEmployee.id,
      shiftId: dayShift.id,
      workScheduleId: schedule.id,
      startDate: new Date('2026-08-01'),
    });
    assert(assignment.status === 'ACTIVE', 'Assigned shift and schedule to employee');

    // -------------------------------------------------------------
    // 5. Clock In, Break, and Clock Out Workflow
    // -------------------------------------------------------------
    console.log('\n5. Testing ClockService & BreakService...');
    const clockInTime = new Date();
    clockInTime.setHours(6, 5, 0, 0);
    const testWorkday = ClockService.getWorkdayDate(clockInTime);

    // Clean up any pre-existing test attendance record for this test day
    await prisma.attendanceAdjustment.deleteMany({
      where: { employeeId: testEmployee.id },
    });
    await prisma.attendanceEvent.deleteMany({
      where: { employeeId: testEmployee.id },
    });
    await prisma.overtimeRecord.deleteMany({
      where: { employeeId: testEmployee.id },
    });
    await prisma.attendanceRecord.deleteMany({
      where: { employeeId: testEmployee.id },
    });

    const clockInRecord = await ClockService.clockIn({
      employeeId: testEmployee.id,
      timestamp: clockInTime,
      source: 'TEST_SUITE',
    });
    assert(!!clockInRecord.actualClockIn, 'Clock-in successfully recorded');
    assert(clockInRecord.attendanceStatus === 'PRESENT', 'Recorded status as PRESENT (within grace period)');

    const adminUser = await prisma.user.findFirst();
    if (!adminUser) throw new Error('No user found for testing.');

    // Duplicate Clock In Prevention
    let duplicatePrevented = false;
    try {
      await ClockService.clockIn({
        employeeId: testEmployee.id,
        timestamp: new Date(clockInTime.getTime() + 10 * 60000),
      });
    } catch (err: any) {
      duplicatePrevented = true;
    }
    assert(duplicatePrevented, 'Duplicate open clock-in prevented with error');

    // Break Start and End
    const breakRecord = await BreakService.startBreak(testEmployee.id);
    assert(breakRecord.isBreakActive === true, 'Break session started successfully');

    const endBreakRecord = await BreakService.endBreak(testEmployee.id);
    assert(endBreakRecord.isBreakActive === false, 'Break session ended successfully');

    // Clock Out
    const clockOutTime = new Date(clockInTime);
    clockOutTime.setHours(18, 30, 0, 0);
    const clockOutRecord = await ClockService.clockOut({
      employeeId: testEmployee.id,
      timestamp: clockOutTime,
      source: 'TEST_SUITE',
    });
    assert(!!clockOutRecord.actualClockOut, 'Clock-out successfully finalized');
    assert(clockOutRecord.workedMinutes > 0, 'Worked minutes accurately calculated');

    const testDateKey = `${clockInTime.getFullYear()}-${String(clockInTime.getMonth() + 1).padStart(2, '0')}-${String(clockInTime.getDate()).padStart(2, '0')}`;

    // -------------------------------------------------------------
    // 6. Roster Service & Phase 16 Leave Integration
    // -------------------------------------------------------------
    console.log('\n6. Testing RosterService Integration...');
    const roster = await RosterService.getTeamRoster({
      startDate: testDateKey,
      endDate: testDateKey,
      employeeId: testEmployee.id,
    });
    assert(roster.length > 0, 'Generated team roster for date range');
    assert(roster[0].status === 'PRESENT', 'Roster reflects PRESENT status from live clocking');

    // -------------------------------------------------------------
    // 7. Attendance Correction Workflow & Audit
    // -------------------------------------------------------------
    console.log('\n7. Testing AttendanceCorrectionService...');
    const adjustment = await AttendanceCorrectionService.submitCorrection({
      attendanceRecordId: clockOutRecord.id,
      employeeId: testEmployee.id,
      fieldChanged: 'STATUS',
      requestedValue: 'PRESENT_WITH_OVERTIME',
      reason: 'Approved post-shift emergency guard overtime',
    });
    assert(adjustment.status === 'PENDING_REVIEW', 'Correction request logged as PENDING_REVIEW');

    const reviewedAdj = await AttendanceCorrectionService.reviewCorrection({
      adjustmentId: adjustment.id,
      decision: 'APPROVE',
      reviewerUserId: adminUser.id,
    });
    assert(reviewedAdj.status === 'APPLIED', 'Correction request approved and applied safely');

    // -------------------------------------------------------------
    // 8. Timesheets & Periodic Aggregation
    // -------------------------------------------------------------
    console.log('\n8. Testing TimesheetService...');
    const timesheet = await TimesheetService.generateTimesheet(
      testEmployee.id,
      '2026-08-01',
      '2026-08-31'
    );
    assert(timesheet.timesheetNumber.startsWith('TS-2026-'), 'Generated sequential timesheet TS-2026-XXXX');
    assert(timesheet.workedHours > 0, 'Aggregated worked hours onto period timesheet');

    const approvedTs = await TimesheetService.reviewTimesheet({
      timesheetId: timesheet.id,
      decision: 'APPROVE',
      reviewerUserId: adminUser.id,
    });
    assert(approvedTs.status === 'APPROVED', 'Timesheet approved successfully');

    // -------------------------------------------------------------
    // 9. Overtime Service & Rate Categories
    // -------------------------------------------------------------
    console.log('\n9. Testing OvertimeService...');
    const otRecord = await OvertimeService.requestOvertime({
      employeeId: testEmployee.id,
      attendanceRecordId: clockOutRecord.id,
      date: testDateKey,
      overtimeHours: 2.5,
      overtimeType: 'HOLIDAY',
      reason: 'Guarding coverage on gazetted public holiday',
    });
    assert(otRecord.overtimeRateMultiplier === 2.0, 'Holiday overtime automatically assigned 2.0x multiplier');

    const approvedOt = await OvertimeService.reviewOvertime({
      overtimeId: otRecord.id,
      decision: 'APPROVE',
      reviewerUserId: adminUser.id,
    });
    assert(approvedOt.approvalStatus === 'APPROVED', 'Overtime request approved by supervisor');

    // -------------------------------------------------------------
    // 10. Station Guarding Coverage
    // -------------------------------------------------------------
    console.log('\n10. Testing CoverageService...');
    const coverage = await CoverageService.getStationCoverage('2026-08-20');
    assert(Array.isArray(coverage), 'Evaluated station guarding coverage matrix');
    if (coverage.length > 0) {
      assert(coverage[0].coveragePercentage >= 0 && coverage[0].coveragePercentage <= 100, 'Coverage percentage properly bounded [0, 100]');
    }

    // -------------------------------------------------------------
    // 11. Shift Handover Logging
    // -------------------------------------------------------------
    console.log('\n11. Testing HandoverService...');
    const testStation = await prisma.station.findFirst({ where: { deletedAt: null } });
    if (testStation) {
      const handover = await HandoverService.createHandover({
        stationId: testStation.id,
        outgoingEmployeeId: testEmployee.id,
        incomingEmployeeId: testEmployee.id,
        shiftId: dayShift.id,
        notes: 'Handover complete. 2 Radios, 1 Occurrence Book in order.',
        equipmentChecklist: { radios: 2, torches: 2, keys: 'All Present' },
      });
      assert(handover.handoverNumber.startsWith('HND-2026-'), 'Shift handover reference generated as HND-2026-XXXX');
      assert(handover.status === 'CONFIRMED', 'Shift handover confirmed');
    }

    // -------------------------------------------------------------
    // 12. Attendance Device Registry
    // -------------------------------------------------------------
    console.log('\n12. Testing AttendanceDeviceService...');
    const devCode = `BIO-TEST-${Date.now()}`;
    const device = await AttendanceDeviceService.createDevice({
      deviceCode: devCode,
      name: 'North Gate Biometric Scanner',
      deviceType: 'BIOMETRIC',
      ipAddress: '192.168.1.120',
      locationName: 'North Gate Turnstile',
    });
    assert(device.deviceCode === devCode, 'Registered new biometric attendance device');

    // -------------------------------------------------------------
    // 13. Attendance CSV Import
    // -------------------------------------------------------------
    console.log('\n13. Testing AttendanceImportService...');
    const sampleCsv = `Employee Number,Date,Clock In,Clock Out,Source\n${testEmployee.employeeNumber},2026-08-21,06:00,18:00,BIOMETRIC_IMPORT`;
    const parsedRows = AttendanceImportService.parseCsv(sampleCsv);
    assert(parsedRows.length === 1, 'Parsed 1 CSV attendance punch row');

    const preview = await AttendanceImportService.previewImport(parsedRows);
    assert(preview.validCount === 1, 'CSV import preview successfully validated existing employee');

    const importResult = await AttendanceImportService.executeImport(parsedRows);
    assert(importResult.importedCount === 1, 'Imported CSV punch into AttendanceRecord');

    // -------------------------------------------------------------
    // 14. Attendance Payroll Integration & Locking
    // -------------------------------------------------------------
    console.log('\n14. Testing AttendancePayrollIntegrationService...');
    const payrollExport = await AttendancePayrollIntegrationService.getPeriodAttendanceData(
      '2026-08-01',
      '2026-08-31'
    );
    assert(Array.isArray(payrollExport), 'Exported non-mutating attendance dataset for payroll period');
    const empExport = payrollExport.find((p) => p.employeeId === testEmployee.id);
    assert(!!empExport && empExport.totalWorkedHours > 0, 'Payroll export accurately summarizes employee hours');

    // -------------------------------------------------------------
    // 15. Analytics KPIs & Reports
    // -------------------------------------------------------------
    console.log('\n15. Testing AttendanceAnalyticsService & AttendanceReportService...');
    const kpis = await AttendanceAnalyticsService.getCommandCenterKpis('2026-08-20');
    assert(kpis.attendanceRate >= 0, 'Computed real-time attendance rate KPI');

    const csvReport = await AttendanceReportService.generateAttendanceRegister({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      format: 'csv',
    });
    assert(typeof csvReport === 'string' && csvReport.includes('Employee Number'), 'Generated valid CSV attendance register');

    console.log('\n================================================================');
    console.log(`  VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Unhandled error during Phase 17 verification:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
