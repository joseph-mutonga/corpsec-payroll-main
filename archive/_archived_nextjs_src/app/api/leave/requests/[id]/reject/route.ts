import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { LeaveApprovalService } from '@/lib/leave/LeaveApprovalService';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager', 'general_manager', 'operations_manager', 'station_commander', 'supervisor'])) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient privileges.' }, { status: 403 });
    }

    const body = await req.json();
    if (!body.reason || body.reason.trim().length < 3) {
      return NextResponse.json({ success: false, error: 'Rejection reason is required.' }, { status: 400 });
    }

    const result = await LeaveApprovalService.rejectRequest(params.id, user.id, body.reason.trim());
    return NextResponse.json({ success: true, data: { request: result } });
  } catch (error: any) {
    console.error('Error rejecting leave request:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
