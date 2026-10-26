import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { employeeAllowanceSchema } from '@/lib/validation';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['allowance.view', 'salary.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const assignment = await db.employeeAllowance.findUnique({
      where: { id: params.id },
      include: {
        employee: true,
        allowanceType: true,
      },
    });

    if (!assignment) {
      return apiError('Employee allowance assignment not found', 404);
    }

    return apiSuccess(assignment);
  } catch (error) {
    console.error('Fetch allowance assignment error:', error);
    return apiError('Failed to fetch allowance assignment');
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['employee_allowance.assign', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const existing = await db.employeeAllowance.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return apiError('Employee allowance assignment not found', 404);
    }

    const body = await req.json();
    const parsed = employeeAllowanceSchema.partial().safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid allowance assignment data', 400, parsed.error.format());
    }

    const data = parsed.data;

    const updated = await db.employeeAllowance.update({
      where: { id: params.id },
      data: {
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.calculationMethod ? { calculationMethod: data.calculationMethod } : {}),
        ...(data.percentageValue !== undefined ? { percentageValue: data.percentageValue } : {}),
        ...(data.effectiveFrom ? { effectiveFrom: new Date(data.effectiveFrom) } : {}),
        ...(data.effectiveTo !== undefined ? { effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null } : {}),
        ...(data.isRecurring !== undefined ? { isRecurring: data.isRecurring } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      include: {
        employee: { select: { id: true, employeeNumber: true, fullName: true } },
        allowanceType: true,
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'UPDATE_ALLOWANCE_ASSIGNMENT',
        module: 'PAYROLL',
        entityType: 'EMPLOYEE_ALLOWANCE',
        entityId: updated.id,
        previousValue: JSON.stringify(existing),
        newValue: JSON.stringify(updated),
      },
    });

    return apiSuccess(updated, 'Allowance assignment updated successfully');
  } catch (error) {
    console.error('Update allowance assignment error:', error);
    return apiError('Failed to update allowance assignment');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['employee_allowance.assign', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const existing = await db.employeeAllowance.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return apiError('Employee allowance assignment not found', 404);
    }

    const deactivated = await db.employeeAllowance.update({
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
        action: 'DEACTIVATE_ALLOWANCE_ASSIGNMENT',
        module: 'PAYROLL',
        entityType: 'EMPLOYEE_ALLOWANCE',
        entityId: deactivated.id,
        newValue: JSON.stringify({ status: 'INACTIVE' }),
      },
    });

    return apiSuccess(deactivated, 'Allowance assignment deactivated');
  } catch (error) {
    console.error('Deactivate allowance assignment error:', error);
    return apiError('Failed to deactivate allowance assignment');
  }
}
