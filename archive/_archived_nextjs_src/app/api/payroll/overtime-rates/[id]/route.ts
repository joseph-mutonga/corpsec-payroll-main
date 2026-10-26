import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { overtimeRateConfigSchema } from '@/lib/validation';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['overtime_rate.manage', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const existing = await db.overtimeRateConfig.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return apiError('Overtime rate configuration not found', 404);
    }

    const body = await req.json();
    const parsed = overtimeRateConfigSchema.partial().safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid overtime rate config data', 400, parsed.error.format());
    }

    const data = parsed.data;

    const updated = await db.overtimeRateConfig.update({
      where: { id: params.id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.overtimeType ? { overtimeType: data.overtimeType } : {}),
        ...(data.rateMultiplier !== undefined ? { rateMultiplier: data.rateMultiplier } : {}),
        ...(data.hourlyDivisor !== undefined ? { hourlyDivisor: data.hourlyDivisor } : {}),
        ...(data.requiresApproval !== undefined ? { requiresApproval: data.requiresApproval } : {}),
        ...(data.status ? { status: data.status } : {}),
      },
    });

    return apiSuccess(updated, 'Overtime rate configuration updated successfully');
  } catch (error) {
    console.error('Update overtime rate config error:', error);
    return apiError('Failed to update overtime rate configuration');
  }
}
