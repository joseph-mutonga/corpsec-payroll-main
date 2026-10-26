import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { LeavePayrollIntegrationService } from '@/lib/leave/LeavePayrollIntegrationService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager', 'payroll_officer', 'finance_officer'])) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient privileges.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const departmentId = searchParams.get('departmentId') || undefined;

    if (!startDate || !endDate) {
      return NextResponse.json({ success: false, error: 'startDate and endDate parameters are required.' }, { status: 400 });
    }

    const leaveData = await LeavePayrollIntegrationService.getPeriodLeaveData(startDate, endDate, departmentId);
    return NextResponse.json({ success: true, data: { leaveData } });
  } catch (error: any) {
    console.error('Error fetching payroll leave export:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
