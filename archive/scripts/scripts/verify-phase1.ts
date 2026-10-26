import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { hasPermission, hasRole } from '../src/lib/permissions';

const prisma = new PrismaClient();

async function runPhase1Verification() {
  console.log('=====================================================');
  console.log('🛡️  CORPSEC HR PAYROLL — PHASE 1 FOUNDATION VERIFIER');
  console.log('=====================================================\n');

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
    // 1. Database Connectivity & Entity Tests
    console.log('1. DATABASE SCHEMA & ENTITY CHECKS');
    const userCount = await prisma.user.count();
    assert(userCount >= 5, `Database connected and contains ${userCount} seed users`);

    const roleCount = await prisma.role.count();
    assert(roleCount === 6, `All 6 required roles seeded (found: ${roleCount})`);

    const permCount = await prisma.permission.count();
    assert(permCount >= 25, `Permissions matrix seeded (found: ${permCount} permissions)`);

    const branchCount = await prisma.branch.count();
    assert(branchCount >= 3, `At least 3 Kenyan branches seeded (found: ${branchCount})`);

    const deptCount = await prisma.department.count();
    assert(deptCount >= 4, `At least 4 organizational departments seeded (found: ${deptCount})`);

    const stationCount = await prisma.station.count();
    assert(stationCount >= 3, `At least 3 guarding stations seeded (found: ${stationCount})`);

    // 2. Kenyan Company Settings Verification
    console.log('\n2. KENYAN COMPANY SETTINGS & STATUTORY LOCALIZATION');
    const settings = await prisma.companySetting.findFirst();
    assert(settings !== null, 'Company settings record exists');
    assert(settings?.country === 'Kenya', `Country is set to "${settings?.country}" (Kenya)`);
    assert(settings?.defaultCurrency === 'KES', `Default currency is set to "${settings?.defaultCurrency}" (KES)`);
    assert(settings?.timezone === 'Africa/Nairobi', `Timezone is set to "${settings?.timezone}" (Africa/Nairobi)`);
    assert(settings?.kraPin === 'P051234567Z', `KRA PIN correctly stored as "${settings?.kraPin}"`);

    // 3. Authentication & Password Hashing Verification
    console.log('\n3. AUTHENTICATION & PASSWORD SECURITY');
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@corpsec.co.ke' },
      include: { userRoles: { include: { role: true } } },
    });
    assert(adminUser !== null, 'Super Admin user exists');
    
    const validPassword = await bcrypt.compare('Admin@CorpSec2026!', adminUser!.passwordHash);
    assert(validPassword === true, 'Admin password hashes and verifies with bcrypt salt=12');

    const invalidPassword = await bcrypt.compare('WrongPassword123!', adminUser!.passwordHash);
    assert(invalidPassword === false, 'Invalid password rejected by bcrypt verification');

    // 4. Role-Based Access Control (RBAC) Logic
    console.log('\n4. RBAC & PERMISSION RESOLUTION CHECKS');
    const superAdminSession = {
      userId: adminUser!.id,
      email: adminUser!.email,
      firstName: adminUser!.firstName,
      lastName: adminUser!.lastName,
      roles: ['super_admin'],
      permissions: ['*'],
      isActive: true,
    };

    const hrAdminSession = {
      userId: 'test_hr_user',
      email: 'hr.admin@corpsec.co.ke',
      firstName: 'Grace',
      lastName: 'Wanjiku',
      roles: ['hr_admin'],
      permissions: ['employee.view', 'employee.create', 'branches.manage', 'settings.view'],
      isActive: true,
    };

    const employeeSession = {
      userId: 'test_emp_user',
      email: 'employee@corpsec.co.ke',
      firstName: 'Guard',
      lastName: 'Otieno',
      roles: ['employee'],
      permissions: ['leave.create', 'leave.view'],
      isActive: true,
    };

    assert(hasPermission(superAdminSession, 'settings.manage'), 'Super admin has access to settings.manage');
    assert(hasPermission(superAdminSession, 'payroll.approve'), 'Super admin has access to payroll.approve');
    assert(hasPermission(hrAdminSession, 'branches.manage'), 'HR Admin has access to branches.manage');
    assert(!hasPermission(hrAdminSession, 'settings.manage'), 'HR Admin DENIED settings.manage (restricted to Super Admin)');
    assert(!hasPermission(employeeSession, 'branches.manage'), 'Employee DENIED branches.manage');
    assert(hasPermission(employeeSession, 'leave.create'), 'Employee granted leave.create');

    // 5. Inactive User Handling
    const inactiveSession = {
      ...employeeSession,
      isActive: false,
    };
    assert(!hasPermission(inactiveSession, 'leave.create'), 'Inactive user account DENIED all permissions');

    // 6. Audit Trail Logging Verification
    console.log('\n5. AUDIT LOGGING & DATA SANITIZATION');
    const initialLog = await prisma.auditLog.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    assert(initialLog !== null, 'Initial database bootstrap audit log recorded');
    assert(initialLog?.action === 'SYSTEM_INITIALIZATION', `Audit action is "${initialLog?.action}"`);
    assert(
      !initialLog?.newValue?.includes('password') && !initialLog?.newValue?.includes('secret'),
      'Audit log payload does not contain plaintext secrets'
    );

    console.log('\n=====================================================');
    console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('=====================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Verification encountered an error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase1Verification();
