import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const kpi = await db.kpiTemplate.findUnique({
      where: { id: params.id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, title: true, code: true } },
        _count: { select: { kpiAssignments: true, kpiMeasurements: true } },
      },
    });
    if (!kpi) return apiError('KPI template not found', 404);

    return apiSuccess({ kpi });
  } catch (error: any) {
    console.error('Error fetching KPI template:', error);
    return apiError(error.message || 'Failed to fetch KPI template', 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['performance.kpis.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();

    const updated = await db.kpiTemplate.update({
      where: { id: params.id },
      data: {
        name: body.name,
        description: body.description,
        departmentId: body.departmentId,
        positionId: body.positionId,
        measurementUnit: body.measurementUnit,
        target: body.target !== undefined ? parseFloat(body.target) : undefined,
        minThreshold: body.minThreshold !== undefined ? parseFloat(body.minThreshold) : undefined,
        maxThreshold: body.maxThreshold !== undefined ? parseFloat(body.maxThreshold) : undefined,
        defaultWeight: body.defaultWeight !== undefined ? parseFloat(body.defaultWeight) : undefined,
        frequency: body.frequency,
        isActive: body.isActive,
      },
    });

    await AuditService.log({
      userId: auth.user.id,
      action: 'UPDATE_KPI_TEMPLATE',
      module: 'PERFORMANCE',
      resourceId: params.id,
      newValues: { name: updated.name, target: updated.target },
    });

    return apiSuccess({ kpi: updated }, 'KPI template updated successfully');
  } catch (error: any) {
    console.error('Error updating KPI template:', error);
    return apiError(error.message || 'Failed to update KPI template', 400);
  }
}
