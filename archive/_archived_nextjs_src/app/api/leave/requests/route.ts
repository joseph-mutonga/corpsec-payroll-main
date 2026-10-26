import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { LeaveRequestService } from '@/lib/leave/LeaveRequestService';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;
    const leaveTypeId = searchParams.get('leaveTypeId') || undefined;
    const status = searchParams.get('status') || undefined;
    const approvalStep = searchParams.get('approvalStep') || undefined;
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : undefined;
    const search = searchParams.get('search') || undefined;

    const where: any = {};

    if (employeeId) where.employeeId = employeeId;
    if (leaveTypeId && leaveTypeId !== 'ALL') where.leaveTypeId = leaveTypeId;
    if (status && status !== 'ALL') where.status = status;
    if (approvalStep && approvalStep !== 'ALL') where.approvalStep = approvalStep;
    if (year) where.leaveYear = year;

    if (departmentId && departmentId !== 'ALL') {
      where.employee = { departmentId };
    }

    if (search) {
      const q = search.trim();
      where.OR = [
        { requestNumber: { contains: q } },
        { reason: { contains: q } },
        { employee: { fullName: { contains: q } } },
        { employee: { employeeNumber: { contains: q } } },
      ];
    }

    const requests = await db.leaveRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        leaveType: true,
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            primaryPhone: true,
            department: { select: { id: true, name: true } },
            station: { select: { id: true, name: true } },
            position: { select: { id: true, title: true } },
          },
        },
        reliever: { select: { id: true, fullName: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        managerApprovedBy: { select: { id: true, firstName: true, lastName: true } },
        hrApprovedBy: { select: { id: true, firstName: true, lastName: true } },
        documents: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: requests,
      requests,
    });
  } catch (error: any) {
    console.error('Error listing leave requests:', error);
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
      return NextResponse.json({ success: false, error: 'Employee identity could not be resolved.' }, { status: 400 });
    }

    const leaveRequest = await LeaveRequestService.submitRequest({
      ...body,
      employeeId,
      createdById: user.id,
    });

    return NextResponse.json({ success: true, data: { leaveRequest } }, { status: 201 });
  } catch (error: any) {
    console.error('Error submitting leave request:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
