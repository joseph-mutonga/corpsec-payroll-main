import { PrismaClient } from '@prisma/client';
import { VacancyService } from '../src/lib/recruitment/VacancyService';
import { CandidateService } from '../src/lib/recruitment/CandidateService';
import { InterviewService } from '../src/lib/recruitment/InterviewService';
import { OfferService } from '../src/lib/recruitment/OfferService';
import { HiringService } from '../src/lib/recruitment/HiringService';
import { RecruitmentAnalyticsService } from '../src/lib/recruitment/RecruitmentAnalyticsService';

const prisma = new PrismaClient();

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ PASS: ${message}`);
}

async function runPhase13Verification() {
  console.log('================================================================');
  console.log('🚀 CORPSEC PHASE 13: RECRUITMENT & APPLICANT TRACKING (ATS) TESTS');
  console.log('================================================================\n');

  let testsPassed = 0;

  // 1. Database Seed & Context Check
  console.log('🔹 1. Checking Database Core Entities for Recruitment Context...');
  const opsDept = await prisma.department.findFirst({ where: { code: 'SEC-OPS' } });
  const hrDept = await prisma.department.findFirst({ where: { code: 'HR-ADM' } });
  const hrAdminUser = await prisma.user.findFirst({ where: { email: 'hr.admin@corpsec.co.ke' } });
  const hrManagerUser = await prisma.user.findFirst({ where: { email: 'hr.manager@corpsec.co.ke' } });

  assert(Boolean(opsDept && hrDept), 'Operations and HR Departments found in database');
  assert(Boolean(hrAdminUser && hrManagerUser), 'HR Admin and HR Manager users exist');
  testsPassed += 2;

  // 2. Vacancy Management Lifecycle
  console.log('\n🔹 2. Testing Vacancy Numbering, Lifecycle & Status Transitions...');
  const vacancyNum1 = await VacancyService.generateVacancyNumber();
  assert(vacancyNum1.startsWith('VAC-'), `Vacancy numbering format matches VAC-YYYY-XXXX (Got: ${vacancyNum1})`);

  const createdVacancy = await VacancyService.createVacancy(
    {
      title: 'Tactical Canine Handler - Phase 13 Test',
      departmentId: opsDept!.id,
      employmentType: 'PERMANENT',
      openingsCount: 3,
      description: 'Tactical canine security patrol test.',
      responsibilities: '- Canine perimeter patrol\n- Scent tracking',
      requirements: '- NYS / K-9 security certification',
      minSalary: 30000,
      maxSalary: 38000,
      showSalaryPublicly: false,
      applicationDeadline: new Date(Date.now() + 10 * 86400000),
      status: 'DRAFT',
    },
    hrAdminUser!.id
  );

  assert(createdVacancy.status === 'DRAFT', 'Created vacancy initial status is DRAFT');
  assert(createdVacancy.openingsCount === 3, 'Openings count persisted correctly');

  // Publish Vacancy
  const published = await VacancyService.updateVacancy(createdVacancy.id, { status: 'OPEN' }, hrAdminUser!.id);
  assert(published.status === 'OPEN' && Boolean(published.publishedAt), 'Vacancy published to OPEN with publishedAt timestamp');

  // Pause Vacancy
  const paused = await VacancyService.updateVacancy(createdVacancy.id, { status: 'PAUSED' }, hrAdminUser!.id);
  assert(paused.status === 'PAUSED', 'Vacancy transitioned to PAUSED');

  // Re-open Vacancy
  const reopened = await VacancyService.updateVacancy(createdVacancy.id, { status: 'OPEN' }, hrAdminUser!.id);
  assert(reopened.status === 'OPEN', 'Vacancy successfully re-opened');

  // Duplicate Vacancy
  const duplicated = await VacancyService.duplicateVacancy(createdVacancy.id, hrAdminUser!.id);
  assert(duplicated.status === 'DRAFT', 'Duplicated vacancy created as new DRAFT');
  assert(duplicated.vacancyNumber !== createdVacancy.vacancyNumber, 'Duplicated vacancy received a new unique number');
  testsPassed += 7;

  // 3. Public Careers Isolation & Privacy Masking
  console.log('\n🔹 3. Testing Public Careers Portal Filtering & Privacy Data Masking...');
  const publicVacancies = await VacancyService.getPublicVacancies();
  assert(Array.isArray(publicVacancies), 'Public vacancies returned as array');
  assert(publicVacancies.every((v) => v.showSalaryPublicly || (v.minSalary === null && v.maxSalary === null)),
    'Confidential salary ranges are masked for public callers when showSalaryPublicly is false'
  );

  const publicDetail = await VacancyService.getPublicVacancyDetail(createdVacancy.id);
  assert(Boolean(publicDetail), 'Public vacancy detail resolved for active OPEN vacancy');
  assert(publicDetail?.minSalary === null, 'Private salary masked in public vacancy detail');
  testsPassed += 4;

  // 4. Candidate Job Application & Validations
  console.log('\n🔹 4. Testing Candidate Job Application Ingestion & Validation...');
  const appNumber = await CandidateService.generateApplicationNumber();
  assert(appNumber.startsWith('CORPSEC-APP-'), `Application reference formatted as CORPSEC-APP-YYYY-XXXXXX (Got: ${appNumber})`);

  const testCandEmail = `erick.sang.test.${Date.now()}@corpsec.co.ke`;
  const candidate1 = await CandidateService.submitApplication({
    vacancyId: createdVacancy.id,
    fullName: 'Erick Kipkemboi Sang',
    email: testCandEmail,
    phone: '+254711223344',
    location: 'Nairobi, Westlands',
    currentOccupation: 'Canine Handler',
    experienceYears: 4,
    highestQualification: 'Canine Security Specialist Certificate',
    skills: 'K-9 Handling, Patrols, Defensive Tactics',
    coverLetter: 'Applying with 4 years specialized dog handler experience.',
    source: 'CAREERS_PAGE',
  });

  assert(candidate1.currentStage === 'APPLIED', 'Candidate initial stage is APPLIED');
  assert(candidate1.screeningStatus === 'PENDING', 'Candidate initial screening status is PENDING');

  // Test duplicate application prevention
  let duplicateBlocked = false;
  try {
    await CandidateService.submitApplication({
      vacancyId: createdVacancy.id,
      fullName: 'Erick Kipkemboi Sang',
      email: testCandEmail,
      phone: '+254711223344',
    });
  } catch (e: any) {
    duplicateBlocked = true;
  }
  assert(duplicateBlocked, 'Duplicate application with same email to same vacancy is strictly blocked');
  testsPassed += 4;

  // 5. Stage Transitions & Immutable Audit History
  console.log('\n🔹 5. Testing Pipeline Stage Transitions & Immutable History Logging...');
  const stageUpdated = await CandidateService.updateCandidateStage(
    candidate1.id,
    'SCREENING',
    'Application met initial criteria',
    hrAdminUser!.id
  );

  assert(stageUpdated.currentStage === 'SCREENING', 'Candidate moved to SCREENING stage');

  const history = await prisma.candidateStageHistory.findMany({
    where: { candidateId: candidate1.id },
    orderBy: { createdAt: 'asc' },
  });

  assert(history.length >= 2, `Stage history ledger has ${history.length} records (APPLIED -> SCREENING)`);
  assert(history[history.length - 1].toStage === 'SCREENING', 'Last stage history recorded toStage: SCREENING');
  testsPassed += 3;

  // 6. Application Screening & Shortlisting
  console.log('\n🔹 6. Testing Application Screening & Shortlist Scoring...');
  const screened = await CandidateService.recordScreening(
    {
      candidateId: candidate1.id,
      screeningStatus: 'PASS',
      screeningScore: 92,
      screeningStrengths: 'Certified K-9 security trainer, exceptional physical fitness',
      screeningWeaknesses: 'None identified',
      screeningNotes: 'Highly recommended for tactical unit deployment',
      advanceToStage: 'SHORTLISTED',
    },
    hrAdminUser!.id
  );

  assert(screened.screeningStatus === 'PASS', 'Screening status updated to PASS');
  assert(screened.screeningScore === 92, 'Screening score recorded as 92/100');
  assert(screened.currentStage === 'SHORTLISTED', 'Candidate stage advanced to SHORTLISTED');
  testsPassed += 3;

  // 7. Internal Recruiter Notes & Communications Log
  console.log('\n🔹 7. Testing Internal Recruiter Confidential Notes & Communication Logging...');
  const internalNote = await CandidateService.addInternalNote(
    candidate1.id,
    'CONFIDENTIAL: Background check with previous guarding firm verified positive conduct.',
    hrAdminUser!.id
  );
  assert(Boolean(internalNote.id), 'Internal confidential recruiter note saved');

  const commLog = await CandidateService.addCommunication(
    candidate1.id,
    'PHONE',
    'Pre-interview Screening Call',
    'Confirmed availability for panel interview next week.',
    hrAdminUser!.id
  );
  assert(commLog.type === 'PHONE', 'Candidate communication log recorded');
  testsPassed += 2;

  // 8. Interview Scheduling, Panels & Scorecards
  console.log('\n🔹 8. Testing Interview Scheduling, Panel Assignment & Multi-Category Scorecards...');
  const interview = await InterviewService.scheduleInterview(
    {
      candidateId: candidate1.id,
      vacancyId: createdVacancy.id,
      interviewType: 'PANEL',
      scheduledDate: new Date(Date.now() + 2 * 86400000),
      startTime: '14:00',
      endTime: '15:00',
      location: 'CorpSec K-9 Training Center, Industrial Area',
      notes: 'Canine handling tactical drill and scenario assessment',
      panelMemberIds: [{ interviewerId: hrManagerUser!.id, role: 'Lead Evaluator' }],
      advanceStage: true,
    },
    hrAdminUser!.id
  );

  assert(interview.status === 'SCHEDULED', 'Interview scheduled with status SCHEDULED');
  assert(interview.panelMembers.length === 1, 'Interview panel member assigned');

  // Verify candidate stage auto-advanced to INTERVIEW
  const candAfterInterview = await dbCandidate(candidate1.id);
  assert(candAfterInterview?.currentStage === 'INTERVIEW', 'Candidate stage auto-advanced to INTERVIEW');

  // Submit Scorecard
  const scorecardResult = await InterviewService.submitScorecard(
    {
      interviewId: interview.id,
      interviewerId: hrManagerUser!.id,
      scores: [
        { category: 'COMMUNICATION', score: 4, comment: 'Clear and concise' },
        { category: 'TECHNICAL_SKILLS', score: 5, comment: 'Expert canine handler' },
        { category: 'EXPERIENCE', score: 5, comment: '4 years relevant security work' },
        { category: 'PROBLEM_SOLVING', score: 4, comment: 'Calm under simulation pressure' },
        { category: 'PROFESSIONALISM', score: 5, comment: 'High discipline and alertness' },
      ],
      overallRecommendation: 'HIRE',
      panelComments: 'Strongest candidate for the canine unit opening.',
    },
    hrManagerUser!.id
  );

  assert(scorecardResult.averageScore === 4.6, `Computed scorecard average score is 4.6/5 (Got: ${scorecardResult.averageScore})`);
  assert(scorecardResult.recommendation === 'HIRE', 'Panel recommendation recorded as HIRE');
  testsPassed += 5;

  // 9. Candidate Assessment Recording
  console.log('\n🔹 9. Testing Candidate Practical Assessment Recording...');
  const assessment = await InterviewService.recordAssessment(
    {
      candidateId: candidate1.id,
      assessmentType: 'PRACTICAL',
      title: 'Canine Obstacle & Scent Tracking Practical Drill',
      conductedDate: new Date(),
      score: 95,
      maxScore: 100,
      result: 'PASS',
      comments: 'Successfully identified decoy scent in under 45 seconds.',
    },
    hrAdminUser!.id
  );

  assert(assessment.result === 'PASS', 'Assessment result recorded as PASS');
  assert(assessment.score === 95, 'Assessment score recorded as 95/100');
  testsPassed += 2;

  // 10. Job Offer Management, Approval & Secure Token Acceptance
  console.log('\n🔹 10. Testing Job Offer Creation, Approval Workflow & Public Token Acceptance...');
  const offer = await OfferService.createOffer(
    {
      candidateId: candidate1.id,
      vacancyId: createdVacancy.id,
      proposedSalary: 36000,
      startDate: new Date(Date.now() + 14 * 86400000),
      offerExpiryDate: new Date(Date.now() + 7 * 86400000),
      employmentType: 'PERMANENT',
    },
    hrAdminUser!.id
  );

  assert(offer.status === 'DRAFT', 'Job offer drafted in status DRAFT');
  assert(Boolean(offer.secureToken), 'Cryptographically secure public token generated');

  // Approve Offer
  const approvedOffer = await OfferService.approveOffer(offer.id, hrManagerUser!.id);
  assert(approvedOffer.status === 'APPROVED' && Boolean(approvedOffer.approvedAt), 'Job offer approved by HR Manager');

  // Send Offer
  const sentOffer = await OfferService.sendOffer(offer.id, hrAdminUser!.id);
  assert(sentOffer.status === 'SENT', 'Job offer transitioned to SENT');

  // Candidate accesses offer via token
  const retrievedOffer = await OfferService.getOfferBySecureToken(offer.secureToken);
  assert(retrievedOffer.proposedSalary === 36000, 'Candidate retrieves correct proposed salary via token');
  assert(retrievedOffer.candidateName === 'Erick Kipkemboi Sang', 'Candidate name matched correctly');

  // Candidate accepts offer via secure token
  const acceptedOffer = await OfferService.respondToOffer(offer.secureToken, 'ACCEPT');
  assert(acceptedOffer.status === 'ACCEPTED', 'Job offer status transitioned to ACCEPTED');
  assert(acceptedOffer.candidateResponse === 'ACCEPTED', 'Candidate response logged as ACCEPTED');
  testsPassed += 8;

  // 11. Candidate to Employee Conversion & Phase 11 Onboarding Integration
  console.log('\n🔹 11. Testing Candidate-to-Employee Conversion & Onboarding Automation...');
  const testNationalId = `39${Math.floor(100000 + Math.random() * 900000)}`;

  const hireResult = await HiringService.convertCandidateToEmployee(
    {
      candidateId: candidate1.id,
      nationalId: testNationalId,
      gender: 'MALE',
      startDate: new Date(),
      basicSalary: 36000,
    },
    hrAdminUser!.id
  );

  assert(hireResult.success, 'Hiring conversion returned success: true');
  assert(hireResult.employee.employeeNumber.startsWith('CORP-'), `Created new employee with number ${hireResult.employee.employeeNumber}`);
  assert(hireResult.employee.fullName === 'Erick Kipkemboi Sang', 'Employee master record matches candidate full name');
  assert(hireResult.employee.employmentStatus === 'ACTIVE', 'Employee employmentStatus is ACTIVE');

  // Verify salary record
  const salaryRecord = await prisma.salaryRecord.findFirst({
    where: { employeeId: hireResult.employee.id, status: 'ACTIVE' },
  });
  assert(Boolean(salaryRecord && salaryRecord.basicSalary === 36000), 'Active SalaryRecord created with basic salary KES 36,000');

  // Verify candidate record updated
  const candHired = await dbCandidate(candidate1.id);
  assert(candHired?.currentStage === 'HIRED', 'Candidate currentStage updated to HIRED');
  assert(candHired?.employeeId === hireResult.employee.id, 'Candidate employeeId links to created Employee');

  // Verify Phase 11 Onboarding integration
  const onboardingCase = await prisma.onboardingCase.findUnique({
    where: { employeeId: hireResult.employee.id },
    include: { tasks: true },
  });
  assert(Boolean(onboardingCase), 'Phase 11 OnboardingCase automatically initiated for new hire');
  assert((onboardingCase?.tasks.length || 0) >= 8, `OnboardingCase has ${onboardingCase?.tasks.length} default induction tasks`);

  // Verify duplicate conversion prevention
  let dupConversionBlocked = false;
  try {
    await HiringService.convertCandidateToEmployee(
      {
        candidateId: candidate1.id,
        nationalId: testNationalId,
        gender: 'MALE',
      },
      hrAdminUser!.id
    );
  } catch (e: any) {
    dupConversionBlocked = true;
  }
  assert(dupConversionBlocked, 'Duplicate conversion of already hired candidate is strictly blocked');
  testsPassed += 9;

  // 12. Recruitment Analytics & Reports
  console.log('\n🔹 12. Testing Recruitment Analytics & Funnel Calculations...');
  const stats = await RecruitmentAnalyticsService.getDashboardStats();
  assert(stats.kpis.totalApplications > 0, `Total applications count is positive (${stats.kpis.totalApplications})`);
  assert(Array.isArray(stats.funnel) && stats.funnel.length === 8, 'Funnel has all 8 recruitment stages');

  const report = await RecruitmentAnalyticsService.getRecruitmentReports();
  assert(Array.isArray(report.vacancyPerformance), 'Vacancy performance metrics computed');
  assert(Array.isArray(report.sourceAnalysis), 'Source attribution analysis computed');
  assert(typeof report.avgDaysToHire === 'number', `Average days to hire computed (${report.avgDaysToHire} days)`);
  testsPassed += 5;

  console.log('\n================================================================');
  console.log(`📊 PHASE 13 VERIFICATION RESULTS: ${testsPassed} PASSED, 0 FAILED`);
  console.log('================================================================\n');

  await prisma.$disconnect();
}

async function dbCandidate(id: string) {
  return prisma.candidate.findUnique({ where: { id } });
}

runPhase13Verification().catch((e) => {
  console.error('❌ Phase 13 verification error:', e);
  process.exit(1);
});
