// POST /api/payroll/payments/batches/[id]/process — Execute disbursement processing

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { PaymentService } from '@/lib/payments/PaymentService';

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(req, ['payroll_payment.process']);
    if (auth.error) return auth.error;

    const resolvedParams = await Promise.resolve(context.params);
    const batchId = resolvedParams.id;

    const result = await PaymentService.processBatch(batchId, auth.user.id, auth.user.email);

    return apiSuccess(result, {
      message: `Batch ${result.batchNumber} processing completed: ${result.successfulCount} successful (KES ${result.successfulAmount.toLocaleString()}), ${result.failedCount} failed. Status: ${result.status}.`,
    });
  } catch (error: any) {
    console.error('Error processing payment batch:', error);
    return apiError(error.message || 'Failed to process payment batch', 400);
  }
}
