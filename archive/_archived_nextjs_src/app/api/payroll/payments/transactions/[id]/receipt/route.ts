// GET /api/payroll/payments/transactions/[id]/receipt — Payment Receipt Details

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { PaymentMasking } from '@/lib/payments/PaymentMasking';
import { PaymentReceiptData } from '@/types';

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(req, ['payroll_payment.view', 'payroll_payment.receipt_view']);
    if (auth.error) return auth.error;

    const resolvedParams = await Promise.resolve(context.params);
    const transactionId = resolvedParams.id;

    const tx = await prisma.paymentTransaction.findUnique({
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
      return apiError('Payment transaction not found', 404);
    }

    // Regular employee self-service check
    const isEmployeeOnly =
      auth.user.roles.includes('employee') &&
      !auth.user.roles.some((r) => ['super_admin', 'hr_admin', 'hr_manager', 'payroll_officer', 'finance'].includes(r));

    if (isEmployeeOnly && tx.employee.email !== auth.user.email) {
      return apiError('Access denied. You can only view your own payment receipts.', 403);
    }

    const company = await prisma.companySetting.findFirst();

    const destinationMasked = PaymentMasking.maskDestination(
      tx.paymentMethod,
      tx.accountNumber,
      tx.phoneNumber,
      tx.bankName
    );

    const paymentDate = tx.completedAt
      ? new Date(tx.completedAt).toISOString().slice(0, 10)
      : new Date(tx.createdAt).toISOString().slice(0, 10);

    const receipt: PaymentReceiptData = {
      transactionNumber: tx.transactionNumber,
      providerReference: tx.providerReference || 'N/A',
      internalReference: tx.internalReference,
      status: tx.status as any,
      amount: tx.amount,
      paymentMethod: tx.paymentMethod,
      paymentDate,
      paidAt: tx.completedAt ? tx.completedAt.toISOString() : tx.createdAt.toISOString(),
      destinationMasked,
      bankName: tx.bankName || undefined,
      company: {
        name: company?.companyName || 'CorpSec Investigations & Guarding Services',
        tagline: 'Professional Security & Guarding Services',
        kraPin: company?.kraPin || 'P051234567Z',
        address: company?.physicalAddress || 'CorpSec House, Upper Hill, Nairobi, Kenya',
        email: company?.email || 'info@corpsec.co.ke',
        phone: company?.phone || '+254 700 000 000',
      },
      employee: {
        employeeNumber: tx.employee.employeeNumber,
        fullName: tx.employee.fullName,
        nationalId: PaymentMasking.maskIdNumber(tx.employee.nationalId),
        jobTitle: tx.employee.jobTitle || 'Security Guard',
        department: tx.employee.department?.name || 'Security Guarding & Operations',
        station: tx.employee.station?.name || 'Nairobi Central Guarding Station',
      },
      payrollPeriod: {
        name: tx.paymentBatch.payrollPeriod.name,
        periodNumber: tx.paymentBatch.payrollPeriod.periodNumber,
        runNumber: tx.paymentBatch.payrollRun.runNumber,
      },
    };

    return apiSuccess(receipt);
  } catch (error: any) {
    console.error('Error generating payment receipt:', error);
    return apiError(error.message || 'Failed to generate payment receipt', 500);
  }
}
