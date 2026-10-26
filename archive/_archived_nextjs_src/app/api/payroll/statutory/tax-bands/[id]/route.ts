import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { taxBandSchema } from '@/lib/validation';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['statutory.manage', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const existing = await db.taxBand.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return apiError('Tax band not found', 404);
    }

    const body = await req.json();
    const parsed = taxBandSchema.partial().safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid tax band data', 400, parsed.error.format());
    }

    const data = parsed.data;

    const updated = await db.taxBand.update({
      where: { id: params.id },
      data: {
        ...(data.bandOrder !== undefined ? { bandOrder: data.bandOrder } : {}),
        ...(data.bandName ? { bandName: data.bandName } : {}),
        ...(data.lowerThreshold !== undefined ? { lowerThreshold: data.lowerThreshold } : {}),
        ...(data.upperThreshold !== undefined ? { upperThreshold: data.upperThreshold } : {}),
        ...(data.ratePercentage !== undefined ? { ratePercentage: data.ratePercentage } : {}),
        ...(data.taxReliefAnnual !== undefined ? { taxReliefAnnual: data.taxReliefAnnual } : {}),
        ...(data.taxReliefMonthly !== undefined ? { taxReliefMonthly: data.taxReliefMonthly } : {}),
        ...(data.status ? { status: data.status } : {}),
      },
    });

    return apiSuccess(updated, 'Tax band updated successfully');
  } catch (error) {
    console.error('Update tax band error:', error);
    return apiError('Failed to update tax band');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['statutory.manage', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const existing = await db.taxBand.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return apiError('Tax band not found', 404);
    }

    await db.taxBand.delete({
      where: { id: params.id },
    });

    return apiSuccess(null, 'Tax band removed successfully');
  } catch (error) {
    console.error('Delete tax band error:', error);
    return apiError('Failed to delete tax band');
  }
}
