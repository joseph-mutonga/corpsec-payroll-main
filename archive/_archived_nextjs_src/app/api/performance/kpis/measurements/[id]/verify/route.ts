import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { KpiService } from '@/lib/performance/KpiService';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['performance.kpis.manage', 'performance.kpis.measure']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const updated = await KpiService.verifyMeasurement(params.id, auth.user.id);
    return apiSuccess({ measurement: updated }, 'KPI measurement verified successfully');
  } catch (error: any) {
    console.error('Error verifying KPI measurement:', error);
    return apiError(error.message || 'Failed to verify KPI measurement', 400);
  }
}
