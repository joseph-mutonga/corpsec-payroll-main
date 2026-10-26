import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { AttendanceService } from '@/lib/attendance/AttendanceService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;
    const branchId = searchParams.get('branchId') || undefined;
    const stationId = searchParams.get('stationId') || undefined;
    const employeeId = searchParams.get('employeeId') || undefined;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

    const result = await AttendanceService.listAttendance({
      startDate,
      endDate,
      departmentId,
      branchId,
      stationId,
      employeeId,
      status,
      search,
      page,
      pageSize,
    });

    return NextResponse.json({
      success: true,
      data: result.records,
      meta: result.meta,
    });
  } catch (error: any) {
    console.error('Error listing employee attendance:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
