import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { OvertimeService } from '@/lib/attendance/OvertimeService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;
    const approvalStatus = searchParams.get('approvalStatus') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const overtimes = await OvertimeService.listOvertime({
      employeeId,
      departmentId,
      approvalStatus,
      startDate,
      endDate,
    });

    return NextResponse.json({
      success: true,
      data: overtimes,
    });
  } catch (error: any) {
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
    const employeeId = body.employeeId || user.employeeId;

    if (!employeeId) {
      return NextResponse.json({ success: false, error: 'Employee ID required' }, { status: 400 });
    }

    const ot = await OvertimeService.requestOvertime({
      ...body,
      employeeId,
      requestedById: user.id,
    });

    return NextResponse.json({
      success: true,
      data: ot,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
