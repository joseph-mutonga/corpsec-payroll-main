import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { AttendanceAnalyticsService } from '@/lib/attendance/AttendanceAnalyticsService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const [kpis, departmentSummary] = await Promise.all([
      AttendanceAnalyticsService.getCommandCenterKpis(date),
      AttendanceAnalyticsService.getDepartmentSummary(date),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        kpis,
        departmentSummary,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
