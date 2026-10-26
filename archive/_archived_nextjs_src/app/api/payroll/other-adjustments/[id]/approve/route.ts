import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['salary.approve', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const action = body.action === 'REJECT' ? 'REJECTED' : 'APPROVED';
    const type = body.type || 'EARNING'; // EARNING or DEDUCTION

    if (type === 'EARNING') {
      const earning = await db.otherEarning.findUnique({ where: { id: params.id } });
      if (!earning) return apiError('Earning record not found', 404);

      const updated = await db.otherEarning.update({
        where: { id: params.id },
        data: {
          approvalStatus: action,
          approvedById: auth.user.id,
          approvedAt: new Date(),
        },
      });

      return apiSuccess(updated, `Earning adjustment ${action.toLowerCase()} successfully`);
    } else {
      const deduction = await db.otherDeduction.findUnique({ where: { id: params.id } });
      if (!deduction) return apiError('Deduction record not found', 404);

      const updated = await db.otherDeduction.update({
        where: { id: params.id },
        data: {
          approvalStatus: action,
          approvedById: auth.user.id,
          approvedAt: new Date(),
        },
      });

      return apiSuccess(updated, `Deduction adjustment ${action.toLowerCase()} successfully`);
    }
  } catch (error) {
    console.error('Approve other adjustment error:', error);
    return apiError('Failed to review payroll adjustment');
  }
}
