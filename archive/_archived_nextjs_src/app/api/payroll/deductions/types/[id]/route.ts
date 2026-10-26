import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { deductionTypeSchema } from '@/lib/validation';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['deduction.view', 'payroll_config.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const item = await db.deductionType.findUnique({
      where: { id: params.id },
      include: {
        employeeDeductions: {
          where: { status: 'ACTIVE' },
          include: {
            employee: { select: { id: true, employeeNumber: true, fullName: true, jobTitle: true } },
          },
        },
      },
    });

    if (!item) {
      return apiError('Deduction type not found', 404);
    }

    return apiSuccess(item);
  } catch (error) {
    console.error('Fetch deduction type error:', error);
    return apiError('Failed to fetch deduction type');
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['deduction.edit', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const existing = await db.deductionType.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return apiError('Deduction type not found', 404);
    }

    const body = await req.json();
    const parsed = deductionTypeSchema.partial().safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid deduction type data', 400, parsed.error.format());
    }

    const data = parsed.data;

    const updated = await db.deductionType.update({
      where: { id: params.id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.calculationMethod ? { calculationMethod: data.calculationMethod } : {}),
        ...(data.isStatutory !== undefined ? { isStatutory: data.isStatutory } : {}),
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
        entityType: 'DEDUCTION_TYPE',
        entityId: updated.id,
        previousValue: JSON.stringify(existing),
        newValue: JSON.stringify(updated),
      },
    });

    return apiSuccess(updated, 'Deduction type updated successfully');
  } catch (error) {
    console.error('Update deduction type error:', error);
    return apiError('Failed to update deduction type');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['deduction.archive', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const existing = await db.deductionType.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return apiError('Deduction type not found', 404);
    }

    const archived = await db.deductionType.update({
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
        entityType: 'DEDUCTION_TYPE',
        entityId: archived.id,
        newValue: JSON.stringify({ status: 'INACTIVE' }),
      },
    });

    return apiSuccess(archived, 'Deduction type archived successfully');
  } catch (error) {
    console.error('Archive deduction type error:', error);
    return apiError('Failed to archive deduction type');
  }
}
