import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { statutoryRuleSchema } from '@/lib/validation';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['statutory.view', 'payroll_config.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const rule = await db.statutoryRule.findUnique({
      where: { id: params.id },
      include: {
        taxBands: { orderBy: { bandOrder: 'asc' } },
      },
    });

    if (!rule) {
      return apiError('Statutory rule not found', 404);
    }

    return apiSuccess(rule);
  } catch (error) {
    console.error('Fetch statutory rule error:', error);
    return apiError('Failed to fetch statutory rule');
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['statutory.manage', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const existing = await db.statutoryRule.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return apiError('Statutory rule not found', 404);
    }

    const body = await req.json();
    const parsed = statutoryRuleSchema.partial().safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid statutory rule data', 400, parsed.error.format());
    }

    const data = parsed.data;

    const updated = await db.statutoryRule.update({
      where: { id: params.id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.calculationType ? { calculationType: data.calculationType } : {}),
        ...(data.employeeRate !== undefined ? { employeeRate: data.employeeRate } : {}),
        ...(data.employerRate !== undefined ? { employerRate: data.employerRate } : {}),
        ...(data.minThreshold !== undefined ? { minThreshold: data.minThreshold } : {}),
        ...(data.maxThreshold !== undefined ? { maxThreshold: data.maxThreshold } : {}),
        ...(data.capAmount !== undefined ? { capAmount: data.capAmount } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.rulesConfig !== undefined ? { rulesConfig: data.rulesConfig } : {}),
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'UPDATE',
        module: 'PAYROLL',
        entityType: 'STATUTORY_RULE',
        entityId: updated.id,
        previousValue: JSON.stringify(existing),
        newValue: JSON.stringify(updated),
      },
    });

    return apiSuccess(updated, 'Statutory rule updated successfully');
  } catch (error) {
    console.error('Update statutory rule error:', error);
    return apiError('Failed to update statutory rule');
  }
}
