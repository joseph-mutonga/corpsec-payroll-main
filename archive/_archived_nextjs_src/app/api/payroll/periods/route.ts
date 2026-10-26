import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { payrollPeriodSchema } from '@/lib/validation';
import { detectPeriodOverlap } from '@/lib/payroll-config-validator';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['payroll_period.view', 'payroll_config.view', 'payroll.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : undefined;
    const status = searchParams.get('status') || undefined;
    const frequency = searchParams.get('frequency') || undefined;

    const periods = await db.payrollPeriod.findMany({
      where: {
        ...(year ? { payrollYear: year } : {}),
        ...(status ? { status } : {}),
        ...(frequency ? { payFrequency: frequency } : {}),
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        lockedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: {
          select: {
            otherEarnings: true,
            otherDeductions: true,
          },
        },
      },
      orderBy: [{ payrollYear: 'desc' }, { payrollMonth: 'desc' }],
    });

    return apiSuccess(periods);
  } catch (error) {
    console.error('Fetch payroll periods error:', error);
    return apiError('Failed to fetch payroll periods');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['payroll_period.create', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const parsed = payrollPeriodSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid payroll period data', 400, parsed.error.format());
    }

    const {
      periodNumber,
      name,
      startDate,
      endDate,
      payrollMonth,
      payrollYear,
      payFrequency,
      status,
      cutoffDate,
      paymentDate,
      notes,
    } = parsed.data;

    // Check duplicate code
    const existing = await db.payrollPeriod.findUnique({
      where: { periodNumber },
    });
    if (existing) {
      return apiError(`Payroll period code "${periodNumber}" already exists.`, 409);
    }

    // Check existing periods for overlaps
    const allPeriods = await db.payrollPeriod.findMany({
      where: { payFrequency },
      select: { id: true, startDate: true, endDate: true, status: true },
    });

    const overlap = detectPeriodOverlap(allPeriods, startDate, endDate);
    if (overlap.hasOverlap) {
      return apiError(
        'The specified date range overlaps with an existing active payroll period.',
        409,
        { overlappingPeriodId: overlap.overlappingPeriodId }
      );
    }

    const period = await db.payrollPeriod.create({
      data: {
        periodNumber,
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        payrollMonth,
        payrollYear,
        payFrequency,
        status: status || 'OPEN',
        cutoffDate: cutoffDate ? new Date(cutoffDate) : null,
        paymentDate: paymentDate ? new Date(paymentDate) : null,
        notes,
        createdById: auth.session.userId,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // Audit Log
    await db.auditLog.create({
      data: {
        userId: auth.session.userId,
        userEmail: auth.session.email,
        action: 'CREATE',
        module: 'PAYROLL',
        entityType: 'PAYROLL_PERIOD',
        entityId: period.id,
        newValue: JSON.stringify({ periodNumber, name, startDate, endDate, status }),
      },
    });

    return apiSuccess(period, 'Payroll period created successfully', 201);
  } catch (error: any) {
    console.error('Create payroll period error:', error);
    return apiError('Failed to create payroll period', 500, error?.message);
  }
}
