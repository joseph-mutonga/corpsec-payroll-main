// POST /api/payroll/payments/batches/[id]/approve — Authorize and approve payment batch

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { PaymentService } from '@/lib/payments/PaymentService';

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(req, ['payroll_payment.approve']);
    if (auth.error) return auth.error;

    const resolvedParams = await Promise.resolve(context.params);
    const batchId = resolvedParams.id;

    const updated = await PaymentService.approveBatch(batchId, auth.user.id, auth.user.email);

    return apiSuccess(updated, {
      message: `Payment batch ${updated.batchNumber} successfully APPROVED by ${auth.user.firstName} ${auth.user.lastName}.`,
    });
  } catch (error: any) {
    console.error('Error approving payment batch:', error);
    return apiError(error.message || 'Failed to approve payment batch', 400);
  }
}
