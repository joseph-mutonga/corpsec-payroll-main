// GET /api/payroll/payments/transactions — Search historical payment transactions

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { PaymentMasking } from '@/lib/payments/PaymentMasking';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['payroll_payment.view', 'payroll_payment.receipt_view']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId');
    const paymentBatchId = searchParams.get('paymentBatchId');
    const paymentMethod = searchParams.get('paymentMethod');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

    // Self-service employee isolation
    const isEmployeeOnly =
      auth.user.roles.includes('employee') &&
      !auth.user.roles.some((r) => ['super_admin', 'hr_admin', 'hr_manager', 'payroll_officer', 'finance'].includes(r));

    const where: any = {};

    if (isEmployeeOnly) {
      const emp = await prisma.employee.findFirst({
        where: { email: auth.user.email },
      });
      if (!emp) {
        return apiSuccess([], { total: 0, page: 1, pageSize, totalPages: 0 });
      }
      where.employeeId = emp.id;
    } else if (employeeId) {
      where.employeeId = employeeId;
    }

    if (paymentBatchId) where.paymentBatchId = paymentBatchId;
    if (paymentMethod) where.paymentMethod = paymentMethod;
    if (status) where.status = status;

    if (search) {
      where.OR = [
        { transactionNumber: { contains: search } },
        { providerReference: { contains: search } },
        { internalReference: { contains: search } },
        { employee: { fullName: { contains: search } } },
        { employee: { employeeNumber: { contains: search } } },
      ];
    }

    const [total, transactions] = await Promise.all([
      prisma.paymentTransaction.count({ where }),
      prisma.paymentTransaction.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              fullName: true,
              nationalId: true,
              department: { select: { name: true } },
              station: { select: { name: true } },
            },
          },
          paymentBatch: {
            select: {
              id: true,
              batchNumber: true,
              name: true,
              status: true,
              payrollPeriod: { select: { name: true, periodNumber: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const masked = transactions.map((t) => ({
      id: t.id,
      transactionNumber: t.transactionNumber,
      paymentBatchId: t.paymentBatchId,
      employeeId: t.employeeId,
      employeeNumber: t.employee.employeeNumber,
      fullName: t.employee.fullName,
      nationalId: PaymentMasking.maskIdNumber(t.employee.nationalId),
      department: t.employee.department?.name || 'Guarding Operations',
      station: t.employee.station?.name || 'Nairobi Station',
      amount: t.amount,
      paymentMethod: t.paymentMethod,
      destinationMasked: PaymentMasking.maskDestination(t.paymentMethod, t.accountNumber, t.phoneNumber, t.bankName),
      bankName: t.bankName,
      status: t.status,
      provider: t.provider,
      providerReference: t.providerReference,
      internalReference: t.internalReference,
      failureCode: t.failureCode,
      failureMessage: t.failureMessage,
      retryCount: t.retryCount,
      lastRetriedAt: t.lastRetriedAt,
      initiatedAt: t.initiatedAt,
      completedAt: t.completedAt,
      createdAt: t.createdAt,
      paymentBatch: t.paymentBatch,
    }));

    return apiSuccess(masked, {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error: any) {
    console.error('Error searching payment transactions:', error);
    return apiError(error.message || 'Failed to search payment transactions', 500);
  }
}
