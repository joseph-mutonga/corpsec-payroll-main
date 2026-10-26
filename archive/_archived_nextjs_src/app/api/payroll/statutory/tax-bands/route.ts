import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { taxBandSchema } from '@/lib/validation';
import { validateTaxBands } from '@/lib/payroll-config-validator';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['statutory.view', 'payroll_config.view', 'payroll.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const statutoryRuleId = searchParams.get('statutoryRuleId') || undefined;

    const taxBands = await db.taxBand.findMany({
      where: {
        ...(statutoryRuleId ? { statutoryRuleId } : {}),
      },
      include: {
        statutoryRule: { select: { id: true, name: true, regimeType: true } },
      },
      orderBy: { bandOrder: 'asc' },
    });

    return apiSuccess(taxBands);
  } catch (error) {
    console.error('Fetch tax bands error:', error);
    return apiError('Failed to fetch tax bands');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['statutory.manage', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    // Check if body is an array of bands for batch sync or single creation
    if (Array.isArray(body)) {
      const val = validateTaxBands(body);
      if (!val.isValid) {
        return apiError(`Tax band validation failed: ${val.error}`, 400);
      }

      const statutoryRuleId = body[0]?.statutoryRuleId;
      if (!statutoryRuleId) return apiError('statutoryRuleId is required', 400);

      // Replace tax bands in transaction
      await db.$transaction(async (tx) => {
        await tx.taxBand.deleteMany({ where: { statutoryRuleId } });
        for (const b of body) {
          await tx.taxBand.create({
            data: {
              statutoryRuleId,
              bandOrder: b.bandOrder,
              bandName: b.bandName,
              lowerThreshold: b.lowerThreshold,
              upperThreshold: b.upperThreshold ?? null,
              ratePercentage: b.ratePercentage,
              taxReliefMonthly: b.taxReliefMonthly ?? 2400,
              taxReliefAnnual: b.taxReliefAnnual ?? 28800,
              status: b.status || 'ACTIVE',
            },
          });
        }
      });

      const updatedBands = await db.taxBand.findMany({
        where: { statutoryRuleId },
        orderBy: { bandOrder: 'asc' },
      });

      return apiSuccess(updatedBands, 'Progressive tax bands updated successfully');
    }

    const parsed = taxBandSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid tax band data', 400, parsed.error.format());
    }

    const {
      statutoryRuleId,
      bandOrder,
      bandName,
      lowerThreshold,
      upperThreshold,
      ratePercentage,
      taxReliefAnnual,
      taxReliefMonthly,
      status,
    } = parsed.data;

    const band = await db.taxBand.create({
      data: {
        statutoryRuleId,
        bandOrder,
        bandName,
        lowerThreshold,
        upperThreshold: upperThreshold ?? null,
        ratePercentage,
        taxReliefAnnual,
        taxReliefMonthly,
        status: status || 'ACTIVE',
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'CREATE',
        module: 'PAYROLL',
        entityType: 'TAX_BAND',
        entityId: band.id,
        newValue: JSON.stringify(band),
      },
    });

    return apiSuccess(band, 'Tax band created successfully', 201);
  } catch (error) {
    console.error('Create tax band error:', error);
    return apiError('Failed to create tax band');
  }
}
