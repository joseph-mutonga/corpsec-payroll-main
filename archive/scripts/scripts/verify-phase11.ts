// CorpSec HR Payroll — Phase 11 Core Verification Test Suite
// Tests Employee Lifecycle, Onboarding, Offboarding, Final Settlement, Contracts, Probation, Organization & Analytics

import { PrismaClient } from '@prisma/client';
import { EmployeeLifecycleService } from '../src/lib/hr/EmployeeLifecycleService';
import { HRAnalyticsService } from '../src/lib/hr/HRAnalyticsService';
import { EmployeeImportService } from '../src/lib/hr/EmployeeImportService';

const prisma = new PrismaClient();

let passedTests = 0;
let failedTests = 0;

function assert(condition: any, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${details ? ` - ${details}` : ''}`);
    failedTests++;
  }
}

async function runPhase11Tests() {
  console.log('\n=============================================================');
  console.log('  CORPSEC HR PAYROLL — PHASE 11 VERIFICATION TEST SUITE');
  console.log('  Advanced HR Management, Employee Lifecycle & Organization');
  console.log('=============================================================\n');

  try {
    // 1. Fetch Test Personas
    console.log('--- 1. Fetching Test Personas & Context ---');
    const jackson = await prisma.employee.findFirst({
      where: { employeeNumber: 'CORP-000001' },
      include: { department: true, station: true },
    });
    assert(!!jackson, 'Guard Jackson (CORP-000001) found in database');

    const emmanuel = await prisma.employee.findFirst({
      where: { employeeNumber: 'CORP-000002' },
      include: { department: true, station: true },
    });
    assert(!!emmanuel, 'Guard Emmanuel (CORP-000002) found in database');

    const hrAdmin = await prisma.user.findFirst({
      where: { email: 'hr.admin@corpsec.co.ke' },
    });
    assert(!!hrAdmin, 'HR Admin user found in database');

    // 2. Onboarding Workflow & Checklist
    console.log('\n--- 2. Onboarding Workflow & Stage Progression ---');
    // Delete any existing onboarding case for test cleanly
    await prisma.onboardingTask.deleteMany({
      where: { onboardingCase: { employeeId: jackson!.id } },
    });
    await prisma.onboardingCase.deleteMany({
      where: { employeeId: jackson!.id },
    });

    const onbCase = await EmployeeLifecycleService.initiateOnboarding({
      employeeId: jackson!.id,
      targetCompletionDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      assignedToId: hrAdmin?.id,
      notes: 'Tactical VIP Protection Officer induction program.',
    });

    assert(onbCase.caseNumber.startsWith('ONB-'), `Case number generated with ONB prefix (${onbCase.caseNumber})`);
    assert(onbCase.stage === 'INITIATED', 'Initial onboarding stage is INITIATED');
    assert(onbCase.status === 'IN_PROGRESS', 'Initial status is IN_PROGRESS');
    assert(onbCase.tasks.length === 9, 'Default 9 induction checklist tasks created');

    // Complete task 1 and 2 -> advances stage
    const task1 = onbCase.tasks[0];
    const task2 = onbCase.tasks[1];

    const updatedTask1 = await EmployeeLifecycleService.toggleOnboardingTask(
      task1.id,
      true,
      hrAdmin?.id || ''
    );
    assert(updatedTask1.task.isCompleted === true, 'Task 1 toggled to completed');
    assert(updatedTask1.onboardingCase.stage === 'DOCUMENTS', 'Case stage progressed to DOCUMENTS');

    // Complete remaining tasks -> COMPLETED
    for (let i = 1; i < onbCase.tasks.length; i++) {
      await EmployeeLifecycleService.toggleOnboardingTask(
        onbCase.tasks[i].id,
        true,
        hrAdmin?.id || ''
      );
    }

    const finalOnbCase = await prisma.onboardingCase.findUnique({
      where: { id: onbCase.id },
      include: { tasks: true },
    });
    assert(finalOnbCase?.stage === 'COMPLETED', 'Case stage reached COMPLETED');
    assert(finalOnbCase?.status === 'COMPLETED', 'Case status marked COMPLETED');

    // 3. Offboarding & Final Settlement Calculations
    console.log('\n--- 3. Offboarding Workflow & Final Settlement Calculation ---');
    await prisma.offboardingTask.deleteMany({
      where: { offboardingCase: { employeeId: emmanuel!.id } },
    });
    await prisma.offboardingCase.deleteMany({
      where: { employeeId: emmanuel!.id },
    });

    const exitDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const offCase = await EmployeeLifecycleService.initiateOffboarding({
      employeeId: emmanuel!.id,
      exitType: 'RESIGNATION',
      exitDate,
      reason: 'Personal career relocation',
      assignedToId: hrAdmin?.id,
    });

    assert(offCase.caseNumber.startsWith('OFF-'), `Case number generated with OFF prefix (${offCase.caseNumber})`);
    assert(offCase.stage === 'INITIATED', 'Initial offboarding stage is INITIATED');
    assert(offCase.tasks.length === 8, 'Default 8 clearance checklist tasks created');

    // Verify final settlement math
    const settlement = await EmployeeLifecycleService.calculateFinalSettlement(
      emmanuel!.id,
      exitDate
    );
    assert(settlement.dailyRate > 0, `Daily rate computed: KES ${settlement.dailyRate}`);
    assert(settlement.unpaidSalaryAmount > 0, `Unpaid salary computed: KES ${settlement.unpaidSalaryAmount}`);
    assert(typeof settlement.leaveEncashmentAmount === 'number', 'Leave encashment amount is numeric');
    assert(settlement.netPayableSettlement >= 0, `Net settlement is non-negative: KES ${settlement.netPayableSettlement}`);

    // Toggle clearance task
    const clrTask1 = offCase.tasks[0];
    const updatedClr = await EmployeeLifecycleService.toggleOffboardingTask(
      clrTask1.id,
      true,
      hrAdmin?.id || ''
    );
    assert(updatedClr.task.isCompleted === true, 'Clearance task 1 completed');

    // 4. Contract Expiry Alerts & Renewals
    console.log('\n--- 4. Contract Expiry Alerts & Renewal Workflow ---');
    const expiringContracts = await EmployeeLifecycleService.scanExpiringContracts(365);
    assert(Array.isArray(expiringContracts), 'Expiring contracts returned as array');
    assert(expiringContracts.length > 0, `Found ${expiringContracts.length} contract records in lookahead window`);

    const sampleContract = expiringContracts[0];
    const newStart = new Date();
    const newEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const renewed = await EmployeeLifecycleService.renewContract(
      sampleContract.id,
      newStart,
      newEnd,
      hrAdmin?.id || '',
      'Annual performance contract extension'
    );
    assert(renewed.contractEndDate?.getTime() === newEnd.getTime(), 'Contract end date updated in database');

    const contractHistory = await prisma.employeeHistory.findFirst({
      where: { employeeId: sampleContract.id },
      orderBy: { createdAt: 'desc' },
    });
    assert(contractHistory?.description.includes('Renewed fixed-term contract'), 'Contract renewal logged in EmployeeHistory audit trail');

    // 5. Probation Pipeline & Outcome Reviews
    console.log('\n--- 5. Probation Pipeline & Outcome Reviews ---');
    const probations = await EmployeeLifecycleService.getProbationPipeline();
    assert(Array.isArray(probations), 'Probation pipeline returned as array');

    // Record confirmation outcome on Jackson
    const confirmed = await EmployeeLifecycleService.recordProbationOutcome(
      jackson!.id,
      'CONFIRM',
      hrAdmin?.id || '',
      { reason: 'Exemplary security conduct and attendance record' }
    );
    assert(confirmed.probationStatus === 'CONFIRMED', 'Probation status updated to CONFIRMED');
    assert(confirmed.employmentStatus === 'ACTIVE', 'Employment status updated to ACTIVE');

    // Record extension outcome on Emmanuel
    const extendedEnd = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const extended = await EmployeeLifecycleService.recordProbationOutcome(
      emmanuel!.id,
      'EXTEND',
      hrAdmin?.id || '',
      { newEndDate: extendedEnd, reason: 'Requires 2 months additional supervisory monitoring' }
    );
    assert(extended.probationStatus === 'EXTENDED', 'Probation status updated to EXTENDED');
    assert(extended.probationEndDate?.getTime() === extendedEnd.getTime(), 'Probation end date extended');

    // 6. Employee Movement & Transfer Audit Trail
    console.log('\n--- 6. Employee Movement & Audit Ledger ---');
    const testStation = await prisma.station.findFirst({ where: { isActive: true } });
    if (testStation) {
      await EmployeeLifecycleService.recordMovement(
        jackson!.id,
        'STATION_TRANSFER',
        { stationId: testStation.id },
        'Tactical redeployment for VIP summit protection',
        hrAdmin?.id || ''
      );

      const moveAudit = await prisma.employeeHistory.findFirst({
        where: { employeeId: jackson!.id, changeType: 'STATION_TRANSFER' },
        orderBy: { createdAt: 'desc' },
      });
      assert(!!moveAudit, 'Movement audit record created in EmployeeHistory');
      assert(Boolean(moveAudit?.description.includes('STATION TRANSFER')), 'Movement description details transfer');
    }

    // 7. Employment Type Configs
    console.log('\n--- 7. Employment Type Configurations ---');
    const typeConfigs = await prisma.employmentTypeConfig.findMany();
    assert(typeConfigs.length >= 6, `Found ${typeConfigs.length} employment type configs (>= 6)`);
    const permConfig = typeConfigs.find((t) => t.code === 'PERMANENT');
    assert(permConfig?.hasProbation === true, 'Permanent config specifies probation');

    // 8. HR Command Center & Workforce Analytics
    console.log('\n--- 8. HR Command Center & Workforce Analytics ---');
    const dashboardMetrics = await HRAnalyticsService.getHRDashboardMetrics();
    assert(typeof dashboardMetrics.kpis.totalEmployees === 'number', 'Total employees KPI is numeric');
    assert(dashboardMetrics.kpis.activeEmployees > 0, `Active employees KPI is > 0 (${dashboardMetrics.kpis.activeEmployees})`);
    assert(Array.isArray(dashboardMetrics.departmentDistribution), 'Department distribution is array');
    assert(Array.isArray(dashboardMetrics.stationDistribution), 'Station distribution is array');

    const workforceAnalytics = await HRAnalyticsService.getWorkforceAnalytics();
    assert(workforceAnalytics.workforceTotals.total > 0, 'Workforce totals computed');
    assert(typeof workforceAnalytics.workforceTotals.turnoverRatePercentage === 'number', 'Turnover rate percentage computed safely');
    assert(workforceAnalytics.demographics.gender.MALE !== undefined, 'Gender demographics computed');

    // 9. Employee CSV Import Service
    console.log('\n--- 9. Employee CSV Import & Validation ---');
    const testCSV = `EmployeeNumber,FirstName,LastName,NationalId,Phone,JobTitle,EmploymentType,BasicSalary
CORP-999001,Samuel,Mwangi,33445566,+254712334455,Security Guard,PERMANENT,28000
CORP-999002,Dennis,Kiprono,44556677,+254722445566,Patrol Supervisor,PERMANENT,35000`;

    const preview = await EmployeeImportService.validateAndPreview(testCSV);
    assert(preview.totalRows === 2, `Preview parsed 2 rows (got ${preview.totalRows})`);
    assert(preview.validCount === 2, `Preview marked 2 rows valid (got ${preview.validCount})`);
    assert(preview.errorCount === 0, 'Zero errors in valid test CSV');

    // Test duplicate detection
    const duplicateCSV = `EmployeeNumber,FirstName,LastName,NationalId,Phone,JobTitle,EmploymentType
CORP-000001,Duplicate,Jackson,12345678,+254711000000,Security Guard,PERMANENT`;
    const duplicatePreview = await EmployeeImportService.validateAndPreview(duplicateCSV);
    assert(duplicatePreview.errorCount === 1, 'Duplicate employee number correctly caught as error');
    assert(duplicatePreview.rows[0].errors[0].includes('already exists'), 'Error message identifies existing record');

    // Summary
    console.log('\n=============================================================');
    console.log(`  PHASE 11 VERIFICATION COMPLETE: ${passedTests} Passed, ${failedTests} Failed`);
    console.log('=============================================================\n');

    await prisma.$disconnect();

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error during Phase 11 verification:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

runPhase11Tests();
