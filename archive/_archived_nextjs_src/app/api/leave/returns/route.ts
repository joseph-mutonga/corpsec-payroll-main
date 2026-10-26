import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { LeaveReturnService } from '@/lib/leave/LeaveReturnService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const windowDays = parseInt(searchParams.get('days') || '7', 10);

    const returns = await LeaveReturnService.getReturningEmployees(windowDays);
    return NextResponse.json({ success: true, data: { returns } });
  } catch (error: any) {
    console.error('Error fetching returning employees:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager', 'general_manager', 'operations_manager', 'station_commander', 'supervisor'])) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient privileges.' }, { status: 403 });
    }

    const body = await req.json();
    const updated = await LeaveReturnService.recordReturn({
      ...body,
      recordedByUserId: user.id,
    });

    return NextResponse.json({ success: true, data: { request: updated } });
  } catch (error: any) {
    console.error('Error recording return to work:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
