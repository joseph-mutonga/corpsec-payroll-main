import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { RosterService } from '@/lib/attendance/RosterService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') || new Date().toISOString().split('T')[0];
    const endDate = searchParams.get('endDate') || startDate;
    const departmentId = searchParams.get('departmentId') || undefined;
    const stationId = searchParams.get('stationId') || undefined;
    const branchId = searchParams.get('branchId') || undefined;
    const employeeId = searchParams.get('employeeId') || undefined;

    const roster = await RosterService.getTeamRoster({
      startDate,
      endDate,
      departmentId,
      stationId,
      branchId,
      employeeId,
    });

    return NextResponse.json({
      success: true,
      data: roster,
    });
  } catch (error: any) {
    console.error('Error fetching team roster:', error);
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
    const result = await RosterService.bulkAssignRoster({
      ...body,
      createdById: user.id,
    });

    return NextResponse.json({
      success: true,
      data: result,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error in bulk roster assignment:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
