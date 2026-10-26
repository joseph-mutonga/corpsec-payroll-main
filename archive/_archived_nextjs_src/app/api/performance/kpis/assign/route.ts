import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { KpiService } from '@/lib/performance/KpiService';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['performance.kpis.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    if (!body.kpiId || !body.employeeId || !body.cycleId) {
      return apiError('kpiId, employeeId, and cycleId are required.', 400);
    }

    const assignment = await KpiService.assignKpiToEmployee({
      kpiId: body.kpiId,
      employeeId: body.employeeId,
      cycleId: body.cycleId,
      customTarget: body.customTarget !== undefined ? parseFloat(body.customTarget) : undefined,
      weight: body.weight !== undefined ? parseFloat(body.weight) : undefined,
    });

    return apiSuccess({ assignment }, 'KPI assigned to employee successfully');
  } catch (error: any) {
    console.error('Error assigning KPI to employee:', error);
    return apiError(error.message || 'Failed to assign KPI to employee', 400);
  }
}
