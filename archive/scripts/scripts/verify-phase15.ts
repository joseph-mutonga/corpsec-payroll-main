import { db } from '../src/lib/db';
import { CourseService } from '../src/lib/training/CourseService';
import { ProgramService } from '../src/lib/training/ProgramService';
import { VenueService } from '../src/lib/training/VenueService';
import { TrainerService } from '../src/lib/training/TrainerService';
import { SessionService } from '../src/lib/training/SessionService';
import { EnrollmentService } from '../src/lib/training/EnrollmentService';
import { AttendanceService } from '../src/lib/training/AttendanceService';
import { AssessmentService } from '../src/lib/training/AssessmentService';
import { CertificateService } from '../src/lib/training/CertificateService';
import { SkillService } from '../src/lib/training/SkillService';
import { EvaluationService } from '../src/lib/training/EvaluationService';
import { CostBudgetService } from '../src/lib/training/CostBudgetService';
import { TrainingAnalyticsService } from '../src/lib/training/TrainingAnalyticsService';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runPhase15Verification() {
  console.log('\n============================================================');
  console.log('--- RUNNING PHASE 15: TRAINING, LEARNING & DEVELOPMENT VERIFICATION ---');
  console.log('============================================================\n');

  try {
    // 1. Course Categories & Catalog
    console.log('1. Testing Course Categories & Courses Creation...');
    let cat = await db.courseCategory.findUnique({ where: { code: 'TAC' } });
    if (!cat) {
      cat = await CourseService.createCategory({
        name: 'Tactical Firearm & Range Safety',
        code: 'TAC',
        description: 'Tactical shooting, firearm maintenance, and target drills',
      });
    }
    assert(!!cat.id && cat.code === 'TAC', 'Category created with code TAC');

    const course = await CourseService.createCourse({
      title: 'Advanced Firearm Safety & Range Protocols',
      categoryId: cat.id,
      skillArea: 'Firearm Safety',
      level: 'ADVANCED',
      durationHours: 16,
      deliveryMethod: 'PRACTICAL',
      passMark: 80,
      validityMonths: 24,
      isMandatory: true,
      estimatedCostPerPerson: 5000,
      description: 'Comprehensive practical training on safety protocols and target drills.',
    });
    assert(!!course.id && course.code.startsWith('CRS-TAC-'), `Course created with generated code: ${course.code}`);
    assert(course.passMark === 80, 'Course pass mark correctly recorded as 80%');

    // 2. Training Programs
    console.log('\n2. Testing Training Programs...');
    const dept = await db.department.findFirst();
    const program = await ProgramService.createProgram({
      name: '2026 Elite Tactical Security Guard Program',
      departmentId: dept?.id,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-11-30'),
      isMandatory: true,
      status: 'ACTIVE',
      courseIds: [course.id],
      targetAudience: 'Patrol Officers & Armed Escort Units',
    });
    assert(!!program.id && program.programNumber.startsWith('PRG-'), `Program created: ${program.programNumber}`);

    // 3. Training Venues & Capacity
    console.log('\n3. Testing Venues & Capacity Validation...');
    const branch = await db.branch.findFirst();
    const venue = await VenueService.createVenue({
      name: 'Upper Hill Tactical Firing Range',
      branchId: branch?.id,
      capacity: 2, // Small capacity of 2 for testing waitlist
      facilities: 'Soundproof firing booths, electronic targets, safety gear',
    });
    assert(!!venue.id && venue.capacity === 2, 'Venue created with capacity of 2 seats');

    // 4. Trainers (Internal Employee Linkage)
    console.log('\n4. Testing Trainer Registration...');
    const guard = await db.employee.findFirst({ where: { employmentStatus: 'ACTIVE' } });
    if (!guard) throw new Error('No active employee found for testing');

    // Remove existing trainer link if any for clean test
    await db.trainer.deleteMany({ where: { employeeId: guard.id } });

    const trainer = await TrainerService.createTrainer({
      name: guard.fullName,
      type: 'INTERNAL',
      employeeId: guard.id,
      expertise: 'Range Master & Firearm Tactics',
      costPerSession: 15000,
    });
    assert(!!trainer.id && trainer.trainerNumber.startsWith('TRN-T-'), `Internal trainer registered: ${trainer.trainerNumber}`);
    assert(trainer.employeeId === guard.id, 'Internal trainer is correctly linked to existing Employee record');

    // 5. Training Sessions
    console.log('\n5. Testing Session Scheduling & Capacity Validation...');
    const session = await SessionService.createSession({
      courseId: course.id,
      programId: program.id,
      trainerId: trainer.id,
      venueId: venue.id,
      deliveryMethod: 'PRACTICAL',
      startDate: new Date('2026-09-10'),
      endDate: new Date('2026-09-12'),
      startTime: '08:00',
      endTime: '17:00',
      capacity: 2, // Cap at 2
    });
    assert(!!session.id && session.sessionNumber.startsWith('SES-'), `Session scheduled: ${session.sessionNumber}`);

    // 6. Enrollments, Capacity Limit & FIFO Waitlist Promotion
    console.log('\n6. Testing Enrollments, Waitlist, & FIFO Auto-Promotion...');
    const employees = await db.employee.findMany({ take: 3 });
    if (employees.length < 3) throw new Error('Need at least 3 employees for enrollment and waitlist test');

    const emp1 = employees[0];
    const emp2 = employees[1];
    const emp3 = employees[2];

    // Clear prior test enrollments
    await db.trainingEnrollment.deleteMany({ where: { sessionId: session.id } });

    const enr1 = await EnrollmentService.requestEnrollment({
      sessionId: session.id,
      employeeId: emp1.id,
      autoApprove: true,
    });
    assert(enr1.status === 'ENROLLED', `Employee 1 enrolled directly (Seat 1/2): ${enr1.status}`);

    const enr2 = await EnrollmentService.requestEnrollment({
      sessionId: session.id,
      employeeId: emp2.id,
      autoApprove: true,
    });
    assert(enr2.status === 'ENROLLED', `Employee 2 enrolled directly (Seat 2/2, Session Full): ${enr2.status}`);

    const enr3 = await EnrollmentService.requestEnrollment({
      sessionId: session.id,
      employeeId: emp3.id,
      autoApprove: true,
    });
    assert(enr3.status === 'WAITLISTED' && enr3.waitlistPosition === 1, `Employee 3 waitlisted at position 1: ${enr3.status} (pos ${enr3.waitlistPosition})`);

    // Cancel Employee 1 -> Should automatically promote Employee 3 from WAITLISTED to ENROLLED!
    console.log('   Testing FIFO waitlist promotion upon cancellation...');
    await EnrollmentService.cancelEnrollment(enr1.id, { reason: 'Shift conflict' });

    const updatedEnr3 = await db.trainingEnrollment.findUnique({ where: { id: enr3.id } });
    assert(updatedEnr3?.status === 'ENROLLED' && updatedEnr3.waitlistPosition === null, 'FIFO Waitlist Promotion: Employee 3 auto-promoted to ENROLLED');

    // 7. Attendance Recording & Finalization Lock
    console.log('\n7. Testing Attendance Recording & Finalization Lock...');
    const attDate = new Date('2026-09-10');
    attDate.setHours(0, 0, 0, 0);
    const att = await AttendanceService.recordAttendance({
      sessionId: session.id,
      employeeId: emp2.id,
      date: attDate,
      status: 'PRESENT',
      hoursAttended: 8,
      remarks: 'Punctual and fully geared',
    });
    assert(att.status === 'PRESENT' && att.hoursAttended === 8, 'Attendance recorded with 8 hours attended');

    await AttendanceService.finalizeSessionAttendance(session.id, attDate);
    const finalizedAtt = await db.trainingAttendance.findUnique({
      where: { sessionId_employeeId_date: { sessionId: session.id, employeeId: emp2.id, date: attDate } },
    });
    assert(finalizedAtt?.isFinalized === true, 'Attendance successfully finalized and locked');

    // 8. Assessment Scoring Calculation & Pass/Fail Formula
    console.log('\n8. Testing Assessment Scoring Calculation & Pass/Fail...');
    const scorePass = AssessmentService.calculateScore(85, 100, 80);
    assert(scorePass.scorePercentage === 85 && scorePass.result === 'PASS', 'Assessment formula: 85/100 (Pass Mark 80%) yields PASS');

    const scoreFail = AssessmentService.calculateScore(75, 100, 80);
    assert(scoreFail.scorePercentage === 75 && scoreFail.result === 'FAIL', 'Assessment formula: 75/100 (Pass Mark 80%) yields FAIL');

    const asm = await AssessmentService.recordAssessment({
      enrollmentId: enr2.id,
      sessionId: session.id,
      courseId: course.id,
      employeeId: emp2.id,
      assessmentType: 'PRACTICAL',
      obtainedMarks: 90,
      maxMarks: 100,
      passMark: 80,
      evaluatorComments: 'Excellent target grouping and discipline.',
    });
    assert(asm.result === 'PASS' && asm.scorePercentage === 90, `Assessment saved: ${asm.assessmentNumber} (${asm.result})`);

    // 9. Certificate Issuance, Token Generation, & Validity Expiration
    console.log('\n9. Testing Certificate Issuance & Expiration...');
    const cert = await CertificateService.issueCertificate({
      enrollmentId: enr2.id,
    });
    assert(!!cert.id && cert.certificateNumber.startsWith('CERT-'), `Certificate generated: ${cert.certificateNumber}`);
    assert(!!cert.verificationToken && cert.verificationToken.length >= 16, `Cryptographic verification token created: ${cert.verificationToken}`);
    assert(cert.expiryDate !== null, `Expiry date correctly calculated: ${new Date(cert.expiryDate!).toLocaleDateString()}`);

    // 10. Skill Acquisition Trigger on Completion
    console.log('\n10. Testing Automatic Skill Profile Update on Completion...');
    const skills = await SkillService.listEmployeeSkills(emp2.id);
    const hasSkill = skills.some((s) => s.skillName === 'Firearm Safety' && s.level === 'ADVANCED');
    assert(hasSkill, 'Skill "Firearm Safety (ADVANCED)" automatically acquired by employee upon training completion');

    // 11. Public Certificate Verification & Privacy Sanitization
    console.log('\n11. Testing Public Certificate Verification & Privacy Redaction...');
    const verified = await CertificateService.verifyCertificate(cert.certificateNumber);
    assert(verified.isValid === true, 'Certificate verified as valid');
    assert(verified.certificateNumber === cert.certificateNumber, 'Correct certificate number matched');
    assert(verified.recipientName === emp2.fullName, 'Sanitized recipient name included');
    // Ensure no PII leaked
    assert((verified as any).nationalId === undefined, 'Privacy Guard: nationalId is redacted');
    assert((verified as any).phone === undefined, 'Privacy Guard: phone is redacted');
    assert((verified as any).email === undefined, 'Privacy Guard: email is redacted');
    assert((verified as any).basicSalary === undefined, 'Privacy Guard: salary is redacted');

    // 12. Trainee Evaluation & Rating Feedback
    console.log('\n12. Testing Participant Evaluation & Feedback...');
    const evalRecord = await EvaluationService.submitEvaluation({
      enrollmentId: enr2.id,
      relevanceRating: 5,
      trainerRating: 5,
      materialsRating: 4,
      venueRating: 5,
      deliveryRating: 5,
      usefulnessRating: 5,
      comments: 'Outstanding practical range instructions.',
    });
    assert(evalRecord.overallRating === 4.8, `Evaluation calculated overall rating of ${evalRecord.overallRating}/5.0`);

    // 13. Training Costs & Departmental Budget Utilization
    console.log('\n13. Testing Training Costs Ledger & Budget Accounting...');
    if (dept) {
      const budget = await CostBudgetService.setDepartmentBudget({
        budgetPeriod: new Date().getFullYear().toString(),
        departmentId: dept.id,
        allocatedAmount: 1000000,
      });
      assert(budget.allocatedAmount === 1000000, 'Department annual training budget set to KES 1,000,000');

      const cost = await CostBudgetService.recordCost({
        departmentId: dept.id,
        courseId: course.id,
        sessionId: session.id,
        courseFee: 50000,
        trainerFee: 15000,
        venueFee: 20000,
        materialsCost: 10000,
        travelCost: 5000,
      });
      assert(cost.totalCost === 100000, `Itemized training cost logged: KES ${cost.totalCost.toLocaleString()}`);

      const costAnalytics = await CostBudgetService.getCostAnalytics(dept.id);
      assert(costAnalytics.budget.used > 0, `Department budget used updated: KES ${costAnalytics.budget.used.toLocaleString()}`);
      assert(costAnalytics.costPerEmployee > 0, `Cost per employee computed: KES ${costAnalytics.costPerEmployee.toLocaleString()}`);
    }

    // 14. Training Analytics KPIs & Compliance Matrix
    console.log('\n14. Testing Training Analytics & Compliance Matrix...');
    const kpis = await TrainingAnalyticsService.getCommandCenterKpis();
    assert(kpis.activePrograms >= 1, `KPI: Active programs count = ${kpis.activePrograms}`);
    assert(kpis.rates.completionRate >= 0, `KPI: Completion rate = ${kpis.rates.completionRate}%`);

    const complianceMatrix = await TrainingAnalyticsService.getComplianceMatrix();
    assert(complianceMatrix.mandatoryCourses.length >= 1, `Compliance Matrix: ${complianceMatrix.mandatoryCourses.length} mandatory courses tracked`);
    assert(complianceMatrix.employees.length >= 1, `Compliance Matrix: ${complianceMatrix.employees.length} active employees monitored`);

  } catch (error: any) {
    console.error('Fatal Verification Error:', error);
    failed++;
  }

  console.log('\n============================================================');
  console.log(`--- PHASE 15 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED ---`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase15Verification();
