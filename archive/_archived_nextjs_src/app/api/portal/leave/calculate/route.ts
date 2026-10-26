import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { LeaveDayCalculator } from '@/lib/leave/LeaveDayCalculator';
import { LeavePolicyService } from '@/lib/leave/LeavePolicyService';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { startDate, endDate, leaveTypeId, isHalfDay } = body;

    if (!startDate || !endDate || !leaveTypeId) {
      return NextResponse.json({ success: false, error: 'startDate, endDate, and leaveTypeId are required.' }, { status: 400 });
    }

    const employeeId = user.employeeId;
    let excludeWeekends = true;
    let excludeHolidays = true;
    let branchId: string | undefined;
    let stationId: string | undefined;

    if (employeeId) {
      const emp = await db.employee.findUnique({
        where: { id: employeeId },
        select: { branchId: true, stationId: true },
      });
      branchId = emp?.branchId || undefined;
      stationId = emp?.stationId || undefined;

      const policy = await LeavePolicyService.resolvePolicyForEmployee(employeeId, leaveTypeId);
      if (policy) {
        excludeWeekends = policy.excludeWeekends;
        excludeHolidays = policy.excludeHolidays;
      }
    }

    const calculation = await LeaveDayCalculator.calculateWorkingDays(startDate, endDate, {
      excludeWeekends,
      excludeHolidays,
      isHalfDay,
      branchId,
      stationId,
    });

    return NextResponse.json({ success: true, data: { calculation } });
  } catch (error: any) {
    console.error('Error calculating leave days:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
