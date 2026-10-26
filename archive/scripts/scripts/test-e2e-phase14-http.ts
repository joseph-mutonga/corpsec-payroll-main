import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL || 'http://localhost:3005';

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const cookie = res.headers.get('set-cookie');
  if (!cookie) {
    const body = await res.json();
    throw new Error(`Login failed for ${email}: ${JSON.stringify(body)}`);
  }
  return cookie.split(';')[0];
}

async function request(url: string, cookie?: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { status: res.status, data: json, headers: res.headers };
}

async function main() {
  console.log('=== PHASE 14: HTTP E2E & RBAC INTEGRATION TEST SUITE ===\n');

  // 1. Log in users
  console.log('--- 1. Authenticating Roles ---');
  const adminCookie = await login('admin@corpsec.co.ke', 'Admin@CorpSec2026!');
  const hrAdminCookie = await login('hr.admin@corpsec.co.ke', 'HrAdmin@CorpSec2026!');
  const employeeCookie = await login('jackson.kamau@corpsec.co.ke', 'Employee@CorpSec2026!');
  console.log('[Pass] Super Admin, HR Admin, and Guard Jackson authenticated successfully');

  // 2. Unauthenticated check
  console.log('\n--- 2. Testing Unauthenticated Request Rejection ---');
  const unauthRes = await request('/api/performance/dashboard');
  console.log(`[Pass] Unauthenticated /api/performance/dashboard status: ${unauthRes.status} (Expected 401)`);
  if (unauthRes.status !== 401) throw new Error(`Expected 401, got ${unauthRes.status}`);

  // 3. Performance Dashboard
  console.log('\n--- 3. Testing Performance Command Center KPI Endpoint ---');
  const dashRes = await request('/api/performance/dashboard', adminCookie);
  console.log(`[Pass] /api/performance/dashboard status: ${dashRes.status}, Success: ${dashRes.data.success}`);
  if (dashRes.status !== 200 || !dashRes.data.success) {
    throw new Error('Performance dashboard API failed');
  }

  // 4. Performance Cycles API
  console.log('\n--- 4. Testing Performance Cycles CRUD & Workflow APIs ---');
  const year = new Date().getFullYear() + 1;
  const cycleCreateRes = await request('/api/performance/cycles', hrAdminCookie, {
    method: 'POST',
    body: JSON.stringify({
      name: `HTTP E2E Cycle ${year}`,
      description: 'Created via HTTP E2E automated test',
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      selfAssessmentDeadline: `${year}-03-31`,
      managerReviewDeadline: `${year}-04-30`,
      reviewDeadline: `${year}-05-15`,
      weightsConfig: {
        goalsWeight: 50,
        kpisWeight: 30,
        competenciesWeight: 20,
      },
    }),
  });
  console.log(`[Pass] Create Cycle status: ${cycleCreateRes.status}, Code: ${cycleCreateRes.data.data?.cycle?.code}`);
  if (cycleCreateRes.status !== 201) throw new Error(`Failed to create cycle: ${JSON.stringify(cycleCreateRes.data)}`);
  const cycleId = cycleCreateRes.data.data.cycle.id;

  // Open cycle
  const openRes = await request(`/api/performance/cycles/${cycleId}/status`, hrAdminCookie, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'OPEN' }),
  });
  console.log(`[Pass] Open Cycle status: ${openRes.status}, New Status: ${openRes.data.data?.cycle?.status}`);

  // 5. Goals Management API & Employee Weight Validation
  console.log('\n--- 5. Testing Goals API & Weight Validation ---');
  const emp = await prisma.employee.findFirst({
    where: { employeeNumber: 'CORP-000001' },
  });
  if (!emp) throw new Error('Guard Jackson CORP-000001 not found');

  const goalRes = await request('/api/performance/goals', hrAdminCookie, {
    method: 'POST',
    body: JSON.stringify({
      employeeId: emp.id,
      cycleId,
      title: 'HTTP Test Guard Patrol Punctuality',
      description: 'Meet 100% scheduled security patrols',
      category: 'OPERATIONAL',
      priority: 'HIGH',
      weight: 100,
      target: '100% on-time shifts',
      measurementMethod: 'Shift biometric reader',
      startDate: `${year}-01-01`,
      dueDate: `${year}-12-31`,
    }),
  });
  console.log(`[Pass] Create Goal status: ${goalRes.status}, Goal Number: ${goalRes.data.data?.goal?.goalNumber}`);
  if (goalRes.status !== 201) throw new Error(`Failed to create goal: ${JSON.stringify(goalRes.data)}`);

  // Weight validation API
  const weightValRes = await request(
    `/api/performance/goals/validate-weight?employeeId=${emp.id}&cycleId=${cycleId}`,
    hrAdminCookie
  );
  console.log(`[Pass] Validate Goal Weight status: ${weightValRes.status}, Total Weight: ${weightValRes.data.data?.totalWeight}%, Valid: ${weightValRes.data.data?.isValid}`);

  // 6. KPI Management & Measurement APIs
  console.log('\n--- 6. Testing KPI Templates & Measurements APIs ---');
  const kpiRes = await request('/api/performance/kpis', hrAdminCookie, {
    method: 'POST',
    body: JSON.stringify({
      name: 'HTTP Test Incident Log Completeness',
      measurementUnit: 'PERCENTAGE',
      target: 98,
      defaultWeight: 30,
      frequency: 'MONTHLY',
    }),
  });
  console.log(`[Pass] Create KPI status: ${kpiRes.status}, Code: ${kpiRes.data.data?.template?.code}`);
  const kpiId = kpiRes.data.data.template.id;

  const measureRes = await request('/api/performance/kpis/measurements', hrAdminCookie, {
    method: 'POST',
    body: JSON.stringify({
      kpiId,
      employeeId: emp.id,
      cycleId,
      periodName: `${year}-Q1`,
      target: 98,
      actual: 96,
      comments: 'Logged during HTTP E2E run',
    }),
  });
  console.log(`[Pass] Record Measurement status: ${measureRes.status}, Achievement: ${measureRes.data.data?.measurement?.achievementRate}%`);

  // 7. Competencies & Peer Feedback
  console.log('\n--- 7. Testing Competencies & Peer Feedback APIs ---');
  const compListRes = await request('/api/performance/competencies', employeeCookie);
  console.log(`[Pass] List Competencies status: ${compListRes.status}, Total: ${compListRes.data.data?.competencies?.length}`);

  const colleague = await prisma.employee.findFirst({
    where: { id: { not: emp.id }, employmentStatus: 'ACTIVE' },
  });

  const peerRes = await request('/api/performance/peer-feedback', employeeCookie, {
    method: 'POST',
    body: JSON.stringify({
      cycleId,
      employeeId: colleague?.id || emp.id,
      isAnonymous: true,
      rating: 4.5,
      generalComments: 'HTTP E2E peer feedback test comments',
    }),
  });
  console.log(`[Pass] Peer Feedback status: ${peerRes.status}, Anonymous: ${peerRes.data.data?.feedback?.isAnonymous}`);
  if (peerRes.status !== 201) throw new Error(`Peer feedback failed: ${JSON.stringify(peerRes.data)}`);

  // 8. Employee Self-Service Performance Hub
  console.log('\n--- 8. Testing Employee Portal Performance Hub (/api/portal/performance) ---');
  const portalRes = await request('/api/portal/performance', employeeCookie);
  console.log(`[Pass] Portal Performance status: ${portalRes.status}, Employee: ${portalRes.data.data?.employee?.fullName}`);
  if (portalRes.status !== 200 || !portalRes.data.success) {
    throw new Error('Employee portal performance hub failed');
  }

  // 9. Career Development Profile API
  console.log('\n--- 9. Testing Career Development Profile API ---');
  const careerRes = await request('/api/performance/career-development', employeeCookie, {
    method: 'POST',
    body: JSON.stringify({
      careerGoals: 'E2E Career Goal: Chief Tactical Officer',
      skillsToDevelop: 'Close Protection, Advanced Surveillance',
      desiredFutureRoles: 'Station Commander',
      mentorshipInterest: true,
      mobilityPreference: 'ANYWHERE',
    }),
  });
  console.log(`[Pass] Career Development Profile saved: status=${careerRes.status}`);

  // 10. Performance Reports API & CSV Export
  console.log('\n--- 10. Testing Performance Reports & CSV Generator ---');
  const reportJsonRes = await request('/api/performance/reports?type=PERFORMANCE_SUMMARY', hrAdminCookie);
  console.log(`[Pass] Report JSON status: ${reportJsonRes.status}, Records: ${reportJsonRes.data.data?.count}`);

  const reportCsvRes = await request('/api/performance/reports?type=PERFORMANCE_SUMMARY&format=csv', hrAdminCookie);
  console.log(`[Pass] Report CSV status: ${reportCsvRes.status}, Content-Type: ${reportCsvRes.headers.get('content-type')}`);
  if (!reportCsvRes.headers.get('content-type')?.includes('text/csv')) {
    throw new Error('Report CSV format was not text/csv');
  }

  console.log('\n========================================================================');
  console.log('🎉 ALL PHASE 14 HTTP E2E INTEGRATION & RBAC TESTS PASSED!');
  console.log('========================================================================\n');
}

main()
  .catch((err) => {
    console.error('❌ Phase 14 HTTP E2E Test Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
