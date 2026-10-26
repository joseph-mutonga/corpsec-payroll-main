import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/response';
import { requireAuth } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['payroll.view']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const periodId = searchParams.get('periodId');
    const status = searchParams.get('status');
    const runType = searchParams.get('runType');

    const where: any = {};
    if (periodId) where.payrollPeriodId = periodId;
    if (status) where.status = status;
    if (runType) where.runType = runType;

    const runs = await prisma.payrollRun.findMany({
      where,
      include: {
        payrollPeriod: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        calculatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: {
          select: {
            employeeRecords: true,
            exceptions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return apiSuccess(runs, { total: runs.length });
  } catch (err: any) {
    return apiError(err.message || 'Failed to fetch payroll runs', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['payroll.create']);
    if (auth.error) return auth.error;

    const body = await req.json();
    const { payrollPeriodId, runType = 'REGULAR', notes } = body;

    if (!payrollPeriodId) {
      return apiError('Payroll period ID is required', 400);
    }

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: payrollPeriodId },
    });

    if (!period) {
      return apiError('Payroll period not found', 404);
    }

    // Generate unique run number e.g. PAY-2026-08-01 or PAY-2026-08-SUP-01
    const runCount = await prisma.payrollRun.count({
      where: { payrollPeriodId },
    });

    const prefix = runType === 'REGULAR' ? 'REG' : runType === 'SUPPLEMENTARY' ? 'SUP' : 'ADJ';
    const runNumber = `PAY-${period.payrollYear}-${String(period.payrollMonth).padStart(2, '0')}-${prefix}-${String(runCount + 1).padStart(2, '0')}`;

    const newRun = await prisma.payrollRun.create({
      data: {
        runNumber,
        payrollPeriodId,
        runType,
        status: 'DRAFT',
        notes,
        createdById: auth.user.id,
      },
      include: {
        payrollPeriod: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'CREATE_PAYROLL_RUN',
        module: 'PAYROLL',
        entityType: 'PAYROLL_RUN',
        entityId: newRun.id,
        newValue: JSON.stringify({ runNumber, runType, period: period.name }),
      },
    });

    return apiSuccess(newRun, undefined, 201);
  } catch (err: any) {
    return apiError(err.message || 'Failed to create payroll run', 500);
  }
}
