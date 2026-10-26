import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { ReviewService } from '@/lib/performance/ReviewService';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const cycleId = searchParams.get('cycleId') || undefined;
    const employeeId = searchParams.get('employeeId') || undefined;
    const reviewerId = searchParams.get('reviewerId') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;
    const status = searchParams.get('status') || undefined;

    let targetEmployeeId = employeeId;
    let targetReviewerId = reviewerId;

    // Scope check: If pure employee role without HR privileges, only view own reviews
    const isHrOrAdmin =
      auth.session.roles.includes('hr_admin') ||
      auth.session.roles.includes('hr_manager') ||
      auth.session.roles.includes('super_admin');

    if (!isHrOrAdmin && auth.session.roles.includes('employee')) {
      const emp = await db.employee.findFirst({ where: { userId: auth.user.id } });
      if (emp) {
        // Can view either where they are the employee, or where they are the supervisor reviewer
        targetEmployeeId = emp.id;
      }
    }

    const reviews = await ReviewService.listReviews({
      cycleId,
      employeeId: targetEmployeeId,
      reviewerId: targetReviewerId,
      departmentId,
      status,
    });

    return apiSuccess({ reviews });
  } catch (error: any) {
    console.error('Error listing performance reviews:', error);
    return apiError(error.message || 'Failed to list performance reviews', 500);
  }
}
