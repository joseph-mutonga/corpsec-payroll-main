import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { payrollPeriodSchema } from '@/lib/validation';
import { detectPeriodOverlap } from '@/lib/payroll-config-validator';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['payroll_period.view', 'payroll_config.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const period = await db.payrollPeriod.findUnique({
      where: { id: params.id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        lockedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        otherEarnings: {
          include: {
            employee: { select: { id: true, employeeNumber: true, fullName: true } },
          },
        },
        otherDeductions: {
          include: {
            employee: { select: { id: true, employeeNumber: true, fullName: true } },
          },
        },
      },
    });

    if (!period) {
      return apiError('Payroll period not found', 404);
    }

    return apiSuccess(period);
  } catch (error) {
    console.error('Fetch payroll period details error:', error);
    return apiError('Failed to fetch payroll period');
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['payroll_period.edit', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const existing = await db.payrollPeriod.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return apiError('Payroll period not found', 404);
    }

    if (existing.status === 'LOCKED' || existing.status === 'CLOSED') {
      return apiError(`Cannot edit a payroll period in ${existing.status} status. Unlock it first.`, 400);
    }

    const body = await req.json();
    const parsed = payrollPeriodSchema.partial().safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid payroll period data', 400, parsed.error.format());
    }

    const data = parsed.data;

    // Check overlap if dates are modified
    if (data.startDate && data.endDate) {
      const allPeriods = await db.payrollPeriod.findMany({
        where: { payFrequency: data.payFrequency || existing.payFrequency },
        select: { id: true, startDate: true, endDate: true, status: true },
      });

      const overlap = detectPeriodOverlap(allPeriods, data.startDate, data.endDate, params.id);
      if (overlap.hasOverlap) {
        return apiError('Updated date range overlaps with another active payroll period.', 409);
      }
    }

    const updated = await db.payrollPeriod.update({
      where: { id: params.id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
        ...(data.endDate ? { endDate: new Date(data.endDate) } : {}),
        ...(data.payrollMonth !== undefined ? { payrollMonth: data.payrollMonth } : {}),
        ...(data.payrollYear !== undefined ? { payrollYear: data.payrollYear } : {}),
        ...(data.payFrequency ? { payFrequency: data.payFrequency } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.cutoffDate !== undefined ? { cutoffDate: data.cutoffDate ? new Date(data.cutoffDate) : null } : {}),
        ...(data.paymentDate !== undefined ? { paymentDate: data.paymentDate ? new Date(data.paymentDate) : null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'UPDATE',
        module: 'PAYROLL',
        entityType: 'PAYROLL_PERIOD',
        entityId: updated.id,
        previousValue: JSON.stringify(existing),
        newValue: JSON.stringify(updated),
      },
    });

    return apiSuccess(updated, 'Payroll period updated successfully');
  } catch (error) {
    console.error('Update payroll period error:', error);
    return apiError('Failed to update payroll period');
  }
}
