import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { LeaveRequestService } from '@/lib/leave/LeaveRequestService';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const parentRequest = await db.leaveRequest.findUnique({
      where: { id: params.id },
    });
    if (!parentRequest) {
      return NextResponse.json({ success: false, error: 'Parent leave request not found.' }, { status: 404 });
    }

    const body = await req.json();
    const extensionRequest = await LeaveRequestService.submitRequest({
      employeeId: parentRequest.employeeId,
      leaveTypeId: parentRequest.leaveTypeId,
      startDate: body.startDate,
      endDate: body.endDate,
      isHalfDay: body.isHalfDay,
      halfDaySession: body.halfDaySession,
      reason: `Extension to ${parentRequest.requestNumber}: ${body.reason || 'Additional days requested'}`,
      isExtension: true,
      parentRequestId: parentRequest.id,
      createdById: user.id,
    });

    return NextResponse.json({ success: true, data: { leaveRequest: extensionRequest } }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating leave extension:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
