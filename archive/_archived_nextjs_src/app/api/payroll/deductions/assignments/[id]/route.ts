import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { employeeDeductionSchema } from '@/lib/validation';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['deduction.view', 'salary.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const assignment = await db.employeeDeduction.findUnique({
      where: { id: params.id },
      include: {
        employee: true,
        deductionType: true,
      },
    });

    if (!assignment) {
      return apiError('Employee deduction assignment not found', 404);
    }

    return apiSuccess(assignment);
  } catch (error) {
    console.error('Fetch deduction assignment error:', error);
    return apiError('Failed to fetch deduction assignment');
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['employee_deduction.assign', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const existing = await db.employeeDeduction.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return apiError('Employee deduction assignment not found', 404);
    }

    const body = await req.json();
    const parsed = employeeDeductionSchema.partial().safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid deduction assignment data', 400, parsed.error.format());
    }

    const data = parsed.data;

    const updated = await db.employeeDeduction.update({
      where: { id: params.id },
      data: {
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.calculationMethod ? { calculationMethod: data.calculationMethod } : {}),
        ...(data.percentageValue !== undefined ? { percentageValue: data.percentageValue } : {}),
        ...(data.totalTargetAmount !== undefined ? { totalTargetAmount: data.totalTargetAmount } : {}),
        ...(data.currentBalance !== undefined ? { currentBalance: data.currentBalance } : {}),
        ...(data.effectiveFrom ? { effectiveFrom: new Date(data.effectiveFrom) } : {}),
        ...(data.effectiveTo !== undefined ? { effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null } : {}),
        ...(data.isRecurring !== undefined ? { isRecurring: data.isRecurring } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      include: {
        employee: { select: { id: true, employeeNumber: true, fullName: true } },
        deductionType: true,
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'UPDATE_DEDUCTION_ASSIGNMENT',
        module: 'PAYROLL',
        entityType: 'EMPLOYEE_DEDUCTION',
        entityId: updated.id,
        previousValue: JSON.stringify(existing),
        newValue: JSON.stringify(updated),
      },
    });

    return apiSuccess(updated, 'Deduction assignment updated successfully');
  } catch (error) {
    console.error('Update deduction assignment error:', error);
    return apiError('Failed to update deduction assignment');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['employee_deduction.assign', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const existing = await db.employeeDeduction.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return apiError('Employee deduction assignment not found', 404);
    }

    const deactivated = await db.employeeDeduction.update({
      where: { id: params.id },
      data: {
        status: 'INACTIVE',
        effectiveTo: new Date(),
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'DEACTIVATE_DEDUCTION_ASSIGNMENT',
        module: 'PAYROLL',
        entityType: 'EMPLOYEE_DEDUCTION',
        entityId: deactivated.id,
        newValue: JSON.stringify({ status: 'INACTIVE' }),
      },
    });

    return apiSuccess(deactivated, 'Deduction assignment deactivated');
  } catch (error) {
    console.error('Deactivate deduction assignment error:', error);
    return apiError('Failed to deactivate deduction assignment');
  }
}
