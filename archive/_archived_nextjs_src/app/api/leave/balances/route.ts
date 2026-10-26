import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { LeaveBalanceService } from '@/lib/leave/LeaveBalanceService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId') || user.employeeId;
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString(), 10);

    if (!employeeId) {
      return NextResponse.json({ success: false, error: 'Employee ID is required.' }, { status: 400 });
    }

    const balances = await LeaveBalanceService.getEmployeeBalances(employeeId, year);
    return NextResponse.json({ success: true, data: { balances } });
  } catch (error: any) {
    console.error('Error fetching employee leave balances:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient privileges to adjust leave balances.' }, { status: 403 });
    }

    const body = await req.json();
    const result = await LeaveBalanceService.performManualAdjustment({
      ...body,
      authorizedById: user.id,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error performing manual balance adjustment:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
