import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { KpiService } from '@/lib/performance/KpiService';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const departmentId = searchParams.get('departmentId') || undefined;
    const positionId = searchParams.get('positionId') || undefined;
    const isActiveParam = searchParams.get('isActive');
    const isActive = isActiveParam !== null ? isActiveParam === 'true' : undefined;

    const kpis = await KpiService.listKpiTemplates({ departmentId, positionId, isActive });
    return apiSuccess({ kpis });
  } catch (error: any) {
    console.error('Error listing KPI templates:', error);
    return apiError(error.message || 'Failed to list KPI templates', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['performance.kpis.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    if (!body.name || body.target === undefined) {
      return apiError('KPI name and target value are required.', 400);
    }

    const template = await KpiService.createKpiTemplate({
      name: body.name,
      code: body.code,
      description: body.description,
      departmentId: body.departmentId,
      positionId: body.positionId,
      measurementUnit: body.measurementUnit,
      target: parseFloat(body.target),
      minThreshold: body.minThreshold !== undefined ? parseFloat(body.minThreshold) : undefined,
      maxThreshold: body.maxThreshold !== undefined ? parseFloat(body.maxThreshold) : undefined,
      defaultWeight: body.defaultWeight !== undefined ? parseFloat(body.defaultWeight) : undefined,
      frequency: body.frequency,
      createdById: auth.user.id,
    });

    return apiSuccess({ template }, 'KPI template created successfully', 201);
  } catch (error: any) {
    console.error('Error creating KPI template:', error);
    return apiError(error.message || 'Failed to create KPI template', 400);
  }
}
