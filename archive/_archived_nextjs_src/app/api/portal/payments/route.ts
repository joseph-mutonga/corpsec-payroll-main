import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { resolveSessionEmployee } from '@/lib/portal/PortalAuth';
import { apiSuccess, apiError } from '@/lib/response';
import { PaymentMasking } from '@/lib/payments/PaymentMasking';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authContext = await resolveSessionEmployee();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { employee } = authContext;

    const transactions = await db.paymentTransaction.findMany({
      where: {
        employeeId: employee.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        paymentBatch: {
          include: {
            payrollPeriod: true,
          },
        },
      },
    });

    const items = transactions.map((tx) => ({
      id: tx.id,
      transactionNumber: tx.transactionNumber,
      paymentBatchId: tx.paymentBatchId,
      batchNumber: tx.paymentBatch.batchNumber,
      periodName: tx.paymentBatch.payrollPeriod?.name || 'N/A',
      amount: tx.amount,
      currency: 'KES',
      paymentMethod: tx.paymentMethod,
      destinationMasked: PaymentMasking.maskDestination(
        tx.paymentMethod,
        tx.accountNumber,
        tx.phoneNumber,
        tx.bankName
      ),
      bankName: tx.bankName,
      status: tx.status,
      providerReference: tx.providerReference,
      processedAt: tx.completedAt || tx.createdAt,
      createdAt: tx.createdAt,
    }));

    return apiSuccess(items);
  } catch (error: any) {
    console.error('Error fetching employee payment transactions:', error);
    return apiError(error.message || 'Failed to load employee payment history');
  }
}
