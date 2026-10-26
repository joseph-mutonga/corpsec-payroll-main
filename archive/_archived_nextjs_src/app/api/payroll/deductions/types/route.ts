import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { deductionTypeSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['deduction.view', 'payroll_config.view', 'payroll.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;

    const deductionTypes = await db.deductionType.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status } : {}),
      },
      include: {
        _count: {
          select: {
            employeeDeductions: { where: { status: 'ACTIVE' } },
          },
        },
      },
      orderBy: { code: 'asc' },
    });

    return apiSuccess(deductionTypes);
  } catch (error) {
    console.error('Fetch deduction types error:', error);
    return apiError('Failed to fetch deduction types');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['deduction.create', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const parsed = deductionTypeSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid deduction type data', 400, parsed.error.format());
    }

    const {
      code,
      name,
      description,
      calculationMethod,
      isStatutory,
      isRecurring,
      effectiveDate,
      status,
    } = parsed.data;

    const existing = await db.deductionType.findUnique({
      where: { code },
    });

    if (existing) {
      return apiError(`Deduction type with code "${code}" already exists.`, 409);
    }

    const deductionType = await db.deductionType.create({
      data: {
        code,
        name,
        description,
        calculationMethod,
        isStatutory,
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
        entityType: 'DEDUCTION_TYPE',
        entityId: deductionType.id,
        newValue: JSON.stringify(deductionType),
      },
    });

    return apiSuccess(deductionType, 'Deduction type created successfully', 201);
  } catch (error) {
    console.error('Create deduction type error:', error);
    return apiError('Failed to create deduction type');
  }
}
