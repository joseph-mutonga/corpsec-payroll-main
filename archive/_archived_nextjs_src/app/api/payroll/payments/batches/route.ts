// GET & POST /api/payroll/payments/batches — List & Create Payment Batches

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { PaymentService } from '@/lib/payments/PaymentService';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['payroll_payment.view']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const payrollPeriodId = searchParams.get('payrollPeriodId');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    const where: any = {};
    if (payrollPeriodId) where.payrollPeriodId = payrollPeriodId;
    if (status) where.status = status;

    const [total, batches] = await Promise.all([
      prisma.paymentBatch.count({ where }),
      prisma.paymentBatch.findMany({
        where,
        include: {
          payrollPeriod: {
            select: { id: true, periodNumber: true, name: true, payrollMonth: true, payrollYear: true },
          },
          payrollRun: {
            select: { id: true, runNumber: true, status: true, totalNetPayroll: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          approvedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          processedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return apiSuccess(batches, {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error: any) {
    console.error('Error listing payment batches:', error);
    return apiError(error.message || 'Failed to list payment batches', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['payroll_payment.create_batch']);
    if (auth.error) return auth.error;

    const body = await req.json();
    const { payrollRunId, name, paymentMethod, notes } = body;

    if (!payrollRunId) {
      return apiError('payrollRunId is required to create a payment batch', 400);
    }

    const batch = await PaymentService.createBatch({
      payrollRunId,
      name,
      paymentMethod,
      notes,
      userId: auth.user.id,
      userEmail: auth.user.email,
    });

    return apiSuccess(batch, { message: `Payment batch ${batch.batchNumber} created in DRAFT status.` });
  } catch (error: any) {
    console.error('Error creating payment batch:', error);
    return apiError(error.message || 'Failed to create payment batch', 400);
  }
}
