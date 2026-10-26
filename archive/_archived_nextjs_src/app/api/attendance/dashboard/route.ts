import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { AttendanceAnalyticsService } from '@/lib/attendance/AttendanceAnalyticsService';
import { CoverageService } from '@/lib/attendance/CoverageService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const [kpis, departmentSummary, stationCoverage] = await Promise.all([
      AttendanceAnalyticsService.getCommandCenterKpis(dateStr),
      AttendanceAnalyticsService.getDepartmentSummary(dateStr),
      CoverageService.getStationCoverage(dateStr),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        kpis,
        departmentSummary,
        stationCoverage,
      },
    });
  } catch (error: any) {
    console.error('Error in attendance dashboard API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
