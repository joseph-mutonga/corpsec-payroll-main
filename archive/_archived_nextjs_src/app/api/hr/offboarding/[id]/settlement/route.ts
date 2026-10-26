import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiNotFound, apiSuccess } from '@/lib/response';
import { EmployeeLifecycleService } from '@/lib/hr/EmployeeLifecycleService';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth('hr.offboarding.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const offCase = await db.offboardingCase.findUnique({
      where: { id: params.id },
    });

    if (!offCase) return apiNotFound('Offboarding case not found');

    const settlement = await EmployeeLifecycleService.calculateFinalSettlement(
      offCase.employeeId,
      offCase.exitDate
    );

    return apiSuccess(settlement);
  } catch (error: any) {
    console.error('Error calculating final settlement:', error);
    return apiError(error.message || 'Failed to calculate final settlement');
  }
}
