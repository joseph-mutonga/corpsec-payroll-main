import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { LeaveAnalyticsService } from '@/lib/leave/LeaveAnalyticsService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString(), 10);

    const [kpis, departmentSummary, leaveTypeBreakdown] = await Promise.all([
      LeaveAnalyticsService.getCommandCenterKpis(year),
      LeaveAnalyticsService.getDepartmentLeaveSummary(year),
      LeaveAnalyticsService.getLeaveTypeBreakdown(year),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        kpis,
        departmentSummary,
        leaveTypeBreakdown,
      },
    });
  } catch (error: any) {
    console.error('Error fetching leave analytics:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
