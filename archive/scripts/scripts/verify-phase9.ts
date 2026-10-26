// ============================================================================
// CORPSEC HR PAYROLL — PHASE 9 VERIFICATION TEST SUITE
// Tests Payment Providers, Idempotency, Validation, Batch State Machine, & Reconciliation
// ============================================================================

import { prisma } from '../src/lib/prisma';
import { PaymentMasking } from '../src/lib/payments/PaymentMasking';
import { PaymentValidation } from '../src/lib/payments/PaymentValidation';
import { MockPaymentProvider } from '../src/lib/payments/MockPaymentProvider';
import { MpesaPaymentProvider } from '../src/lib/payments/MpesaPaymentProvider';
import { BankPaymentProvider } from '../src/lib/payments/BankPaymentProvider';
import { PaymentService } from '../src/lib/payments/PaymentService';
import { ReconciliationService } from '../src/lib/payments/ReconciliationService';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedTests++;
  }
}

async function runPhase9Verification() {
  console.log('\n🧪 ========================================================');
  console.log('   CORPSEC HR PAYROLL — PHASE 9 VERIFICATION TEST SUITE');
  console.log('   Payment Providers, Idempotency, Batches & Reconciliation');
  console.log('========================================================\n');

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Sensitive Financial Data Masking
  // --------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Sensitive Financial Data Masking ---');

  const maskedBank = PaymentMasking.maskBankAccount('1104892841');
  assert(maskedBank === '****2841', `Bank account masking: expected ****2841, got ${maskedBank}`);

  const maskedPhone = PaymentMasking.maskPhoneNumber('+254712345678');
  assert(maskedPhone === '+25471****5678', `Phone number masking: expected +25471****5678, got ${maskedPhone}`);

  const maskedId = PaymentMasking.maskIdNumber('28491024');
  assert(maskedId === '****1024', `National ID masking: expected ****1024, got ${maskedId}`);

  const mpesaDest = PaymentMasking.maskDestination('MPESA', null, '+254712345678');
  assert(mpesaDest.includes('M-Pesa: +25471****5678'), `M-Pesa destination format: got ${mpesaDest}`);

  const bankDest = PaymentMasking.maskDestination('BANK', '1104892841', null, 'KCB Bank Kenya');
  assert(bankDest.includes('KCB Bank Kenya ****2841'), `Bank destination format: got ${bankDest}`);

  // --------------------------------------------------------------------------
  // TEST GROUP 2: Payment Validation & State Transitions
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Payment Validation & State Transitions ---');

  const draftRunCheck = PaymentValidation.validatePayrollRunForDisbursement({
    id: 'run-draft-01',
    runNumber: 'PAY-2026-DRAFT',
    status: 'DRAFT',
    employeeRecords: [{ id: '1' }],
  });
  assert(!draftRunCheck.isValid, 'Un-finalized DRAFT payroll run is rejected for disbursement');

  const finalizedRunCheck = PaymentValidation.validatePayrollRunForDisbursement({
    id: 'run-fin-01',
    runNumber: 'PAY-2026-FIN',
    status: 'FINALIZED',
    employeeRecords: [{ id: '1' }],
  });
  assert(finalizedRunCheck.isValid, 'FINALIZED payroll run is approved for disbursement');

  const invalidEmployee = PaymentValidation.validateEmployeeRecord({
    id: 'rec-01',
    employeeId: 'emp-01',
    netPay: -500,
    paymentMethod: 'BANK',
    bankAccountNumber: '',
    employee: { id: 'emp-01', employeeNumber: 'CORP-001', fullName: 'Test Guard' },
  });
  assert(invalidEmployee.length >= 2, `Detected ${invalidEmployee.length} validation errors for invalid employee`);
  assert(invalidEmployee.some((e) => e.field === 'netPay'), 'Caught negative net pay violation');
  assert(invalidEmployee.some((e) => e.field === 'bankAccountNumber'), 'Caught missing bank account violation');

  // State machine transitions
  assert(PaymentValidation.isValidBatchTransition('DRAFT', 'READY'), 'DRAFT -> READY transition allowed');
  assert(PaymentValidation.isValidBatchTransition('READY', 'APPROVED'), 'READY -> APPROVED transition allowed');
  assert(PaymentValidation.isValidBatchTransition('APPROVED', 'PROCESSING'), 'APPROVED -> PROCESSING transition allowed');
  assert(PaymentValidation.isValidBatchTransition('PROCESSING', 'COMPLETED'), 'PROCESSING -> COMPLETED transition allowed');
  assert(!PaymentValidation.isValidBatchTransition('DRAFT', 'PROCESSING'), 'DRAFT -> PROCESSING directly blocked');
  assert(!PaymentValidation.isValidBatchTransition('COMPLETED', 'DRAFT'), 'COMPLETED -> DRAFT blocked');

  // --------------------------------------------------------------------------
  // TEST GROUP 3: Payment Providers Architecture & Gateway Responses
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Payment Providers Architecture & Gateway Responses ---');

  const mockProvider = new MockPaymentProvider();
  const mockSuccess = await mockProvider.processPayment({
    transactionId: 'tx-01',
    transactionNumber: 'TRX-202608-0001',
    internalReference: 'REF-001',
    idempotencyKey: 'IDEMP-TEST-001',
    employeeId: 'emp-01',
    employeeNumber: 'CORP-000001',
    employeeName: 'Jackson Kariuki',
    paymentMethod: 'BANK',
    accountNumber: '1104892841',
    bankName: 'KCB Bank',
    amount: 38806,
    currency: 'KES',
    description: 'Net Salary Payout',
  });
  assert(mockSuccess.success && mockSuccess.status === 'SUCCESS', 'MockPaymentProvider returns SUCCESS result');
  assert(mockSuccess.providerReference.startsWith('EFT-'), `Mock EFT reference formatted: ${mockSuccess.providerReference}`);

  // Test provider simulated failure injection
  mockProvider.setSimulateFailure('IDEMP-FAIL-TEST', true);
  const mockFail = await mockProvider.processPayment({
    transactionId: 'tx-02',
    transactionNumber: 'TRX-202608-0002',
    internalReference: 'REF-002',
    idempotencyKey: 'IDEMP-FAIL-TEST',
    employeeId: 'emp-02',
    employeeNumber: 'CORP-000002',
    employeeName: 'Failed Employee',
    paymentMethod: 'BANK',
    accountNumber: '1104892841',
    amount: 25000,
    currency: 'KES',
    description: 'Failed Test Payout',
  });
  assert(!mockFail.success && mockFail.status === 'FAILED', 'Mock provider correctly handles simulated failure');
  assert(mockFail.failureCode === 'PROVIDER_SIMULATED_REJECTION', 'Captured correct failure code');

  // Test Kenyan phone number formatting for M-Pesa
  const formattedPhone = MpesaPaymentProvider.formatKenyanPhoneNumber('0712345678');
  assert(formattedPhone === '254712345678', `M-Pesa 07XX format: expected 254712345678, got ${formattedPhone}`);
  const formattedPlus = MpesaPaymentProvider.formatKenyanPhoneNumber('+254 712 345 678');
  assert(formattedPlus === '254712345678', `M-Pesa +254 format: expected 254712345678, got ${formattedPlus}`);

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Database Operations, Batch Workflow & Idempotency
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Database Operations, Batch Workflow & Idempotency ---');

  // Discover active payroll run from Phase 7/8
  let activeRun = await prisma.payrollRun.findFirst({
    where: { status: { in: ['FINALIZED', 'APPROVED', 'LOCKED'] } },
    include: { payrollPeriod: true, employeeRecords: true },
  });

  if (!activeRun) {
    // If run exists in CALCULATED, update to FINALIZED for payment verification
    const calculatedRun = await prisma.payrollRun.findFirst({
      include: { payrollPeriod: true, employeeRecords: true },
    });
    if (calculatedRun) {
      activeRun = await prisma.payrollRun.update({
        where: { id: calculatedRun.id },
        data: { status: 'FINALIZED' },
        include: { payrollPeriod: true, employeeRecords: true },
      });
    }
  }

  if (activeRun) {
    // Clean any prior test batch for fresh testing
    await prisma.paymentTransaction.deleteMany({
      where: { paymentBatch: { payrollRunId: activeRun.id } },
    });
    await prisma.paymentBatch.deleteMany({
      where: { payrollRunId: activeRun.id },
    });

    const superAdmin = await prisma.user.findFirst({
      where: { email: 'admin@corpsec.co.ke' },
    });
    const userId = superAdmin?.id || 'admin-user';
    const userEmail = superAdmin?.email || 'admin@corpsec.co.ke';

    // 1. Create batch
    const createdBatch = await PaymentService.createBatch({
      payrollRunId: activeRun.id,
      name: 'Verification Test Net Salary Batch',
      notes: 'Automated test suite batch',
      userId,
      userEmail,
    });
    assert(createdBatch.status === 'DRAFT', `Created batch is in DRAFT status (${createdBatch.batchNumber})`);
    assert(createdBatch.totalEmployees > 0, `Batch contains ${createdBatch.totalEmployees} eligible staff`);

    // 2. Duplicate prevention test
    let duplicatePrevented = false;
    try {
      await PaymentService.createBatch({
        payrollRunId: activeRun.id,
        name: 'Duplicate Batch Attempt',
        userId,
        userEmail,
      });
    } catch (err) {
      duplicatePrevented = true;
    }
    assert(duplicatePrevented, 'Duplicate active payment batch creation is strictly prevented');

    // 3. Submit batch
    const submitted = await PaymentService.submitBatch(createdBatch.id, userId, userEmail);
    assert(submitted.status === 'READY', 'Batch successfully transitioned to READY for review');

    // 4. Approve batch
    const approved = await PaymentService.approveBatch(createdBatch.id, userId, userEmail);
    assert(approved.status === 'APPROVED', 'Batch successfully transitioned to APPROVED');
    assert(approved.approvedById === userId, 'Batch records authorizer user ID');

    // 5. Process batch
    const processed = await PaymentService.processBatch(createdBatch.id, userId, userEmail);
    assert(['COMPLETED', 'PARTIALLY_FAILED'].includes(processed.status), `Batch execution finished with status: ${processed.status}`);
    assert(processed.successfulCount > 0, `Successfully processed ${processed.successfulCount} staff payments`);

    // 6. Terminal state protection test: Cannot re-process a COMPLETED batch
    let completedRejectionPassed = false;
    try {
      await PaymentService.processBatch(createdBatch.id, userId, userEmail);
    } catch (err: any) {
      completedRejectionPassed = err.message.includes('COMPLETED');
    }
    assert(completedRejectionPassed, 'Re-executing an already COMPLETED payment batch is strictly blocked');

    // 7. Idempotency unique constraint test: Attempt inserting duplicate key
    const firstTx = await prisma.paymentTransaction.findFirst({
      where: { paymentBatchId: createdBatch.id },
    });
    assert(Boolean(firstTx?.idempotencyKey), `First transaction recorded with unique idempotencyKey (${firstTx?.idempotencyKey})`);

    let duplicateKeyBlocked = false;
    try {
      if (firstTx) {
        await prisma.paymentTransaction.create({
          data: {
            transactionNumber: 'TRX-DUP-TEST',
            paymentBatchId: createdBatch.id,
            employeeId: firstTx.employeeId,
            payrollRecordId: firstTx.payrollRecordId,
            paymentMethod: firstTx.paymentMethod,
            amount: firstTx.amount,
            status: 'SUCCESS',
            internalReference: 'DUP-REF',
            idempotencyKey: firstTx.idempotencyKey, // Duplicate Key!
          },
        });
      }
    } catch (err) {
      duplicateKeyBlocked = true;
    }
    assert(duplicateKeyBlocked, 'Database unique constraint on idempotencyKey blocks duplicate payout transactions');

    // 8. Retry transaction test on failed transaction
    if (firstTx) {
      const failedTx = await prisma.paymentTransaction.update({
        where: { id: firstTx.id },
        data: { status: 'FAILED', failureCode: 'TEST_GATEWAY_TIMEOUT', failureMessage: 'Simulated failure for retry testing' },
      });
      const retried = await PaymentService.retryTransaction(failedTx.id, userId, userEmail);
      assert(retried.status === 'SUCCESS', `Retry transaction succeeded (Status: ${retried.status}, Retry Count: ${retried.retryCount})`);
    }
  } else {
    console.log('  ⚠️ Skipping live database run tests (no finalized run found in DB)');
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 5: Reconciliation Engine & Discrepancy Detection
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Reconciliation Engine & Discrepancy Detection ---');

  const mockReconciliationInput = {
    payrollPeriodId: 'period-01',
    payrollPeriodName: 'August 2026 Monthly Payroll',
    periodNumber: 'PRD-2026-08',
    payrollRunId: 'run-01',
    runNumber: 'PAY-2026-08-01',
    employeeRecords: [
      {
        id: 'rec-01',
        employeeId: 'emp-01',
        employeeNumber: 'CORP-000001',
        fullName: 'Jackson Kariuki Kamau',
        netPay: 38806,
        paymentMethod: 'BANK',
      },
      {
        id: 'rec-02',
        employeeId: 'emp-02',
        employeeNumber: 'CORP-000002',
        fullName: 'Mary Wanjiku Mwangi',
        netPay: 42100,
        paymentMethod: 'MPESA',
      },
      {
        id: 'rec-03',
        employeeId: 'emp-03',
        employeeNumber: 'CORP-000003',
        fullName: 'Peter Otieno Ochieng',
        netPay: 29500,
        paymentMethod: 'BANK',
      },
    ],
    transactions: [
      {
        id: 'tx-01',
        transactionNumber: 'TRX-001',
        employeeId: 'emp-01',
        payrollRecordId: 'rec-01',
        amount: 38806,
        status: 'SUCCESS',
        paymentMethod: 'BANK',
        providerReference: 'EFT-12345',
        idempotencyKey: 'IDEMP-1',
      },
      {
        id: 'tx-02',
        transactionNumber: 'TRX-002',
        employeeId: 'emp-02',
        payrollRecordId: 'rec-02',
        amount: 40000, // Underpayment variance (40,000 vs 42,100)
        status: 'SUCCESS',
        paymentMethod: 'MPESA',
        providerReference: 'DAR-12345',
        idempotencyKey: 'IDEMP-2',
      },
      // rec-03 has no transaction (Missing payment)
    ],
  };

  const recResult = ReconciliationService.reconcile(mockReconciliationInput);

  assert(recResult.summary.totalExpectedEmployees === 3, 'Reconciliation counts 3 expected employees');
  assert(recResult.summary.totalPaidEmployees === 2, 'Reconciliation counts 2 paid employees');
  assert(recResult.summary.expectedAmount === 110406, `Expected amount: KES 110,406 (got ${recResult.summary.expectedAmount})`);
  assert(recResult.summary.actualPaidAmount === 78806, `Actual amount: KES 78,806 (got ${recResult.summary.actualPaidAmount})`);
  assert(recResult.summary.discrepancyAmount === -31600, `Discrepancy variance: -KES 31,600 (got ${recResult.summary.discrepancyAmount})`);

  const exactMatchItem = recResult.discrepancies.find((d) => d.employeeNumber === 'CORP-000001');
  assert(exactMatchItem?.discrepancyType === 'EXACT_MATCH', 'Employee 1 classified as EXACT_MATCH');

  const underpaidItem = recResult.discrepancies.find((d) => d.employeeNumber === 'CORP-000002');
  assert(underpaidItem?.discrepancyType === 'UNDERPAYMENT', 'Employee 2 classified as UNDERPAYMENT');

  const missingItem = recResult.discrepancies.find((d) => d.employeeNumber === 'CORP-000003');
  assert(missingItem?.discrepancyType === 'MISSING_PAYMENT', 'Employee 3 classified as MISSING_PAYMENT');

  assert(recResult.summary.status === 'EXCEPTIONS_FOUND', `Reconciliation status flagged as EXCEPTIONS_FOUND (got ${recResult.summary.status})`);

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n========================================================');
  console.log(`📊 PHASE 9 VERIFICATION SUMMARY:`);
  console.log(`   Passed: ${passedTests}`);
  console.log(`   Failed: ${failedTests}`);
  console.log(`   Total Tests: ${passedTests + failedTests}`);
  console.log('========================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase9Verification()
  .catch((err) => {
    console.error('Fatal error during Phase 9 verification:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
