import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';
import { EmployeeLifecycleService } from '@/lib/hr/EmployeeLifecycleService';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth('hr.contracts.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const thresholdDays = parseInt(searchParams.get('days') || '90', 10);

    const contracts = await EmployeeLifecycleService.scanExpiringContracts(thresholdDays);
    return apiSuccess(contracts);
  } catch (error: any) {
    console.error('Error fetching contracts:', error);
    return apiError(error.message || 'Failed to fetch contracts');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth('hr.contracts.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const { employeeId, newStartDate, newEndDate, reason } = body;

    if (!employeeId || !newStartDate || !newEndDate) {
      return apiBadRequest('employeeId, newStartDate, and newEndDate are required');
    }

    const updated = await EmployeeLifecycleService.renewContract(
      employeeId,
      new Date(newStartDate),
      new Date(newEndDate),
      auth.session.userId,
      reason || 'Fixed-term contract extension'
    );

    return apiSuccess(updated);
  } catch (error: any) {
    console.error('Error renewing contract:', error);
    return apiError(error.message || 'Failed to renew contract');
  }
}
