import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { resolveSessionEmployee } from '@/lib/portal/PortalAuth';
import { apiSuccess, apiError, apiNotFound, apiForbidden } from '@/lib/response';
import { PaymentMasking } from '@/lib/payments/PaymentMasking';
import { PaymentReceiptData, PaymentTransactionStatus } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authContext = await resolveSessionEmployee();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { employee, isHRAdmin } = authContext;
    const transactionId = params.id;

    const tx = await db.paymentTransaction.findUnique({
      where: { id: transactionId },
      include: {
        employee: {
          include: {
            department: true,
            station: true,
            branch: true,
          },
        },
        paymentBatch: {
          include: {
            payrollPeriod: true,
            payrollRun: true,
          },
        },
      },
    });

    if (!tx) {
      return apiNotFound('Payment transaction record not found');
    }

    // IDOR Protection: Employee can only view their own payment receipt
    if (!isHRAdmin && tx.employeeId !== employee.id) {
      return apiForbidden("Access Denied: You cannot view another employee's payment receipt.");
    }

    const company = await db.companySetting.findFirst();

    const destinationMasked = PaymentMasking.maskDestination(
      tx.paymentMethod,
      tx.accountNumber,
      tx.phoneNumber,
      tx.bankName
    );

    const receipt: PaymentReceiptData = {
      transactionNumber: tx.transactionNumber,
      providerReference: tx.providerReference || 'EFT-APPROVED',
      internalReference: tx.internalReference,
      status: tx.status as PaymentTransactionStatus,
      amount: tx.amount,
      paymentMethod: tx.paymentMethod,
      paymentDate: (tx.completedAt || tx.createdAt).toISOString(),
      paidAt: (tx.completedAt || tx.createdAt).toISOString(),
      destinationMasked,
      bankName: tx.bankName || undefined,
      company: {
        name: company?.companyName || 'CorpSec Investigations & Guarding Services Limited',
        tagline: 'Professional Security & Guarding Services',
        kraPin: company?.kraPin || 'P051234567Z',
        address: company?.physicalAddress || 'CorpSec House, Upper Hill, Nairobi',
        email: company?.email || 'payments@corpsec.co.ke',
        phone: company?.phone || '+254 20 271 9000',
      },
      employee: {
        employeeNumber: tx.employee.employeeNumber,
        fullName: tx.employee.fullName,
        nationalId: PaymentMasking.maskNationalId(tx.employee.nationalId),
        jobTitle: tx.employee.jobTitle,
        department: tx.employee.department?.name || 'Operations',
        station: tx.employee.station?.name || 'HQ / General',
      },
      payrollPeriod: {
        name: tx.paymentBatch.payrollPeriod?.name || 'N/A',
        periodNumber: tx.paymentBatch.payrollPeriod?.periodNumber || 'N/A',
        runNumber: tx.paymentBatch.payrollRun?.runNumber || 'N/A',
      },
    };

    return apiSuccess(receipt);
  } catch (error: any) {
    console.error('Error generating employee payment receipt:', error);
    return apiError(error.message || 'Failed to generate payment receipt');
  }
}
