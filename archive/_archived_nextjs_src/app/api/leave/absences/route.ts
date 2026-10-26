import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { LeaveAbsenceService } from '@/lib/leave/LeaveAbsenceService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;
    const status = searchParams.get('status') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const absences = await LeaveAbsenceService.listAbsences({
      employeeId,
      departmentId,
      status,
      startDate,
      endDate,
    });

    return NextResponse.json({ success: true, data: { absences } });
  } catch (error: any) {
    console.error('Error listing absences:', error);
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
    const absence = await LeaveAbsenceService.recordAbsence({
      ...body,
      recordedById: user.id,
    });

    return NextResponse.json({ success: true, data: { absence } }, { status: 201 });
  } catch (error: any) {
    console.error('Error recording absence:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager', 'general_manager', 'operations_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient privileges.' }, { status: 403 });
    }

    const body = await req.json();
    const updated = await LeaveAbsenceService.resolveAbsence({
      ...body,
      resolvedById: user.id,
    });

    return NextResponse.json({ success: true, data: { absence: updated } });
  } catch (error: any) {
    console.error('Error resolving absence:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
