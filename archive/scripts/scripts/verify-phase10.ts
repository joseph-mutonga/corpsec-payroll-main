// CorpSec HR Payroll — Phase 10 Verification Suite
// Tests Employee Portal, HR Request Service, Profile Change Workflow, Security & IDOR Guards

import { PrismaClient } from '@prisma/client';
import { HRRequestService } from '../src/lib/portal/HRRequestService';
import { PaymentMasking } from '../src/lib/payments/PaymentMasking';
import { calculateLeaveDuration, detectLeaveConflict } from '../src/lib/leave-calculator';

const prisma = new PrismaClient();

let passedTests = 0;
let failedTests = 0;

function assert(condition: any, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${details ? ` - ${details}` : ''}`);
    failedTests++;
  }
}

async function runPhase10Verification() {
  console.log('\n=============================================================');
  console.log('  CORPSEC HR PAYROLL — PHASE 10 VERIFICATION TEST SUITE');
  console.log('  Employee Self-Service Portal & HR Service Requests');
  console.log('=============================================================\n');

  try {
    // 1. Data Masking & PII Protection Tests
    console.log('--- 1. Security & Financial Data Masking ---');
    const maskedBank = PaymentMasking.maskBankAccount('1104892841');
    assert(maskedBank === '****2841', 'Bank Account Masking (shows last 4 digits only)', `Got: ${maskedBank}`);

    const maskedPhone = PaymentMasking.maskPhoneNumber('+254712345678');
    assert(maskedPhone.includes('****5678'), 'Phone Number Masking (masks middle digits)', `Got: ${maskedPhone}`);

    const maskedId = PaymentMasking.maskNationalId('28491024');
    assert(maskedId === '****1024', 'National ID Masking (masks prefix)', `Got: ${maskedId}`);

    const maskedDestMpesa = PaymentMasking.maskDestination('MPESA', null, '0712345678');
    assert(maskedDestMpesa.startsWith('M-Pesa:'), 'Destination Masking for M-Pesa', `Got: ${maskedDestMpesa}`);

    const maskedDestBank = PaymentMasking.maskDestination('BANK', '1234567890', null, 'Equity Bank');
    assert(maskedDestBank.includes('Equity Bank') && maskedDestBank.includes('****7890'), 'Destination Masking for Bank', `Got: ${maskedDestBank}`);

    // 2. Employee Account Linkage Verification
    console.log('\n--- 2. Employee User Linkage Verification ---');
    const jacksonEmp = await prisma.employee.findFirst({
      where: { employeeNumber: 'CORP-000001' },
      include: { user: true },
    });
    assert(!!jacksonEmp, 'Employee Jackson (CORP-000001) exists in database');
    assert(!!jacksonEmp?.userId, 'Employee Jackson has linked userId');
    assert(jacksonEmp?.user?.email === 'jackson.kamau@corpsec.co.ke', 'Employee Jackson linked to jackson.kamau@corpsec.co.ke');

    const emmanuelEmp = await prisma.employee.findFirst({
      where: { employeeNumber: 'CORP-000002' },
      include: { user: true },
    });
    assert(!!emmanuelEmp, 'Employee Emmanuel (CORP-000002) exists in database');
    assert(!!emmanuelEmp?.userId, 'Employee Emmanuel has linked userId');

    // 3. HR Request Service: Ticket Creation & Numbering
    console.log('\n--- 3. HR Request Service: Ticket Creation & Numbering ---');
    if (!jacksonEmp) throw new Error('Jackson employee record not found for tests');

    const ticket1 = await HRRequestService.createRequest({
      employeeId: jacksonEmp.id,
      requestType: 'PROFILE_UPDATE',
      subject: 'Update Home Address & Phone',
      description: 'Relocated to Westlands Nairobi. Need to update physical address.',
      priority: 'MEDIUM',
      previousData: { physicalAddress: jacksonEmp.physicalAddress, primaryPhone: jacksonEmp.primaryPhone },
      proposedData: { physicalAddress: 'Apartment 4B, Rhapta Road, Westlands, Nairobi', primaryPhone: '+254711998877' },
    });

    assert(ticket1.requestNumber.startsWith('REQ-'), `Generated Ticket Number starts with REQ- (${ticket1.requestNumber})`);
    assert(ticket1.status === 'SUBMITTED', 'Initial ticket status is SUBMITTED');
    assert(ticket1.employeeId === jacksonEmp.id, 'Ticket correctly associated with employee');

    // 4. Ticket Lifecycle State Transitions & Confidentiality Scrub
    console.log('\n--- 4. Ticket Lifecycle & Confidentiality Scrubbing ---');
    const hrAdminUser = await prisma.user.findFirst({
      where: { email: 'hr.admin@corpsec.co.ke' },
    });
    assert(!!hrAdminUser, 'HR Admin user found in database');

    // Assign & Move to UNDER_REVIEW
    const underReviewTicket = await HRRequestService.reviewRequest({
      requestId: ticket1.id,
      status: 'UNDER_REVIEW',
      reviewerUserId: hrAdminUser?.id || '',
      internalHrNotes: 'CONFIDENTIAL: Verified lease agreement and verified employee identity via call.',
      employeeVisibleResponse: 'Your address update request is currently being processed by HR Operations.',
    });
    assert(underReviewTicket.status === 'UNDER_REVIEW', 'Ticket status transitioned to UNDER_REVIEW');
    assert(Boolean(underReviewTicket.internalHrNotes?.includes('CONFIDENTIAL')), 'Internal HR notes saved in admin record');

    // Verify employee-facing scrub: employee must NEVER see internal HR notes
    const employeeView = await HRRequestService.getRequestById(ticket1.id, false); // isHRAdmin = false
    assert(employeeView?.internalHrNotes === null, 'CONFIDENTIALITY GUARD: internalHrNotes scrubbed from employee view');
    assert(employeeView?.employeeVisibleResponse === 'Your address update request is currently being processed by HR Operations.', 'Employee sees public response');

    // Admin view maintains confidential notes
    const adminView = await HRRequestService.getRequestById(ticket1.id, true); // isHRAdmin = true
    assert(adminView?.internalHrNotes !== null, 'HR Admin can access confidential notes');

    // 5. Automated Profile Update upon Ticket Approval
    console.log('\n--- 5. Automated Profile Update on Approval ---');
    const approvedTicket = await HRRequestService.reviewRequest({
      requestId: ticket1.id,
      status: 'APPROVED',
      reviewerUserId: hrAdminUser?.id || '',
      employeeVisibleResponse: 'Address and phone number update has been verified and applied to your master profile.',
    });
    assert(approvedTicket.status === 'APPROVED', 'Ticket status updated to APPROVED');

    // Verify employee record was automatically updated
    const updatedJackson = await prisma.employee.findUnique({
      where: { id: jacksonEmp.id },
    });
    assert(
      updatedJackson?.physicalAddress === 'Apartment 4B, Rhapta Road, Westlands, Nairobi',
      'Employee physicalAddress automatically updated in Employee database'
    );
    assert(
      updatedJackson?.primaryPhone === '+254711998877',
      'Employee primaryPhone automatically updated in Employee database'
    );

    // Verify audit trail entry was recorded
    const historyEntry = await prisma.employeeHistory.findFirst({
      where: {
        employeeId: jacksonEmp.id,
        changeType: { in: ['CONTACT_UPDATE', 'PAYMENT_INFO_CHANGE'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(!!historyEntry, 'EmployeeHistory audit log entry created for automated update');

    // 6. Bank Account Change Request & Approval Workflow
    console.log('\n--- 6. Bank Details Change Request Workflow ---');
    const bankTicket = await HRRequestService.createRequest({
      employeeId: jacksonEmp.id,
      requestType: 'BANK_DETAILS_CHANGE',
      subject: 'Change Salary Account to KCB Bank',
      description: 'Opened new account at KCB Upper Hill Branch.',
      priority: 'HIGH',
      previousData: { bankName: jacksonEmp.bankName, bankAccountNumber: jacksonEmp.bankAccountNumber },
      proposedData: {
        bankName: 'KCB Bank Kenya',
        bankAccountName: 'Jackson Kamau Mwangi',
        bankAccountNumber: '1299887766',
        preferredPaymentMethod: 'BANK',
      },
    });

    assert(bankTicket.requestType === 'BANK_DETAILS_CHANGE', 'Bank details ticket created');

    await HRRequestService.reviewRequest({
      requestId: bankTicket.id,
      status: 'APPROVED',
      reviewerUserId: hrAdminUser?.id || '',
      employeeVisibleResponse: 'KCB Bank account verified and activated for next payroll run.',
    });

    const jacksonWithNewBank = await prisma.employee.findUnique({
      where: { id: jacksonEmp.id },
    });
    assert(jacksonWithNewBank?.bankName === 'KCB Bank Kenya', 'Bank name updated to KCB Bank Kenya');
    assert(jacksonWithNewBank?.bankAccountNumber === '1299887766', 'Bank account number updated to 1299887766');

    // 7. Employment Letter Request Workflow
    console.log('\n--- 7. Employment Letter Request Workflow ---');
    const letterTicket = await HRRequestService.createRequest({
      employeeId: jacksonEmp.id,
      requestType: 'EMPLOYMENT_LETTER',
      subject: 'Letter Request: Proof of Employment for Bank Loan',
      description: 'Purpose: Applying for Stima SACCO development loan. Addressed to: Stima SACCO Loans Committee.',
      priority: 'MEDIUM',
      proposedData: {
        letterType: 'PROOF_OF_EMPLOYMENT',
        purpose: 'Applying for Stima SACCO development loan',
        addressedTo: 'Stima SACCO Loans Committee',
      },
    });
    assert(letterTicket.requestType === 'EMPLOYMENT_LETTER', 'Employment letter ticket created');

    // 8. Notifications Triggering & Delivery
    console.log('\n--- 8. Notifications Delivery ---');
    const jacksonUser = await prisma.user.findFirst({
      where: { email: 'jackson.kamau@corpsec.co.ke' },
    });
    if (jacksonUser) {
      const notifs = await prisma.systemNotification.findMany({
        where: { userId: jacksonUser.id },
      });
      assert(notifs.length > 0, `Notifications delivered to employee user (${notifs.length} records found)`);
    }

    // 9. Leave Calculation & Conflict Detection
    console.log('\n--- 9. Leave Self-Service Calculator & Conflict Detection ---');
    const leaveDuration = calculateLeaveDuration('2026-09-01', '2026-09-05', {
      excludeWeekends: true,
      excludeHolidays: true,
    });
    assert(leaveDuration.durationDays === 4, 'Leave Duration calculation (Tue to Sat without weekends = 4 days)');

    const conflictTest = detectLeaveConflict(
      [
        {
          id: 'lr-1',
          requestNumber: 'LR-2026-0001',
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          status: 'APPROVED',
        },
      ],
      '2026-09-03',
      '2026-09-10'
    );
    assert(conflictTest.hasConflict === true, 'Leave Conflict detector flags overlapping leave request');

    // Summary
    console.log('\n=============================================================');
    console.log(`  PHASE 10 VERIFICATION COMPLETE: ${passedTests} Passed, ${failedTests} Failed`);
    console.log('=============================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error during Phase 10 verification:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase10Verification();
