import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { CostBudgetService } from '@/lib/training/CostBudgetService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'finance', 'hr_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const departmentId = searchParams.get('departmentId') || undefined;
    const courseId = searchParams.get('courseId') || undefined;
    const sessionId = searchParams.get('sessionId') || undefined;

    if (searchParams.get('summary') === 'true') {
      const summary = await CostBudgetService.getCostAnalytics(departmentId);
      return NextResponse.json({ success: true, data: summary });
    }

    const costs = await CostBudgetService.listCosts({ departmentId, courseId, sessionId });
    return NextResponse.json({ success: true, data: { costs } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'finance', 'hr_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const cost = await CostBudgetService.recordCost({
      ...body,
      recordedById: user.id,
    });

    return NextResponse.json({ success: true, data: { cost } }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
