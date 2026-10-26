import { PrismaClient } from '@prisma/client';
import {
  normalizeKenyanPhone,
  isValidKenyanPhone,
  generateNextEmployeeNumber,
  maskSensitiveNumber,
  maskMpesaPhone,
  sanitizeEmployeeForView,
} from '../src/lib/employee-utils';

const prisma = new PrismaClient();

async function runTests() {
  console.log('🧪 ========================================================');
  console.log('🧪 CorpSec HR Payroll — Phase 2 Automated Verification Suite');
  console.log('🧪 ========================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string) => {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  };

  try {
    // Test 1: Phone Normalization & Validation
    console.log('--- Test Suite 1: Kenyan Phone Normalization & Validation ---');
    assert(normalizeKenyanPhone('0712345678') === '+254712345678', '0712345678 normalized to +254712345678');
    assert(normalizeKenyanPhone('0111223344') === '+254111223344', '0111223344 normalized to +254111223344');
    assert(normalizeKenyanPhone('+254722001122') === '+254722001122', '+254722001122 stays untouched');
    assert(normalizeKenyanPhone('254733445566') === '+254733445566', '254733445566 prefixed with +');
    assert(isValidKenyanPhone('0712345678'), '0712345678 is valid Kenyan mobile phone');
    assert(isValidKenyanPhone('0110001122'), '0110001122 (Airtel 01x) is valid Kenyan phone');
    assert(!isValidKenyanPhone('020123456'), '020 landline fails mobile validation');

    // Test 2: Sensitive Payment Masking
    console.log('\n--- Test Suite 2: Sensitive Payment Masking ---');
    assert(maskSensitiveNumber('1104892841') === '****2841', 'Bank account 1104892841 masked to ****2841');
    assert(maskSensitiveNumber('123') === '****', 'Short account number masked to ****');
    assert(maskMpesaPhone('+254712345678') === '+254***5678', 'M-Pesa phone +254712345678 masked to +254***5678');

    // Test 3: Auto Employee Number Generator
    console.log('\n--- Test Suite 3: Sequential Employee Number Generation ---');
    const nextNum = await generateNextEmployeeNumber('CORP-');
    assert(/^CORP-\d{6}$/.test(nextNum), `Generated format is valid (Got: ${nextNum})`);

    // Test 4: Database Seed Integrity & Relations
    console.log('\n--- Test Suite 4: Database Seed Integrity & Relations ---');
    const totalEmployees = await prisma.employee.count({ where: { deletedAt: null } });
    assert(totalEmployees >= 6, `At least 6 sample employees exist (Found: ${totalEmployees})`);

    const sampleEmp = await prisma.employee.findUnique({
      where: { employeeNumber: 'CORP-000001' },
      include: {
        department: true,
        branch: true,
        station: true,
        nextOfKin: true,
        emergencyContacts: true,
        history: true,
      },
    });

    assert(sampleEmp !== null, 'Jackson Kamau (CORP-000001) exists');
    assert(sampleEmp?.department?.code === 'SEC-OPS', 'Jackson Kamau is assigned to Security Operations');
    assert(sampleEmp?.station?.code === 'STN-CBD01', 'Jackson Kamau is deployed to Nairobi Central Station');
    assert((sampleEmp?.nextOfKin?.length ?? 0) > 0, 'Next of kin record properly linked');
    assert((sampleEmp?.emergencyContacts?.length ?? 0) > 0, 'Emergency contact properly linked');
    assert((sampleEmp?.history?.length ?? 0) > 0, 'Initial onboarding career history timeline recorded');

    // Test 5: Field Masking Sanitizer
    console.log('\n--- Test Suite 5: Permission-Aware Field Masking ---');
    const sanitizedUnauth = sanitizeEmployeeForView(sampleEmp, false);
    assert(sanitizedUnauth.bankAccountNumber === '****2841', 'Unauthorized view masks bank account');
    assert(sanitizedUnauth.mpesaPhoneNumber === '+254***5678', 'Unauthorized view masks M-Pesa phone');

    const sanitizedAuth = sanitizeEmployeeForView(sampleEmp, true);
    assert(sanitizedAuth.bankAccountNumber === '1104892841', 'Authorized view reveals unmasked bank account');

    // Test 6: Create New Employee & Lifecycle Timeline
    console.log('\n--- Test Suite 6: Employee Lifecycle & Career Timeline ---');
    const testNatId = '99887766';
    await prisma.employee.deleteMany({ where: { nationalId: testNatId } });

    const newEmpNum = await generateNextEmployeeNumber('CORP-');
    const createdEmp = await prisma.employee.create({
      data: {
        employeeNumber: newEmpNum,
        firstName: 'Titus',
        lastName: 'Kipchumba',
        fullName: 'Titus Kipchumba',
        nationalId: testNatId,
        gender: 'MALE',
        primaryPhone: '+254722888999',
        jobTitle: 'Tactical Guard Patrol',
        employmentType: 'CONTRACT',
        employmentStatus: 'ACTIVE',
        employmentDate: new Date(),
        preferredPaymentMethod: 'BANK',
        bankName: 'Equity Bank',
        bankAccountNumber: '01192837465',
      },
    });

    assert(createdEmp.id !== undefined, `Created employee ${createdEmp.fullName} (${createdEmp.employeeNumber})`);

    // Update Status with History
    const updatedEmp = await prisma.employee.update({
      where: { id: createdEmp.id },
      data: { employmentStatus: 'ON_LEAVE' },
    });

    await prisma.employeeHistory.create({
      data: {
        employeeId: createdEmp.id,
        changeType: 'STATUS_CHANGE',
        description: 'Status changed from ACTIVE to ON_LEAVE. Reason: Annual Guard Leave',
        previousValue: JSON.stringify({ status: 'ACTIVE' }),
        newValue: JSON.stringify({ status: 'ON_LEAVE' }),
      },
    });

    const historyCount = await prisma.employeeHistory.count({ where: { employeeId: createdEmp.id } });
    assert(historyCount === 1, 'Career timeline record successfully linked to status change');

    // Test 7: Archival & Restoration
    console.log('\n--- Test Suite 7: Archive & Restore Lifecycle ---');
    const archivedEmp = await prisma.employee.update({
      where: { id: createdEmp.id },
      data: { isArchived: true, archivedReason: 'Contract concluded', employmentStatus: 'INACTIVE' },
    });
    assert(archivedEmp.isArchived === true, 'Employee successfully marked as archived');
    assert(archivedEmp.employmentStatus === 'INACTIVE', 'Archived employee status transitioned to INACTIVE');

    const restoredEmp = await prisma.employee.update({
      where: { id: createdEmp.id },
      data: { isArchived: false, archivedReason: null, employmentStatus: 'ACTIVE' },
    });
    assert(restoredEmp.isArchived === false, 'Employee restored from archive');

    // Clean up test employee
    await prisma.employeeHistory.deleteMany({ where: { employeeId: createdEmp.id } });
    await prisma.employee.delete({ where: { id: createdEmp.id } });

    // Test 8: Real Headcount Stats
    console.log('\n--- Test Suite 8: Real Headcount Dashboard Metrics ---');
    const activeGuards = await prisma.employee.count({
      where: { deletedAt: null, isArchived: false, employmentStatus: 'ACTIVE' },
    });
    const onLeaveGuards = await prisma.employee.count({
      where: { deletedAt: null, isArchived: false, employmentStatus: 'ON_LEAVE' },
    });
    assert(activeGuards >= 4, `Real active count verified (Found: ${activeGuards})`);
    assert(onLeaveGuards >= 1, `Real on-leave count verified (Found: ${onLeaveGuards})`);

    console.log('\n========================================================');
    console.log(`📊 Test Results: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Verification suite encountered an error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
