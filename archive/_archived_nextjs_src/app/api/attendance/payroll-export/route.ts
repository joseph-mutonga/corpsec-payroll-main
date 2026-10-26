import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { AttendancePayrollIntegrationService } from '@/lib/attendance/AttendancePayrollIntegrationService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json({ success: false, error: 'startDate and endDate are required' }, { status: 400 });
    }

    const summaries = await AttendancePayrollIntegrationService.getPeriodAttendanceData(startDate, endDate);

    return NextResponse.json({
      success: true,
      data: summaries,
    });
  } catch (error: any) {
    console.error('Error exporting attendance for payroll:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const result = await AttendancePayrollIntegrationService.lockAttendanceForPayroll(
      body.startDate,
      body.endDate,
      user.id
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
