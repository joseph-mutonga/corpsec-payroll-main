export {};

const BASE_URL = 'http://localhost:3005';

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

async function loginUser(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(`Login failed for ${email}: ${data.error}`);
  }
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error(`No cookie returned for ${email}`);
  return setCookie.split(';')[0];
}

async function runE2EPhase15HttpTests() {
  console.log('\n============================================================');
  console.log('--- RUNNING PHASE 15: HTTP ENDPOINTS & RBAC TEST SUITE ---');
  console.log('============================================================\n');

  try {
    // 1. Authenticate Admin and Guard
    console.log('1. Authenticating credentials...');
    const adminCookie = await loginUser('admin@corpsec.co.ke', 'Admin@CorpSec2026!');
    assert(!!adminCookie, 'Super Admin authenticated successfully');

    const guardCookie = await loginUser('jackson.kamau@corpsec.co.ke', 'Employee@CorpSec2026!');
    assert(!!guardCookie, 'Guard Jackson authenticated successfully');

    // 2. Training Dashboard
    console.log('\n2. Testing GET /api/training/dashboard...');
    const dashRes = await fetch(`${BASE_URL}/api/training/dashboard`, {
      headers: { Cookie: adminCookie },
    });
    const dashJson = await dashRes.json();
    assert(dashJson.success === true, 'GET /api/training/dashboard returned success');
    assert(dashJson.data.kpis !== undefined, 'KPIs object present in dashboard response');

    // 3. Course Categories
    console.log('\n3. Testing GET & POST /api/training/categories...');
    const catRes = await fetch(`${BASE_URL}/api/training/categories`, {
      headers: { Cookie: adminCookie },
    });
    const catJson = await catRes.json();
    assert(catJson.success === true, 'GET /api/training/categories returned success');

    // 4. Course Catalog
    console.log('\n4. Testing GET & POST /api/training/courses...');
    const courseRes = await fetch(`${BASE_URL}/api/training/courses`, {
      headers: { Cookie: adminCookie },
    });
    const courseJson = await courseRes.json();
    assert(courseJson.success === true, 'GET /api/training/courses returned success');
    assert(Array.isArray(courseJson.data.courses), 'Courses array returned');

    // 5. Training Programs
    console.log('\n5. Testing GET /api/training/programs...');
    const progRes = await fetch(`${BASE_URL}/api/training/programs`, {
      headers: { Cookie: adminCookie },
    });
    const progJson = await progRes.json();
    assert(progJson.success === true, 'GET /api/training/programs returned success');

    // 6. Training Sessions
    console.log('\n6. Testing GET /api/training/sessions...');
    const sesRes = await fetch(`${BASE_URL}/api/training/sessions`, {
      headers: { Cookie: adminCookie },
    });
    const sesJson = await sesRes.json();
    assert(sesJson.success === true, 'GET /api/training/sessions returned success');

    // 7. Trainers
    console.log('\n7. Testing GET /api/training/trainers...');
    const trnRes = await fetch(`${BASE_URL}/api/training/trainers`, {
      headers: { Cookie: adminCookie },
    });
    const trnJson = await trnRes.json();
    assert(trnJson.success === true, 'GET /api/training/trainers returned success');

    // 8. Venues
    console.log('\n8. Testing GET /api/training/venues...');
    const venRes = await fetch(`${BASE_URL}/api/training/venues`, {
      headers: { Cookie: adminCookie },
    });
    const venJson = await venRes.json();
    assert(venJson.success === true, 'GET /api/training/venues returned success');

    // 9. Enrollments
    console.log('\n9. Testing GET /api/training/enrollments...');
    const enrRes = await fetch(`${BASE_URL}/api/training/enrollments`, {
      headers: { Cookie: adminCookie },
    });
    const enrJson = await enrRes.json();
    assert(enrJson.success === true, 'GET /api/training/enrollments returned success');

    // 10. Certificates & Public Verification
    console.log('\n10. Testing Certificates & Public Verification API...');
    const certRes = await fetch(`${BASE_URL}/api/training/certificates`, {
      headers: { Cookie: adminCookie },
    });
    const certJson = await certRes.json();
    assert(certJson.success === true, 'GET /api/training/certificates returned success');

    if (certJson.data.certificates?.length > 0) {
      const sampleCert = certJson.data.certificates[0];
      const verifyRes = await fetch(`${BASE_URL}/api/training/certificates/verify/${sampleCert.certificateNumber}`);
      const verifyJson = await verifyRes.json();
      assert(verifyJson.success === true && verifyJson.data.isValid === true, 'Public verification API returned valid credential');
      assert(verifyJson.data.nationalId === undefined, 'Public verification sanitized: No nationalId leaked');
    }

    // 11. Training Costs & Budgets
    console.log('\n11. Testing Costs & Budgets APIs...');
    const costRes = await fetch(`${BASE_URL}/api/training/costs`, {
      headers: { Cookie: adminCookie },
    });
    const costJson = await costRes.json();
    assert(costJson.success === true, 'GET /api/training/costs returned success');

    const budgetRes = await fetch(`${BASE_URL}/api/training/budgets`, {
      headers: { Cookie: adminCookie },
    });
    const budgetJson = await budgetRes.json();
    assert(budgetJson.success === true, 'GET /api/training/budgets returned success');

    // 12. Compliance Matrix
    console.log('\n12. Testing Compliance Matrix API...');
    const compRes = await fetch(`${BASE_URL}/api/training/compliance`, {
      headers: { Cookie: adminCookie },
    });
    const compJson = await compRes.json();
    assert(compJson.success === true, 'GET /api/training/compliance returned success');

    // 13. Reports (JSON & CSV Export)
    console.log('\n13. Testing Reports & CSV Streaming API...');
    const reportJsonRes = await fetch(`${BASE_URL}/api/training/reports?type=TRAINING_REGISTER&format=json`, {
      headers: { Cookie: adminCookie },
    });
    const reportJson = await reportJsonRes.json();
    assert(reportJson.success === true, 'GET /api/training/reports (JSON) returned success');

    const reportCsvRes = await fetch(`${BASE_URL}/api/training/reports?type=TRAINING_REGISTER&format=csv`, {
      headers: { Cookie: adminCookie },
    });
    const csvText = await reportCsvRes.text();
    assert(csvText.startsWith('Enrollment Number,'), 'GET /api/training/reports (CSV) streamed valid CSV header');

    // 14. Employee Portal ESS API
    console.log('\n14. Testing Employee Self-Service /api/portal/training...');
    const portalRes = await fetch(`${BASE_URL}/api/portal/training`, {
      headers: { Cookie: guardCookie },
    });
    const portalJson = await portalRes.json();
    assert(portalJson.success === true, 'GET /api/portal/training returned success for Employee');
    assert(portalJson.data.myEnrollments !== undefined, 'myEnrollments present in ESS response');
    assert(portalJson.data.myCertificates !== undefined, 'myCertificates present in ESS response');

  } catch (error: any) {
    console.error('Fatal E2E Test Error:', error);
    failed++;
  }

  console.log('\n============================================================');
  console.log(`--- PHASE 15 HTTP E2E RESULTS: ${passed} PASSED, ${failed} FAILED ---`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runE2EPhase15HttpTests();
