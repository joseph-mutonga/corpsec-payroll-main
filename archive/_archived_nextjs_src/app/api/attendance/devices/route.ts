import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { AttendanceDeviceService } from '@/lib/attendance/AttendanceDeviceService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const stationId = searchParams.get('stationId') || undefined;
    const branchId = searchParams.get('branchId') || undefined;
    const isActiveStr = searchParams.get('isActive');
    const isActive = isActiveStr !== null ? isActiveStr === 'true' : undefined;

    const devices = await AttendanceDeviceService.listDevices({ stationId, branchId, isActive });
    return NextResponse.json({ success: true, data: devices });
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
    const device = await AttendanceDeviceService.createDevice({
      ...body,
      createdById: user.id,
    });

    return NextResponse.json({ success: true, data: device }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
