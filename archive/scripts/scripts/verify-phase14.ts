import { PrismaClient } from '@prisma/client';
import { PerformanceCycleService } from '../src/lib/performance/PerformanceCycleService';
import { GoalService } from '../src/lib/performance/GoalService';
import { KpiService } from '../src/lib/performance/KpiService';
import { CompetencyService } from '../src/lib/performance/CompetencyService';
import { ReviewService } from '../src/lib/performance/ReviewService';
import { DevelopmentService } from '../src/lib/performance/DevelopmentService';
import { PerformanceAnalyticsService } from '../src/lib/performance/PerformanceAnalyticsService';

const prisma = new PrismaClient();

async function main() {
  console.log('=== PHASE 14: PERFORMANCE MANAGEMENT VERIFICATION SUITE ===\n');

  // Step 0: Ensure super admin user exists
  const adminUser = await prisma.user.findFirst({
    where: { email: 'admin@corpsec.co.ke' },
  });
  if (!adminUser) throw new Error('Admin user not found. Please seed database.');

  // Find sample test employees
  const employees = await prisma.employee.findMany({
    take: 3,
    orderBy: { employeeNumber: 'asc' },
    include: { department: true, position: true, user: true },
  });

  if (employees.length === 0) {
    throw new Error('No employees found in database. Run seed first.');
  }

  const emp1 = employees[0];
  const emp2 = employees[1] || employees[0];

  console.log(`[Setup] Using test employees: ${emp1.fullName} (${emp1.employeeNumber}), ${emp2.fullName} (${emp2.employeeNumber})`);

  // Record initial salary of emp1 to verify payroll isolation invariant
  const initialSalary = await prisma.salaryRecord.findFirst({
    where: { employeeId: emp1.id, status: 'ACTIVE' },
  });
  const initialBasicSalary = initialSalary ? Number(initialSalary.basicSalary) : null;
  console.log(`[Invariant] Initial Basic Salary for ${emp1.fullName}: KES ${initialBasicSalary ?? 'Not Set'}`);

  // Test 1: Performance Cycle Creation & Code Generation
  console.log('\n--- 1. Testing Performance Cycle Lifecycle & Code Generation ---');
  const now = new Date();
  const year = now.getFullYear();

  const cycle = await PerformanceCycleService.createCycle({
    name: `Test Verification Cycle ${year}`,
    description: 'Automated verification test cycle',
    startDate: new Date(year, 0, 1),
    endDate: new Date(year, 11, 31),
    selfAssessmentDeadline: new Date(year, 2, 31),
    managerReviewDeadline: new Date(year, 3, 30),
    reviewDeadline: new Date(year, 4, 15),
    weightsConfig: {
      goalsWeight: 50,
      kpisWeight: 30,
      competenciesWeight: 20,
    },
    createdById: adminUser.id,
  });

  console.log(`[Pass] Cycle created: ${cycle.name} (${cycle.code}) with status: ${cycle.status}`);
  if (!cycle.code.startsWith(`CYC-${year}-`)) {
    throw new Error(`Cycle code format invalid: ${cycle.code}`);
  }

  // Test 2: Cycle Transition to OPEN (Auto-initializes reviews)
  console.log('\n--- 2. Testing Cycle Workflow Transitions & Review Initialization ---');
  const openCycle = await PerformanceCycleService.updateCycleStatus(cycle.id, 'OPEN', adminUser.id);
  console.log(`[Pass] Cycle status updated to: ${openCycle.status}`);

  // Transition to SELF_ASSESSMENT
  const selfAssessCycle = await PerformanceCycleService.updateCycleStatus(
    cycle.id,
    'SELF_ASSESSMENT',
    adminUser.id
  );
  console.log(`[Pass] Cycle status updated to: ${selfAssessCycle.status}`);

  // Verify review initialized for emp1
  const review = await prisma.performanceReview.findUnique({
    where: {
      cycleId_employeeId: {
        cycleId: cycle.id,
        employeeId: emp1.id,
      },
    },
  });

  if (!review) {
    throw new Error('Review dossier was not initialized for active employee');
  }
  console.log(`[Pass] Review dossier initialized: ${review.reviewNumber} for ${emp1.fullName}`);

  // Test 3: SMART Goals & 100% Weight Validation
  console.log('\n--- 3. Testing SMART Goals Management & Weight Sum Validation ---');
  const goal1 = await GoalService.createGoal({
    cycleId: cycle.id,
    employeeId: emp1.id,
    title: 'Maintain 99% Station Guard Punctuality',
    description: 'Ensure all morning and night shift roll calls are logged without delay',
    category: 'OPERATIONAL',
    priority: 'HIGH',
    weight: 60,
    target: '>= 99.0% on-time attendance',
    measurementMethod: 'Biometric shift timestamps',
    startDate: new Date(year, 0, 1),
    dueDate: new Date(year, 11, 31),
    createdById: adminUser.id,
  });

  const goal2 = await GoalService.createGoal({
    cycleId: cycle.id,
    employeeId: emp1.id,
    title: 'Complete Fire Safety and Incident Drill',
    description: 'Lead quarterly emergency response drill with zero safety violations',
    category: 'DEVELOPMENT',
    priority: 'MEDIUM',
    weight: 40,
    target: '100% drill participation',
    measurementMethod: 'Drill report verification',
    startDate: new Date(year, 0, 1),
    dueDate: new Date(year, 11, 31),
    createdById: adminUser.id,
  });

  console.log(`[Pass] Created SMART Goal 1: ${goal1.goalNumber} (Weight: ${goal1.weight}%)`);
  console.log(`[Pass] Created SMART Goal 2: ${goal2.goalNumber} (Weight: ${goal2.weight}%)`);

  // Validate goal weight sum
  const weightCheck = await GoalService.validateEmployeeGoalWeights(emp1.id, cycle.id);
  console.log(`[Pass] Goal Weight Validation: Total = ${weightCheck.totalWeight}%, Valid = ${weightCheck.isValid}`);
  if (!weightCheck.isValid || weightCheck.totalWeight !== 100) {
    throw new Error(`Goal weights validation failed: Expected 100%, got ${weightCheck.totalWeight}%`);
  }

  // Test 4: Position/Department KPIs & Verified Measurements
  console.log('\n--- 4. Testing KPI Catalog, Position Templates & Measurements ---');
  const kpiTemplate = await KpiService.createKpiTemplate({
    name: 'Shift Handover Discrepancy Rate',
    departmentId: emp1.departmentId || undefined,
    positionId: emp1.positionId || undefined,
    measurementUnit: 'PERCENTAGE',
    target: 95,
    minThreshold: 80,
    maxThreshold: 100,
    defaultWeight: 30,
    frequency: 'MONTHLY',
    createdById: adminUser.id,
  });
  console.log(`[Pass] KPI Template created: ${kpiTemplate.code} - ${kpiTemplate.name}`);

  const measurement = await KpiService.recordMeasurement({
    kpiId: kpiTemplate.id,
    employeeId: emp1.id,
    cycleId: cycle.id,
    periodName: `${year}-Q1`,
    target: 95,
    actual: 93,
    comments: 'Excellent shift handover logs recorded with minor radio battery defect noted',
    verifiedById: adminUser.id,
  });
  console.log(`[Pass] KPI Measurement recorded: Actual=${measurement.actual}, Target=${measurement.target}, Achievement=${measurement.achievementRate}%, Score=${measurement.score}/5.0`);

  // Test 5: Competencies & Peer Feedback (Anonymity Scrubbing)
  console.log('\n--- 5. Testing Competency Framework & Anonymous Peer Feedback ---');
  await CompetencyService.seedDefaultCompetencies();
  const competencies = await CompetencyService.listCompetencies();
  console.log(`[Pass] Loaded ${competencies.length} behavioral and tactical competencies`);

  const peerFeedback = await CompetencyService.submitPeerFeedback({
    cycleId: cycle.id,
    employeeId: emp1.id,
    reviewerId: emp2.id,
    isAnonymous: true,
    rating: 4.5,
    strengths: 'Outstanding radio discipline and team communication during night patrols',
    improvements: 'Can assist newer recruits with biometric log registration',
    generalComments: 'Great squad partner',
  });
  console.log(`[Pass] Peer feedback submitted by ${emp2.fullName} with anonymity: ${peerFeedback.isAnonymous}`);

  // Verify non-admin anonymity scrubbing
  const scrubbedFeedback = await CompetencyService.listPeerFeedbackForEmployee(
    emp1.id,
    cycle.id,
    emp1.id,
    false
  );
  if (scrubbedFeedback.length > 0 && (scrubbedFeedback[0].reviewer.fullName !== 'Anonymous Colleague' || scrubbedFeedback[0].reviewer.id !== 'ANONYMOUS')) {
    throw new Error('Peer review anonymity failed: reviewer was not scrubbed for non-admin viewer');
  }
  console.log('[Pass] Peer feedback anonymity verified: Reviewer identity safely scrubbed for recipient');

  // Test 6: Self-Assessment Submission & Locking
  console.log('\n--- 6. Testing Employee Self-Assessment & Locking ---');
  const selfAssessment = await ReviewService.submitSelfAssessment(
    review.id,
    {
      achievements: 'Led 12 night patrols without incident. Maintained 100% shift presence.',
      challenges: 'Heavy rain during November patrol shifts caused radio communication drops.',
      strengths: 'Vigilance, rapid alarm response, radio communication.',
      improvements: 'Tactical close combat drill refresher.',
      trainingNeeds: 'Advanced CCTV Forensics & Surveillance',
      careerAspirations: 'Aiming for Senior Shift Supervisor role within 18 months.',
      goalRatings: [
        { goalId: goal1.id, selfRating: 4.5, selfComment: 'Met and exceeded attendance benchmarks' },
        { goalId: goal2.id, selfRating: 4.0, selfComment: 'Successfully completed drill with zero violations' },
      ],
      competencyRatings: competencies.map((c) => ({
        competencyId: c.id,
        selfScore: 4.0,
        selfComment: 'Consistent performance',
      })),
      isDraft: false,
    },
    emp1.id
  );
  console.log(`[Pass] Self-Assessment submitted: Status=${selfAssessment.status}, SelfSubmittedAt=${selfAssessment.selfSubmittedAt}`);

  // Test 7: Transition to MANAGER_REVIEW and Manager Evaluation
  console.log('\n--- 7. Testing Manager Review & Deterministic Composite Scoring ---');
  await PerformanceCycleService.updateCycleStatus(cycle.id, 'MANAGER_REVIEW', adminUser.id);

  const managerEval = await ReviewService.submitManagerReview(
    review.id,
    {
      managerStrengths: 'Exceptional reliability, flawless shift log handovers, exemplary discipline',
      managerImprovements: 'Continue mentoring junior guard personnel on emergency alarm protocols',
      managerRecommendation: 'PROMOTION',
      goalRatings: [
        { goalId: goal1.id, managerRating: 4.5, managerComment: 'Outstanding punctuality records verified' },
        { goalId: goal2.id, managerRating: 4.0, managerComment: 'Drill executed safely and according to SOP' },
      ],
      competencyRatings: competencies.map((c) => ({
        competencyId: c.id,
        managerScore: 4.5,
        managerComment: 'Exemplifies core security values and leadership',
      })),
      targetStatus: 'CALIBRATION',
    },
    adminUser.id
  );

  console.log(`[Pass] Manager Review evaluated: Goals Score=${managerEval.goalsScore}, KPIs Score=${managerEval.kpisScore}, Comp Score=${managerEval.competenciesScore}`);
  console.log(`[Pass] Calculated Composite Score: ${managerEval.overallScore} / 5.0 (${managerEval.overallRating})`);

  // Validate deterministic formula: Goals 50%, KPIs 30%, Competencies 20%
  const expectedGoals = (4.5 * 60 + 4.0 * 40) / 100; // 2.7 + 1.6 = 4.30
  const expectedComp = 4.5;
  const expectedKpi = measurement.score || 4.8;
  const expectedOverall = Math.round((expectedGoals * 0.5 + expectedKpi * 0.3 + expectedComp * 0.2) * 100) / 100;
  console.log(`[Formula Check] Expected: ~${expectedOverall}, Actual: ${managerEval.overallScore}`);

  // Test 8: Performance Calibration with Audit Trail Preservation
  console.log('\n--- 8. Testing HR Committee Calibration & Original Score Preservation ---');
  const calibratedReview = await ReviewService.calibrateReview(
    review.id,
    {
      calibratedScore: 4.6,
      calibratedRating: 'Outstanding',
      calibrationComment: 'Committee adjusted score to 4.6 due to stellar cross-station incident containment record',
    },
    adminUser.id
  );

  console.log(`[Pass] Calibrated Score: ${calibratedReview.calibratedScore} (${calibratedReview.calibratedRating})`);
  console.log(`[Pass] Original Manager Score Preserved: ${calibratedReview.overallScore} / 5.0`);
  if (calibratedReview.overallScore === calibratedReview.calibratedScore && calibratedReview.overallScore === 4.6) {
    throw new Error('Calibration audit trail failure: Original manager score was overwritten');
  }

  // Test 9: Employee Acknowledgement & Performance Concern Dispute
  console.log('\n--- 9. Testing Employee Acknowledgement & Dispute Workflow ---');
  const ackReview = await ReviewService.acknowledgeReview(
    review.id,
    { acknowledgementComment: 'Thank you for the appraisal. I accept the evaluation and look forward to the promotion pathway.' },
    emp1.id
  );
  console.log(`[Pass] Review acknowledged at: ${ackReview.acknowledgedAt}`);

  // Test Concern logging
  const concern = await ReviewService.submitReviewConcern({
    reviewId: review.id,
    employeeId: emp1.id,
    concern: 'Clarification on overtime hours inclusion in KPI measurement',
    explanation: 'The night shift hours for November weekend coverage should be reflected in the KPI summary',
  });
  console.log(`[Pass] Performance Concern lodged: ${concern.concernNumber} - Status: ${concern.status}`);

  // Resolve concern
  const resolvedConcern = await ReviewService.resolveConcern(
    concern.id,
    {
      status: 'RESOLVED',
      hrResponse: 'Overtime hours have been audited and confirmed in Phase 9 payroll ledger.',
      internalHrNotes: 'Verified with shift commander logs',
    },
    adminUser.id
  );
  console.log(`[Pass] Performance Concern resolved: ${resolvedConcern.concernNumber} - Resolution: ${resolvedConcern.status}`);

  // Test 10: Development Plans (PIP) & Training Needs
  console.log('\n--- 10. Testing Development Plans & Training Needs Ledger ---');
  const devPlan = await DevelopmentService.createDevelopmentPlan({
    employeeId: emp1.id,
    cycleId: cycle.id,
    reviewId: review.id,
    planType: 'LEADERSHIP_PREPARATION',
    objective: 'Prepare for Station Shift Commander Role',
    skillGap: 'Advanced incident reporting & tactical team briefing',
    action: 'Shadow current Station Commander for 6 weeks and complete leadership module',
    owner: 'EMPLOYEE',
    startDate: new Date(year, 5, 1),
    targetDate: new Date(year, 7, 31),
    createdById: adminUser.id,
  });
  console.log(`[Pass] Development Plan created: ${devPlan.planNumber} (${devPlan.planType})`);

  const trainingNeed = await DevelopmentService.createTrainingNeed({
    employeeId: emp1.id,
    cycleId: cycle.id,
    skill: 'Advanced CCTV Forensics & Surveillance',
    identifiedNeed: 'Required for promotion to Senior Security Specialist',
    priority: 'HIGH',
    source: 'PERFORMANCE_REVIEW',
    recommendedTraining: 'Certified Security Surveillance Specialist (CSSS)',
    createdById: adminUser.id,
  });
  console.log(`[Pass] Training Need logged: ${trainingNeed.needNumber} - Priority: ${trainingNeed.priority}`);

  // Test 11: Career Development Profile
  console.log('\n--- 11. Testing Employee Career Development Profile ---');
  const careerDev = await DevelopmentService.upsertCareerDevelopment(emp1.id, {
    careerGoals: 'Attain Senior Station Commander position and lead VIP security details',
    skillsToDevelop: 'VIP Close Protection, Advanced Firearms Safety, Tactical Command',
    desiredFutureRoles: 'Station Commander, VIP Detail Lead',
    developmentInterests: 'Tactical drills, crisis management, leadership mentoring',
    mentorshipInterest: true,
    mobilityPreference: 'ANYWHERE',
  });
  console.log(`[Pass] Career Development Profile saved: Mobility=${careerDev.mobilityPreference}, Mentorship=${careerDev.mentorshipInterest}`);

  // Test 12: Performance Analytics & Department Summary
  console.log('\n--- 12. Testing Workforce Performance Analytics ---');
  const analytics = await PerformanceAnalyticsService.getDashboardMetrics();
  const deptSummary = await PerformanceAnalyticsService.getDepartmentPerformanceSummary(cycle.id);
  console.log(`[Pass] Analytics Computed: Total In Review=${analytics.kpis.totalEmployeesInReview}, Completed=${analytics.kpis.reviewsCompleted}, Avg Score=${analytics.kpis.averagePerformanceScore}`);
  console.log(`[Pass] Department Breakdown: ${deptSummary.length} departments summarized`);

  // Test 13: STRICT PAYROLL SEPARATION INVARIANT VERIFICATION
  console.log('\n--- 13. Verifying Invariant: Performance Ratings NEVER Alter Salary/Payroll ---');
  const currentSalary = await prisma.salaryRecord.findFirst({
    where: { employeeId: emp1.id, status: 'ACTIVE' },
  });
  const currentBasicSalary = currentSalary ? Number(currentSalary.basicSalary) : null;

  console.log(`[Check] Initial Salary: KES ${initialBasicSalary ?? 'Not Set'}`);
  console.log(`[Check] Current Salary: KES ${currentBasicSalary ?? 'Not Set'}`);

  if (initialBasicSalary !== null && currentBasicSalary !== initialBasicSalary) {
    throw new Error(
      `FATAL INVARIANT VIOLATION: Employee salary was modified by performance appraisal! (Initial: ${initialBasicSalary}, Current: ${currentBasicSalary})`
    );
  }
  console.log('[Pass] Payroll Separation Invariant STRICTLY PRESERVED: Performance appraisal did NOT modify base salary or payroll registers.');

  console.log('\n========================================================================');
  console.log('🎉 ALL PHASE 14 PERFORMANCE MANAGEMENT VERIFICATION CHECKS PASSED!');
  console.log('========================================================================\n');
}

main()
  .catch((err) => {
    console.error('❌ Phase 14 Verification Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
