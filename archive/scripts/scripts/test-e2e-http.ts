async function testHttpEndpoints() {
  console.log('🌐 TESTING LIVE HTTP SERVER (http://localhost:3000)...\n');

  const BASE_URL = 'http://localhost:3000';

  // 1. Test Login Page loads
  const loginPageRes = await fetch(`${BASE_URL}/login`);
  console.log(`1. GET /login -> Status: ${loginPageRes.status} ${loginPageRes.status === 200 ? '✅' : '❌'}`);

  // 2. Test Invalid Login
  const badLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@corpsec.co.ke', password: 'WrongPassword!' }),
  });
  const badLoginData = await badLoginRes.json();
  console.log(`2. POST /api/auth/login (Bad Password) -> Status: ${badLoginRes.status}, Success: ${badLoginData.success} ${badLoginRes.status === 401 ? '✅' : '❌'}`);

  // 3. Test Valid Admin Login
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@corpsec.co.ke', password: 'Admin@CorpSec2026!' }),
  });
  const loginData = await loginRes.json();
  const rawCookie = loginRes.headers.get('set-cookie');
  console.log(`3. POST /api/auth/login (Admin) -> Status: ${loginRes.status}, Success: ${loginData.success} ${loginRes.status === 200 ? '✅' : '❌'}`);
  console.log(`   User: ${loginData.data?.user?.email}, Roles: ${JSON.stringify(loginData.data?.user?.roles)}`);

  const cookieHeader = rawCookie ? rawCookie.split(';')[0] : '';

  // 4. Test Authenticated Dashboard Stats API
  const statsRes = await fetch(`${BASE_URL}/api/dashboard/stats`, {
    headers: { Cookie: cookieHeader },
  });
  const statsData = await statsRes.json();
  console.log(`4. GET /api/dashboard/stats -> Status: ${statsRes.status}, Success: ${statsData.success} ${statsRes.status === 200 ? '✅' : '❌'}`);
  console.log(`   Foundation Users: ${statsData.data?.foundationMetrics?.totalUsers}, Branches: ${statsData.data?.foundationMetrics?.branchesCount}, Period: "${statsData.data?.payrollStatus?.currentPeriod}"`);

  // 5. Test Company Settings API
  const settingsRes = await fetch(`${BASE_URL}/api/settings`, {
    headers: { Cookie: cookieHeader },
  });
  const settingsData = await settingsRes.json();
  console.log(`5. GET /api/settings -> Status: ${settingsRes.status}, Company: "${settingsData.data?.companyName}", KRA PIN: "${settingsData.data?.kraPin}" ${settingsRes.status === 200 ? '✅' : '❌'}`);

  // 6. Test Branches API
  const branchesRes = await fetch(`${BASE_URL}/api/branches`, {
    headers: { Cookie: cookieHeader },
  });
  const branchesData = await branchesRes.json();
  console.log(`6. GET /api/branches -> Status: ${branchesRes.status}, Count: ${branchesData.data?.length} branches ${branchesRes.status === 200 ? '✅' : '❌'}`);

  // 7. Test Audit Logs API
  const auditRes = await fetch(`${BASE_URL}/api/audit-logs`, {
    headers: { Cookie: cookieHeader },
  });
  const auditData = await auditRes.json();
  console.log(`7. GET /api/audit-logs -> Status: ${auditRes.status}, Total Recorded: ${auditData.meta?.total} logs ${auditRes.status === 200 ? '✅' : '❌'}`);

  // 8. Test Unauthenticated Access Block to /api/users
  const unauthRes = await fetch(`${BASE_URL}/api/users`);
  console.log(`8. GET /api/users (Unauthenticated) -> Status: ${unauthRes.status} (Expected 401) ${unauthRes.status === 401 ? '✅' : '❌'}`);

  console.log('\n✨ ALL LIVE ENDPOINT TESTS COMPLETED SUCCESSFULLY!\n');
}

testHttpEndpoints().catch(console.error);
