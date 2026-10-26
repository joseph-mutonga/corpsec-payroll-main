import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { AttendanceCorrectionService } from '@/lib/attendance/AttendanceCorrectionService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId') || undefined;
    const status = searchParams.get('status') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;

    const adjustments = await AttendanceCorrectionService.listCorrections({
      employeeId,
      status,
      departmentId,
    });

    return NextResponse.json({
      success: true,
      data: adjustments,
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

    const adjustment = await AttendanceCorrectionService.submitCorrection({
      ...body,
      employeeId,
      requestedById: user.id,
    });

    return NextResponse.json({
      success: true,
      data: adjustment,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
