import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { LeaveTypeService } from '@/lib/leave/LeaveTypeService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;

    const leaveTypes = await LeaveTypeService.listLeaveTypes({ status, search });
    return NextResponse.json({ success: true, data: { leaveTypes } });
  } catch (error: any) {
    console.error('Error listing leave types:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient privileges.' }, { status: 403 });
    }

    const body = await req.json();
    const leaveType = await LeaveTypeService.createLeaveType({
      ...body,
      createdById: user.id,
    });

    return NextResponse.json({ success: true, data: { leaveType } }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating leave type:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
