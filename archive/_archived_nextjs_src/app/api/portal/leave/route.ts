import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { LeaveBalanceService } from '@/lib/leave/LeaveBalanceService';
import { LeaveRequestService } from '@/lib/leave/LeaveRequestService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !user.employeeId) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Employee profile required.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString(), 10);

    const [balances, myRequests, leaveTypes] = await Promise.all([
      LeaveBalanceService.getEmployeeBalances(user.employeeId, year),
      db.leaveRequest.findMany({
        where: { employeeId: user.employeeId },
        orderBy: { createdAt: 'desc' },
        include: {
          leaveType: true,
          reliever: { select: { fullName: true } },
          reviewedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      db.leaveType.findMany({
        where: { status: 'ACTIVE', deletedAt: null },
        orderBy: { name: 'asc' },
      }),
    ]);

    const upcomingLeaves = myRequests.filter(
      (r) => ['APPROVED', 'ACTIVE'].includes(r.status) && new Date(r.endDate) >= new Date()
    );

    return NextResponse.json({
      success: true,
      data: {
        balances,
        myRequests,
        upcomingLeaves,
        leaveTypes,
      },
    });
  } catch (error: any) {
    console.error('Error fetching portal leave data:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !user.employeeId) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Employee profile required.' }, { status: 401 });
    }

    const body = await req.json();
    const leaveRequest = await LeaveRequestService.submitRequest({
      ...body,
      employeeId: user.employeeId,
      createdById: user.id,
    });

    return NextResponse.json({ success: true, data: { leaveRequest } }, { status: 201 });
  } catch (error: any) {
    console.error('Error submitting leave from portal:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
