import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { AttendanceReportService } from '@/lib/attendance/AttendanceReportService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'ATTENDANCE_REGISTER';
    const format = (searchParams.get('format') || 'json') as 'json' | 'csv';
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;

    let result: any;
    let filename = `attendance-report-${Date.now()}`;

    switch (type) {
      case 'OVERTIME':
        filename = `overtime-report-${Date.now()}`;
        result = await AttendanceReportService.generateOvertimeReport({
          startDate,
          endDate,
          format,
        });
        break;

      case 'COVERAGE':
        filename = `station-coverage-report-${Date.now()}`;
        result = await AttendanceReportService.generateCoverageReport(startDate || new Date(), format);
        break;

      case 'ATTENDANCE_REGISTER':
      default:
        filename = `attendance-register-${Date.now()}`;
        result = await AttendanceReportService.generateAttendanceRegister({
          startDate,
          endDate,
          departmentId,
          format,
        });
        break;
    }

    if (format === 'csv') {
      return new NextResponse(result, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error generating attendance report:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
