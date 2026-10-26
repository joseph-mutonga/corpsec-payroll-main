import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function runPhase3Verification() {
  console.log('🧪 Starting Phase 3 (Organization, Branches & Stations) Database Verification...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  try {
    // 1. Verify Seeded Branches
    console.log('--- 1. Branches Verification ---');
    const branches = await db.branch.findMany({
      include: { branchManager: true, _count: { select: { stations: true, employees: true } } },
    });
    assert(branches.length >= 3, 'At least 3 operating branches exist');
    const nairobiBranch = branches.find((b) => b.code === 'HQ-NRB');
    assert(!!nairobiBranch, 'Nairobi HQ branch exists (HQ-NRB)');
    assert(nairobiBranch?.branchManagerId !== null, 'Nairobi HQ has an assigned Branch Manager');

    // 2. Verify Seeded Departments
    console.log('\n--- 2. Departments Verification ---');
    const departments = await db.department.findMany({
      include: { departmentHead: true, positions: true, _count: { select: { employees: true } } },
    });
    assert(departments.length >= 4, 'At least 4 corporate departments exist');
    const opsDept = departments.find((d) => d.code === 'SEC-OPS');
    assert(!!opsDept, 'Security Operations department exists (SEC-OPS)');
    assert(opsDept?.departmentHeadId !== null, 'Security Operations has an appointed Department Head');
    assert((opsDept?.positions.length ?? 0) >= 3, 'Security Operations has linked job positions');

    // 3. Verify Job Positions
    console.log('\n--- 3. Job Positions Verification ---');
    const positions = await db.position.findMany({
      include: { department: true, _count: { select: { employees: true } } },
    });
    assert(positions.length >= 8, 'At least 8 standard job positions exist');
    const guardPos = positions.find((p) => p.code === 'POS-SEC-GD');
    assert(guardPos?.employmentCategory === 'SECURITY_GUARD', 'POS-SEC-GD category is SECURITY_GUARD');
    assert(guardPos?.departmentId === opsDept?.id, 'POS-SEC-GD belongs to Security Operations department');

    // 4. Verify Stations & Staffing Calculations
    console.log('\n--- 4. Stations & Quotas Verification ---');
    const stations = await db.station.findMany({
      include: {
        supervisor: true,
        branch: true,
        _count: { select: { employees: { where: { deletedAt: null, isArchived: false, employmentStatus: 'ACTIVE' } } } },
      },
    });
    assert(stations.length >= 3, 'At least 3 guarding stations exist');
    const cbdStation = stations.find((s) => s.code === 'STN-CBD01');
    assert(!!cbdStation, 'Nairobi CBD Station exists (STN-CBD01)');
    assert(cbdStation?.requiredStaffing === 20, 'STN-CBD01 required staffing quota is 20');
    assert(cbdStation?.supervisorId !== null, 'STN-CBD01 has an assigned Station Supervisor');

    const currentStaffing = cbdStation?._count.employees ?? 0;
    const diff = (cbdStation?.requiredStaffing ?? 0) - currentStaffing;
    console.log(`     * STN-CBD01 Required: ${cbdStation?.requiredStaffing}, Current: ${currentStaffing}, Shortage: ${diff}`);
    assert(diff > 0, 'Station correctly computes staffing shortage/deficit when under quota');

    // 5. Verify Employee Assignments
    console.log('\n--- 5. Active Employee Assignments Verification ---');
    const activeAssignments = await db.employeeAssignment.findMany({
      where: { status: 'ACTIVE' },
      include: { employee: true, branch: true, station: true, position: true },
    });
    assert(activeAssignments.length >= 5, 'All seeded employees have active initial assignments');

    // 6. Test Controlled Transfer Workflow
    console.log('\n--- 6. Controlled Employee Transfer Workflow Test ---');
    const testEmployee = await db.employee.findFirst({
      where: { employeeNumber: 'CORP-000003' },
      include: { branch: true, station: true },
    });
    assert(!!testEmployee, 'Test employee (CORP-000003 - Amina Mwatela) exists');

    const targetBranch = branches.find((b) => b.code === 'BR-MSA')!;
    const targetDept = opsDept!;
    const msaStation = stations.find((s) => s.code === 'STN-PRT01')!;

    // Perform atomic transfer
    const transferDate = new Date();
    await db.$transaction(async (tx) => {
      // 1. Close current assignment
      await tx.employeeAssignment.updateMany({
        where: { employeeId: testEmployee!.id, status: 'ACTIVE' },
        data: { endDate: transferDate, status: 'TRANSFERRED' },
      });

      // 2. Create new active assignment
      await tx.employeeAssignment.create({
        data: {
          employeeId: testEmployee!.id,
          branchId: targetBranch.id,
          departmentId: targetDept.id,
          stationId: msaStation.id,
          positionId: testEmployee!.positionId,
          jobTitle: testEmployee!.jobTitle,
          startDate: transferDate,
          status: 'ACTIVE',
          reason: 'Test transfer to Mombasa port post',
        },
      });

      // 3. Update employee pointers
      await tx.employee.update({
        where: { id: testEmployee!.id },
        data: {
          branchId: targetBranch.id,
          departmentId: targetDept.id,
          stationId: msaStation.id,
        },
      });
    });

    const updatedEmpAssignments = await db.employeeAssignment.findMany({
      where: { employeeId: testEmployee!.id },
      orderBy: { startDate: 'desc' },
    });
    assert(updatedEmpAssignments.length >= 2, 'Employee now has 2 assignment records (1 transferred, 1 active)');
    assert(updatedEmpAssignments[0].status === 'ACTIVE', 'Latest assignment is ACTIVE');
    assert(updatedEmpAssignments[0].branchId === targetBranch.id, 'Latest assignment branch is Mombasa (BR-MSA)');
    assert(updatedEmpAssignments[1].status === 'TRANSFERRED', 'Previous assignment status is TRANSFERRED');
    assert(updatedEmpAssignments[1].endDate !== null, 'Previous assignment has closed endDate');

    // 7. Verify Permissions
    console.log('\n--- 7. RBAC Permissions Verification ---');
    const phase3Perms = await db.permission.findMany({
      where: {
        name: {
          in: [
            'branches.view',
            'branches.create',
            'departments.view',
            'stations.view',
            'positions.view',
            'assignment.transfer',
          ],
        },
      },
    });
    assert(phase3Perms.length === 6, 'All Phase 3 permissions are present in the database');

    console.log(`\n========================================`);
    console.log(`📊 Phase 3 Database Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Verification error:', error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

runPhase3Verification();
