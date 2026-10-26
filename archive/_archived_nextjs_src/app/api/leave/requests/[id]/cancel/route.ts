import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { LeaveApprovalService } from '@/lib/leave/LeaveApprovalService';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    if (!body.reason || body.reason.trim().length < 3) {
      return NextResponse.json({ success: false, error: 'Cancellation reason is required.' }, { status: 400 });
    }

    const result = await LeaveApprovalService.cancelApprovedLeave({
      requestId: params.id,
      cancelledByUserId: user.id,
      reason: body.reason.trim(),
    });

    return NextResponse.json({ success: true, data: { request: result } });
  } catch (error: any) {
    console.error('Error cancelling leave request:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
