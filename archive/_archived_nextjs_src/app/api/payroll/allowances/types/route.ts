import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { allowanceTypeSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['allowance.view', 'payroll_config.view', 'payroll.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;

    const allowanceTypes = await db.allowanceType.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status } : {}),
      },
      include: {
        _count: {
          select: {
            employeeAllowances: { where: { status: 'ACTIVE' } },
          },
        },
      },
      orderBy: { code: 'asc' },
    });

    return apiSuccess(allowanceTypes);
  } catch (error) {
    console.error('Fetch allowance types error:', error);
    return apiError('Failed to fetch allowance types');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['allowance.create', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const parsed = allowanceTypeSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid allowance type data', 400, parsed.error.format());
    }

    const {
      code,
      name,
      description,
      calculationMethod,
      defaultAmount,
      percentageValue,
      isTaxable,
      isPensionable,
      isRecurring,
      effectiveDate,
      status,
    } = parsed.data;

    const existing = await db.allowanceType.findUnique({
      where: { code },
    });

    if (existing) {
      return apiError(`Allowance type with code "${code}" already exists.`, 409);
    }

    const allowanceType = await db.allowanceType.create({
      data: {
        code,
        name,
        description,
        calculationMethod,
        defaultAmount,
        percentageValue,
        isTaxable,
        isPensionable,
        isRecurring,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
        status,
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'CREATE',
        module: 'PAYROLL',
        entityType: 'ALLOWANCE_TYPE',
        entityId: allowanceType.id,
        newValue: JSON.stringify(allowanceType),
      },
    });

    return apiSuccess(allowanceType, 'Allowance type created successfully', 201);
  } catch (error) {
    console.error('Create allowance type error:', error);
    return apiError('Failed to create allowance type');
  }
}
