import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { HandoverService } from '@/lib/attendance/HandoverService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const stationId = searchParams.get('stationId') || undefined;
    const employeeId = searchParams.get('employeeId') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const handovers = await HandoverService.listHandovers({
      stationId,
      employeeId,
      startDate,
      endDate,
    });

    return NextResponse.json({
      success: true,
      data: handovers,
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
    const handover = await HandoverService.createHandover({
      ...body,
      createdById: user.id,
    });

    return NextResponse.json({
      success: true,
      data: handover,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
