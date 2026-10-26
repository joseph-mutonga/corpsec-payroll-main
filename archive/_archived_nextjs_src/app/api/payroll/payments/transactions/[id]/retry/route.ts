// POST /api/payroll/payments/transactions/[id]/retry — Retry an individual failed transaction

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { PaymentService } from '@/lib/payments/PaymentService';

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(req, ['payroll_payment.retry']);
    if (auth.error) return auth.error;

    const resolvedParams = await Promise.resolve(context.params);
    const transactionId = resolvedParams.id;

    const result = await PaymentService.retryTransaction(transactionId, auth.user.id, auth.user.email);

    return apiSuccess(result, {
      message: `Transaction ${result.transactionNumber} retried. Result: ${result.status}.`,
    });
  } catch (error: any) {
    console.error('Error retrying payment transaction:', error);
    return apiError(error.message || 'Failed to retry payment transaction', 400);
  }
}
