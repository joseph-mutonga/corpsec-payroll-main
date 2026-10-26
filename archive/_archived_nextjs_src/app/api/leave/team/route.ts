import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { LeaveTeamService } from '@/lib/leave/LeaveTeamService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const departmentId = searchParams.get('departmentId') || undefined;
    const asOfDate = searchParams.get('date') ? new Date(searchParams.get('date')!) : new Date();

    const team = await LeaveTeamService.getTeamAvailability(user.employeeId, departmentId, asOfDate);
    return NextResponse.json({ success: true, data: { team } });
  } catch (error: any) {
    console.error('Error fetching team availability:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
