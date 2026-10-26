import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { LeaveApprovalService } from '@/lib/leave/LeaveApprovalService';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const isHr = hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager']);
    const isManager = hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager', 'general_manager', 'operations_manager', 'station_commander', 'supervisor']);

    if (!isManager && !isHr) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient privileges to approve leave.' }, { status: 403 });
    }

    let result;
    if (body.level === 'HR' || isHr) {
      result = await LeaveApprovalService.processHrReview({
        requestId: params.id,
        hrUserId: user.id,
        decision: 'APPROVE',
        comments: body.comments,
      });
    } else {
      result = await LeaveApprovalService.processManagerReview({
        requestId: params.id,
        managerUserId: user.id,
        decision: 'APPROVE',
        comments: body.comments,
      });
    }

    return NextResponse.json({ success: true, data: { request: result } });
  } catch (error: any) {
    console.error('Error approving leave request:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
