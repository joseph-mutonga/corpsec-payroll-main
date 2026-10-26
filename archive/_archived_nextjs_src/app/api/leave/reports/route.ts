import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { LeaveReportService } from '@/lib/leave/LeaveReportService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager', 'payroll_officer', 'general_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient privileges.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'LEAVE_REGISTER';
    const format = (searchParams.get('format') || 'json').toLowerCase() as 'json' | 'csv';
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString(), 10);

    let data: any;
    if (type === 'LEAVE_BALANCES') {
      data = await LeaveReportService.generateLeaveBalances(year, format);
    } else if (type === 'ABSENCE_REPORT') {
      data = await LeaveReportService.generateAbsenceReport(year, format);
    } else {
      data = await LeaveReportService.generateLeaveRegister(year, format);
    }

    if (format === 'csv') {
      return new NextResponse(data, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${type.toLowerCase()}_${year}.csv"`,
        },
      });
    }

    return NextResponse.json({ success: true, data: { report: data } });
  } catch (error: any) {
    console.error('Error generating leave report:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
