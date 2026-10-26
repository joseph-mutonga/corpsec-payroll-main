import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { KpiService } from '@/lib/performance/KpiService';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId') || undefined;
    const cycleId = searchParams.get('cycleId') || undefined;
    const kpiId = searchParams.get('kpiId') || undefined;
    const periodName = searchParams.get('periodName') || undefined;

    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (cycleId && cycleId !== 'ALL') where.cycleId = cycleId;
    if (kpiId && kpiId !== 'ALL') where.kpiId = kpiId;
    if (periodName) where.periodName = periodName;

    const measurements = await db.kpiMeasurement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        kpi: true,
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
          },
        },
        verifiedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return apiSuccess({ measurements });
  } catch (error: any) {
    console.error('Error listing KPI measurements:', error);
    return apiError(error.message || 'Failed to list KPI measurements', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['performance.kpis.measure', 'performance.kpis.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    if (!body.kpiId || !body.employeeId || !body.periodName || body.actual === undefined) {
      return apiError('kpiId, employeeId, periodName, and actual value are required.', 400);
    }

    const measurement = await KpiService.recordMeasurement({
      kpiId: body.kpiId,
      employeeId: body.employeeId,
      cycleId: body.cycleId,
      assignmentId: body.assignmentId,
      periodName: body.periodName,
      target: body.target !== undefined ? parseFloat(body.target) : undefined,
      actual: parseFloat(body.actual),
      comments: body.comments,
      verifiedById: auth.user.id,
    });

    return apiSuccess({ measurement }, 'KPI measurement recorded successfully', 201);
  } catch (error: any) {
    console.error('Error recording KPI measurement:', error);
    return apiError(error.message || 'Failed to record KPI measurement', 400);
  }
}
