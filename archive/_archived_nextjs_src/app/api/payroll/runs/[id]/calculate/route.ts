import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/response';
import { requireAuth } from '@/lib/permissions';
import { PayrollEngineFacade } from '@/lib/payroll-engine/PayrollEngineFacade';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(req, ['payroll.calculate']);
    if (auth.error) return auth.error;

    const result = await PayrollEngineFacade.execute({
      payrollRunId: params.id,
      userId: auth.user.id,
    });

    return apiSuccess(result, {
      message: `Payroll run ${result.runNumber} calculated successfully for ${result.employeeCount} employees.`,
    });
  } catch (err: any) {
    return apiError(err.message || 'Payroll calculation failed', 500);
  }
}
