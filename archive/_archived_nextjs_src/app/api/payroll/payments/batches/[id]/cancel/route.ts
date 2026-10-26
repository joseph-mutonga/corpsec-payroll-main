// POST /api/payroll/payments/batches/[id]/cancel — Cancel an unapproved payment batch

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { PaymentService } from '@/lib/payments/PaymentService';

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(req, ['payroll_payment.cancel']);
    if (auth.error) return auth.error;

    const resolvedParams = await Promise.resolve(context.params);
    const batchId = resolvedParams.id;

    const body = await req.json().catch(() => ({}));
    const reason = body.reason || 'Cancelled by authorized user';

    const result = await PaymentService.cancelBatch(batchId, reason, auth.user.id, auth.user.email);

    return apiSuccess(result, { message: `Payment batch ${result.batchNumber} has been cancelled.` });
  } catch (error: any) {
    console.error('Error cancelling payment batch:', error);
    return apiError(error.message || 'Failed to cancel payment batch', 400);
  }
}
