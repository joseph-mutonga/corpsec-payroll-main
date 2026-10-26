import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { allowanceTypeSchema } from '@/lib/validation';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['allowance.view', 'payroll_config.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const item = await db.allowanceType.findUnique({
      where: { id: params.id },
      include: {
        employeeAllowances: {
          where: { status: 'ACTIVE' },
          include: {
            employee: { select: { id: true, employeeNumber: true, fullName: true, jobTitle: true } },
          },
        },
      },
    });

    if (!item) {
      return apiError('Allowance type not found', 404);
    }

    return apiSuccess(item);
  } catch (error) {
    console.error('Fetch allowance type error:', error);
    return apiError('Failed to fetch allowance type');
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['allowance.edit', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const existing = await db.allowanceType.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return apiError('Allowance type not found', 404);
    }

    const body = await req.json();
    const parsed = allowanceTypeSchema.partial().safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid allowance type data', 400, parsed.error.format());
    }

    const data = parsed.data;

    const updated = await db.allowanceType.update({
      where: { id: params.id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.calculationMethod ? { calculationMethod: data.calculationMethod } : {}),
        ...(data.defaultAmount !== undefined ? { defaultAmount: data.defaultAmount } : {}),
        ...(data.percentageValue !== undefined ? { percentageValue: data.percentageValue } : {}),
        ...(data.isTaxable !== undefined ? { isTaxable: data.isTaxable } : {}),
        ...(data.isPensionable !== undefined ? { isPensionable: data.isPensionable } : {}),
        ...(data.isRecurring !== undefined ? { isRecurring: data.isRecurring } : {}),
        ...(data.status ? { status: data.status } : {}),
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'UPDATE',
        module: 'PAYROLL',
        entityType: 'ALLOWANCE_TYPE',
        entityId: updated.id,
        previousValue: JSON.stringify(existing),
        newValue: JSON.stringify(updated),
      },
    });

    return apiSuccess(updated, 'Allowance type updated successfully');
  } catch (error) {
    console.error('Update allowance type error:', error);
    return apiError('Failed to update allowance type');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['allowance.archive', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const existing = await db.allowanceType.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return apiError('Allowance type not found', 404);
    }

    const archived = await db.allowanceType.update({
      where: { id: params.id },
      data: {
        status: 'INACTIVE',
        deletedAt: new Date(),
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'ARCHIVE',
        module: 'PAYROLL',
        entityType: 'ALLOWANCE_TYPE',
        entityId: archived.id,
        newValue: JSON.stringify({ status: 'INACTIVE' }),
      },
    });

    return apiSuccess(archived, 'Allowance type archived successfully');
  } catch (error) {
    console.error('Archive allowance type error:', error);
    return apiError('Failed to archive allowance type');
  }
}
