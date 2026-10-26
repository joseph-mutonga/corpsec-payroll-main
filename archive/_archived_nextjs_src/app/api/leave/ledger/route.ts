import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { LeaveLedgerService } from '@/lib/leave/LeaveLedgerService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId') || user.employeeId;
    const leaveTypeId = searchParams.get('leaveTypeId') || undefined;
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : undefined;

    if (!employeeId) {
      return NextResponse.json({ success: false, error: 'Employee ID is required.' }, { status: 400 });
    }

    // Check permissions if requesting another employee's ledger
    if (employeeId !== user.employeeId && !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager', 'general_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient privileges.' }, { status: 403 });
    }

    const entries = await LeaveLedgerService.listEmployeeLedger(employeeId, leaveTypeId, year);
    return NextResponse.json({ success: true, data: { entries } });
  } catch (error: any) {
    console.error('Error fetching leave ledger movements:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
