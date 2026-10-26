import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { LeaveRequestService } from '@/lib/leave/LeaveRequestService';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const request = await db.leaveRequest.findUnique({
      where: { id: params.id },
      include: {
        leaveType: true,
        employee: {
          include: { department: true, position: true, branch: true, station: true },
        },
        reliever: { select: { id: true, fullName: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        managerApprovedBy: { select: { id: true, firstName: true, lastName: true } },
        hrApprovedBy: { select: { id: true, firstName: true, lastName: true } },
        documents: true,
      },
    });

    if (!request) {
      return NextResponse.json({ success: false, error: 'Leave request not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { request } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !user.employeeId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    if (body.action === 'WITHDRAW') {
      const result = await LeaveRequestService.withdrawRequest(params.id, user.employeeId, body.reason);
      return NextResponse.json({ success: true, data: { request: result } });
    }

    return NextResponse.json({ success: false, error: 'Invalid action.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
