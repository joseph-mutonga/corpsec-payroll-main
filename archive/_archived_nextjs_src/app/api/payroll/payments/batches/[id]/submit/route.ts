// POST /api/payroll/payments/batches/[id]/submit — Submit DRAFT batch to READY status

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { PaymentService } from '@/lib/payments/PaymentService';

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(req, ['payroll_payment.create_batch', 'payroll_payment.review']);
    if (auth.error) return auth.error;

    const resolvedParams = await Promise.resolve(context.params);
    const batchId = resolvedParams.id;

    const updated = await PaymentService.submitBatch(batchId, auth.user.id, auth.user.email);

    return apiSuccess(updated, { message: `Payment batch ${updated.batchNumber} is now READY for approval review.` });
  } catch (error: any) {
    console.error('Error submitting payment batch:', error);
    return apiError(error.message || 'Failed to submit payment batch', 400);
  }
}
