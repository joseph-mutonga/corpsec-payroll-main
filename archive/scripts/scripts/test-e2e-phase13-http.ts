export {};

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3005';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ HTTP ASSERTION FAILED: ${message}`);
    throw new Error(`HTTP Assertion failed: ${message}`);
  }
  console.log(`  ✅ HTTP PASS: ${message}`);
}

async function loginUser(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const cookies = res.headers.get('set-cookie');
  if (!cookies) throw new Error(`Login failed for ${email} - No session cookie received.`);
  return cookies;
}

async function runE2EPhase13() {
  console.log('================================================================');
  console.log('🌐 CORPSEC PHASE 13: RECRUITMENT & ATS HTTP REST E2E TESTS');
  console.log(`🎯 Target API URL: ${BASE_URL}`);
  console.log('================================================================\n');

  let testsPassed = 0;

  // 1. Authenticate Test Personas
  console.log('🔹 1. Authenticating System Test Personas...');
  const hrAdminCookie = await loginUser('hr.admin@corpsec.co.ke', 'HrAdmin@CorpSec2026!');
  const hrManagerCookie = await loginUser('hr.manager@corpsec.co.ke', 'HrManager@CorpSec2026!');
  const guardCookie = await loginUser('jackson.kamau@corpsec.co.ke', 'Employee@CorpSec2026!');

  assert(Boolean(hrAdminCookie && hrManagerCookie && guardCookie), 'Authenticated HR Admin, HR Manager, and Guard Jackson');
  testsPassed++;

  // 2. Public Careers Endpoints (Unauthenticated)
  console.log('\n🔹 2. Testing Public Careers Portal APIs (No Auth Required)...');
  const careersRes = await fetch(`${BASE_URL}/api/careers`);
  assert(careersRes.status === 200, `GET /api/careers returned status 200 (Got: ${careersRes.status})`);
  const careersJson = await careersRes.json();
  assert(careersJson.success && Array.isArray(careersJson.data.vacancies), 'Public vacancies returned successfully');

  const sampleVacancy = careersJson.data.vacancies[0];
  assert(Boolean(sampleVacancy), 'At least one public vacancy available');

  const vacancyDetailRes = await fetch(`${BASE_URL}/api/careers/${sampleVacancy.id}`);
  assert(vacancyDetailRes.status === 200, `GET /api/careers/${sampleVacancy.id} returned status 200`);
  const vacancyDetailJson = await vacancyDetailRes.json();
  assert(vacancyDetailJson.success && vacancyDetailJson.data.vacancy.id === sampleVacancy.id, 'Public vacancy detail resolved');
  testsPassed += 5;

  // 3. Public Candidate Application Submission & Duplicate Detection
  console.log('\n🔹 3. Testing Public Job Application Submission & Validation...');
  const uniqueEmail = `applicant.e2e.${Date.now()}@testcorpsec.co.ke`;

  const applyRes = await fetch(`${BASE_URL}/api/careers/${sampleVacancy.id}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Daniel Mwangi Karanja',
      email: uniqueEmail,
      phone: '+254700998877',
      location: 'Nairobi',
      experienceYears: 3,
      highestQualification: 'Diploma in Criminology & Security Studies',
      coverLetter: 'Dedicated security officer with rapid response background.',
      source: 'CAREERS_PAGE',
    }),
  });

  assert(applyRes.status === 201, `POST /api/careers/[id]/apply returned status 201 (Got: ${applyRes.status})`);
  const applyJson = await applyRes.json();
  assert(applyJson.success && Boolean(applyJson.data.candidate.applicationNumber), 'Application received and reference number generated');
  const candidateId = applyJson.data.candidate.id;

  // Duplicate submission attempt
  const dupApplyRes = await fetch(`${BASE_URL}/api/careers/${sampleVacancy.id}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Daniel Mwangi Karanja',
      email: uniqueEmail,
      phone: '+254700998877',
    }),
  });
  assert(dupApplyRes.status === 400, `Duplicate application rejected with 400 Bad Request (Got: ${dupApplyRes.status})`);
  testsPassed += 3;

  // 4. Authenticated HR Command Center & Vacancy Management APIs
  console.log('\n🔹 4. Testing HR Recruitment Dashboard & Vacancy APIs...');
  const dashRes = await fetch(`${BASE_URL}/api/recruitment/dashboard`, {
    headers: { Cookie: hrAdminCookie },
  });
  assert(dashRes.status === 200, `GET /api/recruitment/dashboard returned status 200`);
  const dashJson = await dashRes.json();
  assert(dashJson.success && dashJson.data.kpis.totalApplications > 0, 'Dashboard KPIs populated with applications');

  // Create new vacancy via API
  const createVacRes = await fetch(`${BASE_URL}/api/recruitment/vacancies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: hrAdminCookie },
    body: JSON.stringify({
      title: 'Control Room CCTV Operator - HTTP E2E Test',
      departmentId: sampleVacancy.department?.id || sampleVacancy.departmentId,
      employmentType: 'PERMANENT',
      openingsCount: 2,
      description: 'Control room surveillance and alarm dispatch test.',
      minSalary: 28000,
      maxSalary: 35000,
      showSalaryPublicly: true,
      status: 'OPEN',
    }),
  });
  assert(createVacRes.status === 201, `POST /api/recruitment/vacancies returned status 201`);
  const createVacJson = await createVacRes.json();
  const createdVacancyId = createVacJson.data.vacancy.id;

  // Duplicate Vacancy via API
  const dupVacRes = await fetch(`${BASE_URL}/api/recruitment/vacancies/${createdVacancyId}/duplicate`, {
    method: 'POST',
    headers: { Cookie: hrAdminCookie },
  });
  assert(dupVacRes.status === 201, `POST /api/recruitment/vacancies/[id]/duplicate returned status 201`);
  testsPassed += 4;

  // 5. Applicant Directory, Screening & Pipeline APIs
  console.log('\n🔹 5. Testing Applicant Directory, Screening & Pipeline APIs...');
  const candDetailRes = await fetch(`${BASE_URL}/api/recruitment/applicants/${candidateId}`, {
    headers: { Cookie: hrAdminCookie },
  });
  assert(candDetailRes.status === 200, `GET /api/recruitment/applicants/[id] returned status 200`);

  // Record Screening
  const screenRes = await fetch(`${BASE_URL}/api/recruitment/screening`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: hrAdminCookie },
    body: JSON.stringify({
      candidateId,
      screeningStatus: 'PASS',
      screeningScore: 88,
      screeningStrengths: 'Extensive control room experience',
      advanceToStage: 'SHORTLISTED',
    }),
  });
  assert(screenRes.status === 200, `POST /api/recruitment/screening returned status 200`);

  // Pipeline Kanban
  const pipelineRes = await fetch(`${BASE_URL}/api/recruitment/pipeline`, {
    headers: { Cookie: hrAdminCookie },
  });
  assert(pipelineRes.status === 200, `GET /api/recruitment/pipeline returned status 200`);
  const pipelineJson = await pipelineRes.json();
  assert(pipelineJson.data.columns.SHORTLISTED.some((c: any) => c.id === candidateId), 'Candidate present in SHORTLISTED pipeline column');

  // Add Internal Recruiter Note
  const noteRes = await fetch(`${BASE_URL}/api/recruitment/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: hrAdminCookie },
    body: JSON.stringify({
      candidateId,
      note: 'Verified candidate certifications with Kenya National Examination Council.',
    }),
  });
  assert(noteRes.status === 201, `POST /api/recruitment/notes returned status 201`);
  testsPassed += 5;

  // 6. Interview Management & Scorecard APIs
  console.log('\n🔹 6. Testing Interview Scheduling & Scorecards APIs...');
  const scheduleRes = await fetch(`${BASE_URL}/api/recruitment/interviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: hrAdminCookie },
    body: JSON.stringify({
      candidateId,
      vacancyId: sampleVacancy.id,
      interviewType: 'PANEL',
      scheduledDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
      startTime: '11:00',
      endTime: '12:00',
      location: 'CorpSec Headquarters, 4th Floor Boardroom',
      notes: 'Final technical and behavioral panel evaluation',
      advanceStage: true,
    }),
  });
  assert(scheduleRes.status === 201, `POST /api/recruitment/interviews returned status 201`);
  const scheduleJson = await scheduleRes.json();
  const interviewId = scheduleJson.data.interview.id;

  // Scorecard evaluation
  const scorecardRes = await fetch(`${BASE_URL}/api/recruitment/interviews/${interviewId}/scorecard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: hrAdminCookie },
    body: JSON.stringify({
      scores: [
        { category: 'COMMUNICATION', score: 5 },
        { category: 'TECHNICAL_SKILLS', score: 4 },
        { category: 'EXPERIENCE', score: 4 },
        { category: 'PROBLEM_SOLVING', score: 5 },
        { category: 'PROFESSIONALISM', score: 5 },
      ],
      overallRecommendation: 'HIRE',
      panelComments: 'Top rank candidate for this position.',
    }),
  });
  assert(scorecardRes.status === 200, `POST /api/recruitment/interviews/[id]/scorecard returned status 200`);

  // Record practical assessment
  const assessRes = await fetch(`${BASE_URL}/api/recruitment/assessments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: hrAdminCookie },
    body: JSON.stringify({
      candidateId,
      assessmentType: 'TECHNICAL',
      title: 'CCTV Control Room Matrix Simulation',
      conductedDate: new Date().toISOString().split('T')[0],
      score: 90,
      maxScore: 100,
      result: 'PASS',
      comments: 'Accurate alarm routing under 30 seconds.',
    }),
  });
  assert(assessRes.status === 201, `POST /api/recruitment/assessments returned status 201`);
  testsPassed += 3;

  // 7. Job Offer Workflow, Approval & Public Token Acceptance
  console.log('\n🔹 7. Testing Job Offer Creation, Approval, and Public Acceptance...');
  const createOfferRes = await fetch(`${BASE_URL}/api/recruitment/offers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: hrAdminCookie },
    body: JSON.stringify({
      candidateId,
      vacancyId: sampleVacancy.id,
      proposedSalary: 32000,
      startDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      offerExpiryDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      employmentType: 'PERMANENT',
    }),
  });
  assert(createOfferRes.status === 201, `POST /api/recruitment/offers returned status 201`);
  const createOfferJson = await createOfferRes.json();
  const offerId = createOfferJson.data.offer.id;
  const secureToken = createOfferJson.data.offer.secureToken;

  // Approve Offer via HR Manager
  const approveOfferRes = await fetch(`${BASE_URL}/api/recruitment/offers/${offerId}/approve`, {
    method: 'POST',
    headers: { Cookie: hrManagerCookie },
  });
  assert(approveOfferRes.status === 200, `POST /api/recruitment/offers/[id]/approve returned status 200`);

  // Dispatch / Send Offer
  const sendOfferRes = await fetch(`${BASE_URL}/api/recruitment/offers/${offerId}/send`, {
    method: 'POST',
    headers: { Cookie: hrAdminCookie },
  });
  assert(sendOfferRes.status === 200, `POST /api/recruitment/offers/[id]/send returned status 200`);

  // Public candidate fetches offer via token
  const publicOfferRes = await fetch(`${BASE_URL}/api/careers/offers/${secureToken}`);
  assert(publicOfferRes.status === 200, `GET /api/careers/offers/[token] returned status 200`);
  const publicOfferJson = await publicOfferRes.json();
  assert(publicOfferJson.data.offer.proposedSalary === 32000, 'Public offer token retrieved correct salary');

  // Candidate accepts offer
  const acceptOfferRes = await fetch(`${BASE_URL}/api/careers/offers/${secureToken}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'ACCEPT' }),
  });
  assert(acceptOfferRes.status === 200, `POST /api/careers/offers/[token]/respond (ACCEPT) returned status 200`);
  testsPassed += 6;

  // 8. Candidate to Employee Conversion & Onboarding Initiation
  console.log('\n🔹 8. Testing Candidate-to-Employee Conversion & Onboarding Initiation API...');
  const hireRes = await fetch(`${BASE_URL}/api/recruitment/hire`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: hrAdminCookie },
    body: JSON.stringify({
      candidateId,
      nationalId: `39${Math.floor(100000 + Math.random() * 900000)}`,
      gender: 'MALE',
      startDate: new Date().toISOString().split('T')[0],
      basicSalary: 32000,
    }),
  });
  assert(hireRes.status === 200, `POST /api/recruitment/hire returned status 200 (Got: ${hireRes.status})`);
  const hireJson = await hireRes.json();
  assert(hireJson.success && hireJson.data.employee.employeeNumber.startsWith('CORP-'), 'Candidate converted to Employee with CORP-XXXXXX number');
  assert(Boolean(hireJson.data.onboardingCase), 'Phase 11 OnboardingCase returned in hire response');
  testsPassed += 3;

  // 9. Recruitment Reports API
  console.log('\n🔹 9. Testing Recruitment Analytics & Reports API...');
  const reportsRes = await fetch(`${BASE_URL}/api/recruitment/reports`, {
    headers: { Cookie: hrAdminCookie },
  });
  assert(reportsRes.status === 200, `GET /api/recruitment/reports returned status 200`);
  const reportsJson = await reportsRes.json();
  assert(reportsJson.success && Array.isArray(reportsJson.data.vacancyPerformance), 'Recruitment report returned vacancy metrics');
  testsPassed += 2;

  // 10. RBAC Security & Data Isolation Enforcement
  console.log('\n🔹 10. Testing RBAC Security & Unauthorized Access Protections...');
  // Guard Jackson attempts to create a vacancy -> 403 Forbidden
  const guardVacRes = await fetch(`${BASE_URL}/api/recruitment/vacancies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: guardCookie },
    body: JSON.stringify({ title: 'Unauthorized Vacancy' }),
  });
  assert(guardVacRes.status === 403, `Guard Jackson blocked from creating vacancy with 403 Forbidden (Got: ${guardVacRes.status})`);

  // Guard Jackson attempts to view recruitment dashboard -> 403 Forbidden
  const guardDashRes = await fetch(`${BASE_URL}/api/recruitment/dashboard`, {
    headers: { Cookie: guardCookie },
  });
  assert(guardDashRes.status === 403, `Guard Jackson blocked from recruitment dashboard with 403 Forbidden (Got: ${guardDashRes.status})`);

  // Guard Jackson attempts to hire -> 403 Forbidden
  const guardHireRes = await fetch(`${BASE_URL}/api/recruitment/hire`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: guardCookie },
    body: JSON.stringify({ candidateId }),
  });
  assert(guardHireRes.status === 403, `Guard Jackson blocked from candidate conversion with 403 Forbidden (Got: ${guardHireRes.status})`);

  // Guard Jackson attempts to create an offer -> 403 Forbidden
  const guardOfferRes = await fetch(`${BASE_URL}/api/recruitment/offers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: guardCookie },
    body: JSON.stringify({ candidateId }),
  });
  assert(guardOfferRes.status === 403, `Guard Jackson blocked from offer creation with 403 Forbidden (Got: ${guardOfferRes.status})`);
  testsPassed += 4;

  console.log('\n================================================================');
  console.log(`🎉 PHASE 13 HTTP REST E2E TESTS COMPLETED: ${testsPassed} PASSED, 0 FAILED`);
  console.log('================================================================\n');
}

runE2EPhase13().catch((err) => {
  console.error('❌ E2E HTTP Test Failure:', err);
  process.exit(1);
});
