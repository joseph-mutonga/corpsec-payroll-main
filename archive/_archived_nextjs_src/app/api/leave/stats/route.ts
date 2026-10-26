import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/auth-helpers';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(['leave.view']);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    const thirtyDaysAhead = new Date(today);
    thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);

    const currentYear = today.getFullYear();

    const [
      onLeaveTodayCount,
      pendingCount,
      upcomingCount,
      entitlementAggregations,
    ] = await Promise.all([
      db.leaveRequest.count({
        where: {
          status: 'APPROVED',
          startDate: { lte: endOfToday },
          endDate: { gte: today },
        },
      }),
      db.leaveRequest.count({
        where: {
          status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
        },
      }),
      db.leaveRequest.count({
        where: {
          status: 'APPROVED',
          startDate: { gt: endOfToday, lte: thirtyDaysAhead },
        },
      }),
      db.leaveEntitlement.aggregate({
        where: { leaveYear: currentYear },
        _sum: {
          entitledDays: true,
          usedDays: true,
          carriedForwardDays: true,
          pendingDays: true,
        },
        _count: {
          id: true,
        },
      }),
    ]);

    return successResponse({
      onLeaveToday: onLeaveTodayCount,
      pendingApprovals: pendingCount,
      upcomingLeaves: upcomingCount,
      expiringCarryForward: entitlementAggregations._sum.carriedForwardDays || 0,
      totalEntitledDaysAllocated: entitlementAggregations._sum.entitledDays || 0,
      totalLeaveDaysUtilized: entitlementAggregations._sum.usedDays || 0,
      totalLeaveDaysPending: entitlementAggregations._sum.pendingDays || 0,
    });
  } catch (error: any) {
    if (error.status) return errorResponse(error.message, error.status);
    console.error('Fetch leave stats error:', error);
    return errorResponse('Failed to fetch leave statistics.');
  }
}
