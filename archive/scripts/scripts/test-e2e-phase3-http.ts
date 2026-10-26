// Phase 3 HTTP Integration & End-to-End Test Suite
export {};

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3005';

async function runHttpE2ETests() {
  console.log(`🚀 Starting Phase 3 Live HTTP Integration Tests against ${BASE_URL}...\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  try {
    // 1. Authenticate HR Admin
    console.log('--- 1. Authentication ---');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'hr.admin@corpsec.co.ke',
        password: 'HrAdmin@CorpSec2026!',
      }),
    });

    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && loginData.success, 'HR Admin logs in successfully');
    const cookieHeader = loginRes.headers.get('set-cookie') || '';
    assert(cookieHeader.includes('corpsec_session'), 'Session cookie is generated');

    const authHeaders = {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    };

    // 2. Test Branches API
    console.log('\n--- 2. Branches API ---');
    const branchesGetRes = await fetch(`${BASE_URL}/api/branches`, { headers: authHeaders });
    const branchesGetData = await branchesGetRes.json();
    assert(branchesGetRes.status === 200 && branchesGetData.success, 'GET /api/branches returns 200');
    assert(Array.isArray(branchesGetData.data) && branchesGetData.data.length >= 3, 'Returns list of branches');

    // Create New Branch: Eldoret Branch
    const testBranchCode = `BR-ELD-${Date.now().toString().slice(-4)}`;
    const createBranchRes = await fetch(`${BASE_URL}/api/branches`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        code: testBranchCode,
        name: 'Eldoret Rift Regional Branch',
        location: 'Uganda Road, Eldoret',
        county: 'Uasin Gishu',
        townCity: 'Eldoret',
        physicalAddress: 'KVDA Plaza, 5th Floor',
        phone: '+254711900100',
        email: 'eldoret@corpsec.co.ke',
        isActive: true,
      }),
    });
    const createBranchData = await createBranchRes.json();
    assert(createBranchRes.status === 201 && createBranchData.success, `POST /api/branches creates ${testBranchCode}`);
    const createdBranchId = createBranchData.data.id;

    // Get Branch Profile
    const getBranchRes = await fetch(`${BASE_URL}/api/branches/${createdBranchId}`, { headers: authHeaders });
    const getBranchData = await getBranchRes.json();
    assert(getBranchRes.status === 200 && getBranchData.data.code === testBranchCode, 'GET /api/branches/:id returns branch profile');

    // 3. Test Departments API
    console.log('\n--- 3. Departments API ---');
    const deptGetRes = await fetch(`${BASE_URL}/api/departments`, { headers: authHeaders });
    const deptGetData = await deptGetRes.json();
    assert(deptGetRes.status === 200 && deptGetData.success, 'GET /api/departments returns 200');

    // Create New Department: K9 Dog Handling Division
    const testDeptCode = `K9-SEC-${Date.now().toString().slice(-4)}`;
    const createDeptRes = await fetch(`${BASE_URL}/api/departments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        code: testDeptCode,
        name: 'K9 Dog Handling & Explosives Detection',
        description: 'Canine patrol, sniffing, and high-risk perimeter searches',
        branchId: createdBranchId,
        isActive: true,
      }),
    });
    const createDeptData = await createDeptRes.json();
    assert(createDeptRes.status === 201 && createDeptData.success, `POST /api/departments creates ${testDeptCode}`);
    const createdDeptId = createDeptData.data.id;

    // 4. Test Job Positions API
    console.log('\n--- 4. Job Positions API ---');
    const posGetRes = await fetch(`${BASE_URL}/api/positions`, { headers: authHeaders });
    const posGetData = await posGetRes.json();
    assert(posGetRes.status === 200 && posGetData.success, 'GET /api/positions returns 200');

    // Create New Job Position: K9 Handler Specialist
    const testPosCode = `POS-K9-${Date.now().toString().slice(-4)}`;
    const createPosRes = await fetch(`${BASE_URL}/api/positions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        code: testPosCode,
        title: 'K9 Canine Handler Specialist',
        description: 'Handler for patrol dogs and explosive detection canines',
        departmentId: createdDeptId,
        employmentCategory: 'SECURITY_GUARD',
        isActive: true,
      }),
    });
    const createPosData = await createPosRes.json();
    assert(createPosRes.status === 201 && createPosData.success, `POST /api/positions creates ${testPosCode}`);
    const createdPosId = createPosData.data.id;

    // 5. Test Guarding Stations API & Shortage Calculations
    console.log('\n--- 5. Guarding Stations API ---');
    const stationGetRes = await fetch(`${BASE_URL}/api/stations`, { headers: authHeaders });
    const stationGetData = await stationGetRes.json();
    assert(stationGetRes.status === 200 && stationGetData.success, 'GET /api/stations returns 200');
    assert(stationGetData.data.some((s: any) => typeof s.staffingDifference === 'number'), 'Stations calculate dynamic staffing difference');

    // Create New Guarding Station
    const testStationCode = `STN-ELD-${Date.now().toString().slice(-4)}`;
    const createStationRes = await fetch(`${BASE_URL}/api/stations`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        code: testStationCode,
        name: 'Eldoret International Airport Logistics Zone',
        clientLocationName: 'Cargo Logistics Terminal',
        physicalLocation: 'Airport Rd, Eldoret',
        county: 'Uasin Gishu',
        townCity: 'Eldoret',
        branchId: createdBranchId,
        requiredStaffing: 8,
        isActive: true,
      }),
    });
    const createStationData = await createStationRes.json();
    assert(createStationRes.status === 201 && createStationData.success, `POST /api/stations creates ${testStationCode}`);
    const createdStationId = createStationData.data.id;

    // 6. Test Employee Onboarding with Organization Links
    console.log('\n--- 6. Employee Onboarding with Org References ---');
    const testNatId = `${Math.floor(10000000 + Math.random() * 89999999)}`;
    const createEmpRes = await fetch(`${BASE_URL}/api/employees`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        firstName: 'Nicholas',
        middleName: 'Rotich',
        lastName: 'Kibet',
        nationalId: testNatId,
        gender: 'MALE',
        maritalStatus: 'SINGLE',
        primaryPhone: '0711556677',
        email: `nicholas.kibet.${Date.now()}@corpsec.co.ke`,
        employmentDate: '2023-05-01',
        employmentType: 'PERMANENT',
        jobTitle: 'K9 Canine Handler Specialist',
        positionId: createdPosId,
        departmentId: createdDeptId,
        branchId: createdBranchId,
        stationId: createdStationId,
        employmentStatus: 'ACTIVE',
      }),
    });
    const createEmpData = await createEmpRes.json();
    assert(createEmpRes.status === 201 && createEmpData.success, 'POST /api/employees creates employee with position & initial assignment');
    const createdEmpId = createEmpData.data.id;

    // Check Assignment History
    const asgRes = await fetch(`${BASE_URL}/api/employees/${createdEmpId}/assignments`, { headers: authHeaders });
    const asgData = await asgRes.json();
    assert(asgRes.status === 200 && asgData.data.assignments.length >= 1, 'GET /api/employees/:id/assignments lists initial active assignment');

    // 7. Test Anti-Self Supervision Integrity
    console.log('\n--- 7. Transfer Workflow & Integrity Validation ---');
    const selfSupervisionRes = await fetch(`${BASE_URL}/api/employees/${createdEmpId}/transfer`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        branchId: createdBranchId,
        departmentId: createdDeptId,
        stationId: createdStationId,
        positionId: createdPosId,
        supervisorId: createdEmpId, // Self supervision!
        effectiveDate: '2026-08-15',
        reason: 'Attempt self supervision',
      }),
    });
    const selfSupData = await selfSupervisionRes.json();
    assert(selfSupervisionRes.status === 400 && !selfSupData.success, 'Transfer rejects self-supervision attempt');

    // 8. Test Successful Transfer
    const nairobiBranch = branchesGetData.data.find((b: any) => b.code === 'HQ-NRB');
    const nairobiDept = deptGetData.data.find((d: any) => d.code === 'SEC-OPS');
    const nairobiStation = stationGetData.data.find((s: any) => s.code === 'STN-CBD01');

    const validTransferRes = await fetch(`${BASE_URL}/api/employees/${createdEmpId}/transfer`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        branchId: nairobiBranch.id,
        departmentId: nairobiDept.id,
        stationId: nairobiStation.id,
        effectiveDate: '2026-08-15',
        reason: 'Promoted and transferred to Nairobi CBD Central Station',
      }),
    });
    const validTransferData = await validTransferRes.json();
    assert(validTransferRes.status === 200 && validTransferData.success, 'POST /api/employees/:id/transfer executes valid transfer');

    // Verify Assignment History has 2 records
    const postTransferAsgRes = await fetch(`${BASE_URL}/api/employees/${createdEmpId}/assignments`, { headers: authHeaders });
    const postTransferAsgData = await postTransferAsgRes.json();
    const asgs = postTransferAsgData.data.assignments;
    assert(asgs.length === 2, 'Employee now has exactly 2 assignments');
    assert(asgs[0].status === 'ACTIVE' && asgs[0].branchId === nairobiBranch.id, 'Newest assignment is ACTIVE in Nairobi HQ');
    assert(asgs[1].status === 'TRANSFERRED', 'Previous assignment is closed with status TRANSFERRED');

    // 9. Test Dashboard Statistics with Phase 3 Metrics
    console.log('\n--- 8. Dashboard Statistics API ---');
    const dashRes = await fetch(`${BASE_URL}/api/dashboard/stats`, { headers: authHeaders });
    const dashData = await dashRes.json();
    assert(dashRes.status === 200 && dashData.success, 'GET /api/dashboard/stats returns 200');
    assert(dashData.data.foundationMetrics.totalBranches >= 4, 'Dashboard reports accurate total branches');
    assert(dashData.data.foundationMetrics.totalDepartments >= 5, 'Dashboard reports accurate total departments');
    assert(dashData.data.foundationMetrics.totalStations >= 4, 'Dashboard reports accurate total stations');
    assert(dashData.data.foundationMetrics.totalPositions >= 9, 'Dashboard reports accurate total positions');
    assert(typeof dashData.data.employeeMetrics.guardingShortage === 'number', 'Dashboard reports live guard shortage calculation');

    console.log(`\n========================================`);
    console.log(`📊 Phase 3 Live HTTP Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('HTTP Test error:', error);
    process.exit(1);
  }
}

runHttpE2ETests();
