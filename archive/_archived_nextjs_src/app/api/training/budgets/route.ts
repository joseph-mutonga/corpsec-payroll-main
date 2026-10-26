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
    const budgetPeriod = searchParams.get('budgetPeriod') || undefined;

    const budgets = await CostBudgetService.listBudgets(budgetPeriod);
    return NextResponse.json({ success: true, data: { budgets } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'finance'])) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    if (!body.budgetPeriod || !body.departmentId || body.allocatedAmount === undefined) {
      return NextResponse.json(
        { success: false, error: 'Budget Period, Department ID, and Allocated Amount are required.' },
        { status: 400 }
      );
    }

    const budget = await CostBudgetService.setDepartmentBudget({
      ...body,
      approvedById: user.id,
    });

    return NextResponse.json({ success: true, data: { budget } }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
