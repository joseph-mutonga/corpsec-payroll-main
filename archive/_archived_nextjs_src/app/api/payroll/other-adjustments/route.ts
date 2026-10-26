import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { otherEarningSchema, otherDeductionSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['salary.view', 'payroll_config.view', 'payroll.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId') || undefined;
    const periodId = searchParams.get('periodId') || undefined;
    const status = searchParams.get('status') || undefined;

    const [earnings, deductions] = await Promise.all([
      db.otherEarning.findMany({
        where: {
          ...(employeeId ? { employeeId } : {}),
          ...(periodId ? { payrollPeriodId: periodId } : {}),
          ...(status ? { approvalStatus: status } : {}),
        },
        include: {
          employee: { select: { id: true, employeeNumber: true, fullName: true } },
          payrollPeriod: { select: { id: true, periodNumber: true, name: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.otherDeduction.findMany({
        where: {
          ...(employeeId ? { employeeId } : {}),
          ...(periodId ? { payrollPeriodId: periodId } : {}),
          ...(status ? { approvalStatus: status } : {}),
        },
        include: {
          employee: { select: { id: true, employeeNumber: true, fullName: true } },
          payrollPeriod: { select: { id: true, periodNumber: true, name: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return apiSuccess({ earnings, deductions });
  } catch (error) {
    console.error('Fetch other adjustments error:', error);
    return apiError('Failed to fetch other payroll adjustments');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['salary.edit', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const type = body.adjustmentCategory || 'EARNING'; // EARNING or DEDUCTION

    if (type === 'EARNING') {
      const parsed = otherEarningSchema.safeParse(body);
      if (!parsed.success) return apiError('Invalid earning data', 400, parsed.error.format());

      const earning = await db.otherEarning.create({
        data: {
          employeeId: parsed.data.employeeId,
          payrollPeriodId: parsed.data.payrollPeriodId || null,
          title: parsed.data.title,
          earningType: parsed.data.earningType,
          amount: parsed.data.amount,
          isTaxable: parsed.data.isTaxable,
          effectiveDate: parsed.data.effectiveDate ? new Date(parsed.data.effectiveDate) : new Date(),
          approvalStatus: 'PENDING',
          notes: parsed.data.notes,
        },
        include: {
          employee: { select: { id: true, employeeNumber: true, fullName: true } },
        },
      });

      return apiSuccess(earning, 'One-off earning adjustment recorded (Pending Approval)', 201);
    } else {
      const parsed = otherDeductionSchema.safeParse(body);
      if (!parsed.success) return apiError('Invalid deduction data', 400, parsed.error.format());

      const deduction = await db.otherDeduction.create({
        data: {
          employeeId: parsed.data.employeeId,
          payrollPeriodId: parsed.data.payrollPeriodId || null,
          title: parsed.data.title,
          deductionType: parsed.data.deductionType,
          amount: parsed.data.amount,
          effectiveDate: parsed.data.effectiveDate ? new Date(parsed.data.effectiveDate) : new Date(),
          approvalStatus: 'PENDING',
          notes: parsed.data.notes,
        },
        include: {
          employee: { select: { id: true, employeeNumber: true, fullName: true } },
        },
      });

      return apiSuccess(deduction, 'One-off deduction adjustment recorded (Pending Approval)', 201);
    }
  } catch (error) {
    console.error('Create other adjustment error:', error);
    return apiError('Failed to record payroll adjustment');
  }
}
