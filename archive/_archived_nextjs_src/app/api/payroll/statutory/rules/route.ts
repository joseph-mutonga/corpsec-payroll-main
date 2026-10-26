import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { statutoryRuleSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['statutory.view', 'payroll_config.view', 'payroll.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const rules = await db.statutoryRule.findMany({
      include: {
        taxBands: {
          orderBy: { bandOrder: 'asc' },
        },
      },
      orderBy: { regimeType: 'asc' },
    });

    return apiSuccess(rules);
  } catch (error) {
    console.error('Fetch statutory rules error:', error);
    return apiError('Failed to fetch statutory rules');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['statutory.manage', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const parsed = statutoryRuleSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid statutory rule data', 400, parsed.error.format());
    }

    const {
      regimeType,
      name,
      description,
      calculationType,
      employeeRate,
      employerRate,
      minThreshold,
      maxThreshold,
      capAmount,
      effectiveFrom,
      effectiveTo,
      status,
      rulesConfig,
    } = parsed.data;

    const existing = await db.statutoryRule.findUnique({
      where: { regimeType },
    });

    if (existing) {
      return apiError(`Statutory rule for regime "${regimeType}" already exists. Edit the existing rule instead.`, 409);
    }

    const rule = await db.statutoryRule.create({
      data: {
        regimeType,
        name,
        description,
        calculationType,
        employeeRate,
        employerRate,
        minThreshold: minThreshold ?? 0,
        maxThreshold,
        capAmount,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        status: status || 'ACTIVE',
        rulesConfig,
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'CREATE',
        module: 'PAYROLL',
        entityType: 'STATUTORY_RULE',
        entityId: rule.id,
        newValue: JSON.stringify(rule),
      },
    });

    return apiSuccess(rule, 'Statutory rule created successfully', 201);
  } catch (error) {
    console.error('Create statutory rule error:', error);
    return apiError('Failed to create statutory rule');
  }
}
