import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { overtimeRateConfigSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['overtime_rate.view', 'payroll_config.view', 'payroll.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const rates = await db.overtimeRateConfig.findMany({
      orderBy: { overtimeType: 'asc' },
    });

    return apiSuccess(rates);
  } catch (error) {
    console.error('Fetch overtime rates error:', error);
    return apiError('Failed to fetch overtime rate configurations');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['overtime_rate.manage', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const parsed = overtimeRateConfigSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid overtime rate config data', 400, parsed.error.format());
    }

    const { code, name, overtimeType, rateMultiplier, hourlyDivisor, requiresApproval, effectiveFrom, effectiveTo, status } =
      parsed.data;

    const existing = await db.overtimeRateConfig.findUnique({
      where: { code },
    });

    if (existing) {
      return apiError(`Overtime configuration code "${code}" already exists.`, 409);
    }

    const rate = await db.overtimeRateConfig.create({
      data: {
        code,
        name,
        overtimeType,
        rateMultiplier,
        hourlyDivisor,
        requiresApproval,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        status: status || 'ACTIVE',
      },
    });

    return apiSuccess(rate, 'Overtime rate configuration created successfully', 201);
  } catch (error) {
    console.error('Create overtime rate config error:', error);
    return apiError('Failed to create overtime rate configuration');
  }
}
