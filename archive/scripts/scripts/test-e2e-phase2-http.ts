async function testE2EPhase2() {
  const BASE_URL = 'http://localhost:3005';
  console.log('🌐 Testing live HTTP endpoints for Phase 2 Employee Management on', BASE_URL);

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, msg: string) => {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  };

  try {
    // 1. HR Admin Login
    console.log('\n--- 1. Authenticate as HR Admin ---');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'hr.admin@corpsec.co.ke',
        password: 'HrAdmin@CorpSec2026!',
      }),
    });

    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && loginData.success, 'HR Admin authentication successful');

    const cookieHeader = loginRes.headers.get('set-cookie');
    const authCookie = cookieHeader ? cookieHeader.split(';')[0] : '';
    assert(authCookie.length > 0, 'Received valid HTTP-only session cookie');

    const headers = {
      Cookie: authCookie,
      'Content-Type': 'application/json',
    };

    // 2. Fetch Dashboard Metrics with Real Headcount
    console.log('\n--- 2. Dashboard Headcount Metrics ---');
    const dashRes = await fetch(`${BASE_URL}/api/dashboard/stats`, { headers });
    const dashData = await dashRes.json();
    assert(dashRes.status === 200 && dashData.success, 'Dashboard stats API returns 200 OK');
    assert(dashData.data.employeeMetrics.totalEmployees >= 6, `Real employee headcount returned (Total: ${dashData.data.employeeMetrics.totalEmployees})`);
    assert(dashData.data.employeeMetrics.departments.length > 0, 'Department headcount breakdown returned');
    assert(dashData.data.employeeMetrics.branches.length > 0, 'Branch headcount breakdown returned');

    // 3. Query Employee Directory List with Multi-Criteria Filters
    console.log('\n--- 3. Employee Directory Query & Filters ---');
    const empListRes = await fetch(`${BASE_URL}/api/employees?status=ACTIVE&search=Jackson`, { headers });
    const empListData = await empListRes.json();
    assert(empListRes.status === 200 && empListData.success, 'Employee list query returns 200 OK');
    assert(empListData.data.length >= 1, 'Jackson Kamau found in active search query');
    assert(empListData.data[0].employeeNumber === 'CORP-000001', 'Jackson Kamau has correct employee number');

    const jacksonId = empListData.data[0].id;

    // 4. Query Full Employee Profile with Masked / Unmasked Field Checking
    console.log('\n--- 4. Full Employee Profile & Field Verification ---');
    const profileRes = await fetch(`${BASE_URL}/api/employees/${jacksonId}`, { headers });
    const profileData = await profileRes.json();
    assert(profileRes.status === 200 && profileData.success, 'Employee profile endpoint returns 200 OK');
    assert(profileData.data.canViewSensitive === true, 'HR Admin has permission to view sensitive payment data');
    assert(profileData.data.department !== null, 'Department relationship populated');
    assert(profileData.data.station !== null, 'Station relationship populated');
    assert(profileData.data.history.length > 0, 'Career timeline history populated');

    // 5. Create a New Employee via API
    console.log('\n--- 5. Onboard New Employee via POST /api/employees ---');
    const newEmpPayload = {
      firstName: 'Denis',
      middleName: 'Kipkoech',
      lastName: 'Rotich',
      nationalId: `${Math.floor(10000000 + Math.random() * 89999999)}`,
      dateOfBirth: '1995-03-22',
      gender: 'MALE',
      maritalStatus: 'SINGLE',
      nationality: 'Kenyan',
      primaryPhone: '0719888777', // Will test Kenyan phone normalization
      email: `denis.rotich.${Date.now()}@corpsec.co.ke`,
      jobTitle: 'Night Patrol Specialist',
      employmentType: 'PERMANENT',
      employmentStatus: 'ACTIVE',
      employmentDate: '2026-08-01',
      preferredPaymentMethod: 'MPESA',
      mpesaPhoneNumber: '0719888777',
      kraPin: 'A019283746L',
      nextOfKin: [
        {
          fullName: 'Mercy Chebet',
          relationship: 'SPOUSE',
          primaryPhone: '0722114455',
          percentageShare: 100,
        },
      ],
      emergencyContacts: [
        {
          fullName: 'Mercy Chebet',
          relationship: 'SPOUSE',
          primaryPhone: '0722114455',
        },
      ],
    };

    const createRes = await fetch(`${BASE_URL}/api/employees`, {
      method: 'POST',
      headers,
      body: JSON.stringify(newEmpPayload),
    });

    const createData = await createRes.json();
    assert(createRes.status === 201 && createData.success, 'New employee created with HTTP 201 Created');
    assert(/^CORP-\d{6}$/.test(createData.data.employeeNumber), `Assigned valid sequence employee number (${createData.data.employeeNumber})`);
    assert(createData.data.primaryPhone === '+254719888777', 'Normalized primary phone to +254719888777');

    const newEmpId = createData.data.id;

    // 6. Transition Employment Status
    console.log('\n--- 6. Transition Employment Status ---');
    const statusRes = await fetch(`${BASE_URL}/api/employees/${newEmpId}/status`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        status: 'ON_LEAVE',
        reason: 'Authorized 14-day leave',
      }),
    });

    const statusData = await statusRes.json();
    assert(statusRes.status === 200 && statusData.success, 'Status transition returns HTTP 200 OK');
    assert(statusData.data.employee.employmentStatus === 'ON_LEAVE', 'Employment status is now ON_LEAVE');

    // 7. Test Export CSV
    console.log('\n--- 7. Export Employee CSV ---');
    const exportRes = await fetch(`${BASE_URL}/api/employees/export`, { headers });
    assert(exportRes.status === 200, 'Export CSV returns HTTP 200 OK');
    const csvText = await exportRes.text();
    assert(csvText.includes('Employee Number') && csvText.includes('Jackson Kariuki Kamau'), 'CSV contains proper headers and records');

    // 8. Archive and Restore Employee
    console.log('\n--- 8. Archive and Restore Employee ---');
    const archiveRes = await fetch(`${BASE_URL}/api/employees/${newEmpId}/archive`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'Temporary contract pause' }),
    });
    const archiveData = await archiveRes.json();
    assert(archiveRes.status === 200 && archiveData.success, 'Employee archived successfully');
    assert(archiveData.data.employee.isArchived === true, 'isArchived flag set to true');

    const restoreRes = await fetch(`${BASE_URL}/api/employees/${newEmpId}/restore`, {
      method: 'POST',
      headers,
    });
    const restoreData = await restoreRes.json();
    assert(restoreRes.status === 200 && restoreData.success, 'Employee restored from archive successfully');
    assert(restoreData.data.employee.isArchived === false, 'isArchived flag reset to false');

    // 9. Document Repository Global Query
    console.log('\n--- 9. Global Document Repository ---');
    const docRepoRes = await fetch(`${BASE_URL}/api/documents`, { headers });
    const docRepoData = await docRepoRes.json();
    assert(docRepoRes.status === 200 && docRepoData.success, 'Global document repository returns HTTP 200 OK');

    console.log('\n========================================================');
    console.log(`🌐 Live HTTP Verification: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Live HTTP verification error:', err);
    process.exit(1);
  }
}

testE2EPhase2();
