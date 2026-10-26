import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { TrainingAnalyticsService } from '@/lib/training/TrainingAnalyticsService';
import { CostBudgetService } from '@/lib/training/CostBudgetService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const [kpis, costSummary, deptSummary] = await Promise.all([
      TrainingAnalyticsService.getCommandCenterKpis(),
      CostBudgetService.getCostAnalytics(),
      TrainingAnalyticsService.getDepartmentTrainingSummary(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        kpis,
        costSummary,
        departmentSummary: deptSummary,
      },
    });
  } catch (error: any) {
    console.error('Error fetching training dashboard data:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
